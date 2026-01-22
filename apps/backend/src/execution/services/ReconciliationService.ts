/**
 * Reconciliation Service
 * Ensures database state matches exchange reality
 * Implements periodic sync, crash recovery, and conflict resolution per ARCHITECTURE.md
 */

import type { Order, OrderStatus } from '@ai-trader/shared';
import type { Pool } from 'pg';
import type { BinanceAdapter } from '../adapters/binance/BinanceAdapter';
import type {
  BinanceOrderQueryResponse,
  BinanceOrderStatus,
  BinanceTrade,
} from '../adapters/binance/types';
import { FillRepository } from '../repositories/FillRepository';
import { OrderRepository } from '../repositories/OrderRepository';
import { OrderService } from './OrderService';

export interface ReconciliationAction {
  orderId: string;
  exchangeOrderId: string | null;
  action:
    | 'NO_CHANGE'
    | 'STATE_UPDATED'
    | 'FILLS_ADDED'
    | 'ORDER_RESUBMITTED'
    | 'CANCEL_RETRIED'
    | 'MARKED_REJECTED'
    | 'CRITICAL_DISCREPANCY';
  dbStatus: OrderStatus;
  exchangeStatus: string | null;
  dbFilledQty: number;
  exchangeFilledQty: number | null;
  fillsAddedCount: number;
  details: Record<string, unknown>;
}

export interface ReconciliationResult {
  ordersReconciled: number;
  actionsPerformed: ReconciliationAction[];
  errors: Array<{ orderId: string; error: string }>;
  durationMs: number;
}

/**
 * Map Binance order status to our internal status
 */
function mapBinanceStatus(binanceStatus: BinanceOrderStatus): OrderStatus {
  switch (binanceStatus) {
    case 'NEW':
      return 'OPEN';
    case 'PARTIALLY_FILLED':
      return 'PARTIALLY_FILLED';
    case 'FILLED':
      return 'FILLED';
    case 'CANCELED':
      return 'CANCELED';
    case 'PENDING_CANCEL':
      return 'OPEN'; // Treat as still OPEN since cancel not yet processed
    case 'REJECTED':
      return 'REJECTED';
    case 'EXPIRED':
      return 'EXPIRED';
    default:
      throw new Error(`Unknown Binance status: ${binanceStatus as string}`);
  }
}

export class ReconciliationService {
  private readonly pool: Pool;
  private readonly binanceAdapter: BinanceAdapter;
  private readonly orderRepository: OrderRepository;
  private readonly fillRepository: FillRepository;
  private readonly orderService: OrderService;
  private reconciliationInterval: NodeJS.Timeout | null = null;
  private isReconciling = false;

  constructor(
    pool: Pool,
    binanceAdapter: BinanceAdapter,
    orderService: OrderService,
    orderRepository?: OrderRepository,
    fillRepository?: FillRepository
  ) {
    this.pool = pool;
    this.binanceAdapter = binanceAdapter;
    this.orderService = orderService;
    this.orderRepository = orderRepository || new OrderRepository(pool);
    this.fillRepository = fillRepository || new FillRepository(pool);
  }

  /**
   * Start periodic reconciliation (every 60 seconds)
   */
  start(): void {
    if (this.reconciliationInterval) {
      // eslint-disable-next-line no-console
      console.warn('Reconciliation already started');
      return;
    }

    // eslint-disable-next-line no-console
    console.log('Starting reconciliation service (60s interval)');

    // Run immediately on start
    void this.reconcile('PERIODIC').catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Initial reconciliation failed:', error);
    });

    // Then run every 60 seconds
    this.reconciliationInterval = setInterval(() => {
      if (!this.isReconciling) {
        void this.reconcile('PERIODIC').catch((error) => {
          // eslint-disable-next-line no-console
          console.error('Periodic reconciliation failed:', error);
        });
      } else {
        // eslint-disable-next-line no-console
        console.warn('Skipping reconciliation cycle (previous cycle still running)');
      }
    }, 60_000);
  }

  /**
   * Stop periodic reconciliation
   */
  stop(): void {
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
      this.reconciliationInterval = null;
      // eslint-disable-next-line no-console
      console.log('Reconciliation service stopped');
    }
  }

  /**
   * Run full reconciliation
   * Called periodically or on demand (e.g., crash recovery)
   */
  async reconcile(
    trigger: 'PERIODIC' | 'CRASH_RECOVERY' | 'MANUAL'
  ): Promise<ReconciliationResult> {
    if (this.isReconciling) {
      throw new Error('Reconciliation already in progress');
    }

    this.isReconciling = true;
    const startTime = Date.now();

    // eslint-disable-next-line no-console
    console.log(`Starting reconciliation (trigger: ${trigger})`);

    const actions: ReconciliationAction[] = [];
    const errors: Array<{ orderId: string; error: string }> = [];

    try {
      // Get all non-final orders from last 24 hours
      const orders = await this.orderRepository.findNonFinalOrders(24);

      // eslint-disable-next-line no-console
      console.log(`Found ${orders.length} non-final orders to reconcile`);

      // Process orders in batches to respect rate limits
      // Rate limiter in adapter handles this automatically
      for (const order of orders) {
        try {
          const action = await this.reconcileOrder(order);
          actions.push(action);

          // Log reconciliation action
          await this.logReconciliationAction(action);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          // eslint-disable-next-line no-console
          console.error(`Failed to reconcile order ${order.id}:`, errorMessage);
          errors.push({ orderId: order.id, error: errorMessage });
        }
      }

      const durationMs = Date.now() - startTime;

      // eslint-disable-next-line no-console
      console.log(
        `Reconciliation complete (${durationMs}ms, ${orders.length} orders, ${actions.length} actions, ${errors.length} errors)`
      );

      return {
        ordersReconciled: orders.length,
        actionsPerformed: actions,
        errors,
        durationMs,
      };
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Reconcile single order
   * Implements conflict resolution rules per ARCHITECTURE.md
   */
  private async reconcileOrder(order: Order): Promise<ReconciliationAction> {
    // If order doesn't have exchange ID yet, it's still being submitted
    if (!order.exchangeOrderId) {
      return this.handleOrderWithoutExchangeId(order);
    }

    // Query exchange for current order state
    const exchangeOrder = await this.binanceAdapter.queryOrder(
      order.symbol,
      parseInt(order.exchangeOrderId, 10)
    );

    // Get all fills from exchange
    const exchangeTrades = await this.binanceAdapter.getOrderTrades(
      order.symbol,
      parseInt(order.exchangeOrderId, 10)
    );

    // Reconcile state and fills
    return this.reconcileWithExchangeState(order, exchangeOrder, exchangeTrades);
  }

  /**
   * Handle orders that don't have exchange_order_id yet
   * Per ARCHITECTURE.md: Resubmit if < 5 min, reject if > 5 min
   */
  private handleOrderWithoutExchangeId(order: Order): ReconciliationAction {
    const orderAge = Date.now() - order.createdAt.getTime();
    const fiveMinutes = 5 * 60 * 1000;

    const action: ReconciliationAction = {
      orderId: order.id,
      exchangeOrderId: null,
      action: 'NO_CHANGE',
      dbStatus: order.status,
      exchangeStatus: null,
      dbFilledQty: order.filledQuantity,
      exchangeFilledQty: null,
      fillsAddedCount: 0,
      details: { orderAge, threshold: fiveMinutes },
    };

    if (orderAge > fiveMinutes) {
      // Mark as REJECTED (submission lost)
      // eslint-disable-next-line no-console
      console.warn(
        `Order ${order.id} in ${order.status} for > 5 minutes without exchange ID, marking as REJECTED`
      );

      void this.orderService.transitionOrder({
        orderId: order.id,
        newStatus: 'REJECTED',
        metadata: { reason: 'SUBMISSION_TIMEOUT', reconciliation: true },
      });

      action.action = 'MARKED_REJECTED';
      action.details.reason = 'SUBMISSION_TIMEOUT';
    } else if (order.status === 'SUBMITTED') {
      // Still within grace period, log and wait
      // eslint-disable-next-line no-console
      console.log(
        `Order ${order.id} in SUBMITTED for ${Math.round(orderAge / 1000)}s, waiting for exchange confirmation`
      );
    }

    return action;
  }

  /**
   * Reconcile order with exchange state
   * Implements conflict resolution rules per ARCHITECTURE.md priority order
   */
  private async reconcileWithExchangeState(
    order: Order,
    exchangeOrder: BinanceOrderQueryResponse,
    exchangeTrades: BinanceTrade[]
  ): Promise<ReconciliationAction> {
    const exchangeStatus = exchangeOrder.status as BinanceOrderStatus;
    const mappedStatus = mapBinanceStatus(exchangeStatus);
    const exchangeFilledQty = parseFloat(exchangeOrder.executedQty);

    const action: ReconciliationAction = {
      orderId: order.id,
      exchangeOrderId: order.exchangeOrderId,
      action: 'NO_CHANGE',
      dbStatus: order.status,
      exchangeStatus: exchangeStatus,
      dbFilledQty: order.filledQuantity,
      exchangeFilledQty: exchangeFilledQty,
      fillsAddedCount: 0,
      details: {},
    };

    // Rule 1: Exchange final states are authoritative
    if (['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(exchangeStatus)) {
      return this.handleExchangeFinalState(order, mappedStatus, exchangeTrades, action);
    }

    // Rule 2: Partial fill differences (emit missing fills)
    if (exchangeFilledQty > order.filledQuantity) {
      return this.handleMissingFills(order, exchangeTrades, exchangeFilledQty, action);
    }

    // Rule 3: Critical discrepancy (DB has more fills than exchange)
    if (order.filledQuantity > exchangeFilledQty) {
      // eslint-disable-next-line no-console
      console.error(
        `CRITICAL: Order ${order.id} has more fills in DB (${order.filledQuantity}) than exchange (${exchangeFilledQty})`
      );
      action.action = 'CRITICAL_DISCREPANCY';
      action.details = {
        error: 'DB_FILLED_QTY_EXCEEDS_EXCHANGE',
        dbFilledQty: order.filledQuantity,
        exchangeFilledQty,
      };
      return action;
    }

    // Rule 4: State mismatch (non-final states)
    if (order.status !== mappedStatus) {
      // eslint-disable-next-line no-console
      console.log(
        `Order ${order.id} state mismatch: DB=${order.status}, Exchange=${exchangeStatus}, updating to ${mappedStatus}`
      );

      await this.orderService.transitionOrder({
        orderId: order.id,
        newStatus: mappedStatus,
        metadata: { reconciliation: true, exchangeStatus },
      });

      action.action = 'STATE_UPDATED';
      action.details = { previousStatus: order.status, newStatus: mappedStatus };
    }

    return action;
  }

  /**
   * Handle exchange final states (FILLED, CANCELED, REJECTED, EXPIRED)
   * Per ARCHITECTURE.md: Exchange final states are authoritative
   */
  private async handleExchangeFinalState(
    order: Order,
    mappedStatus: OrderStatus,
    exchangeTrades: BinanceTrade[],
    action: ReconciliationAction
  ): Promise<ReconciliationAction> {
    // Update state if different
    if (order.status !== mappedStatus) {
      // eslint-disable-next-line no-console
      console.log(`Order ${order.id} reached final state on exchange: ${mappedStatus}`);

      await this.orderService.transitionOrder({
        orderId: order.id,
        newStatus: mappedStatus,
        metadata: { reconciliation: true },
      });

      action.action = 'STATE_UPDATED';
      action.details = { previousStatus: order.status, newStatus: mappedStatus };
    }

    // Emit missing fills (if any)
    if (exchangeTrades.length > 0) {
      const fillsAdded = await this.addMissingFills(order, exchangeTrades);

      if (fillsAdded > 0) {
        action.action = 'FILLS_ADDED';
        action.fillsAddedCount = fillsAdded;
        action.details.fillsAdded = fillsAdded;
      }
    }

    return action;
  }

  /**
   * Handle missing fills (gap recovery)
   * Per ARCHITECTURE.md: Emit fill events, deduplication via unique constraint
   */
  private async handleMissingFills(
    order: Order,
    exchangeTrades: BinanceTrade[],
    exchangeFilledQty: number,
    action: ReconciliationAction
  ): Promise<ReconciliationAction> {
    // eslint-disable-next-line no-console
    console.log(
      `Order ${order.id} has missing fills: DB=${order.filledQuantity}, Exchange=${exchangeFilledQty}`
    );

    const fillsAdded = await this.addMissingFills(order, exchangeTrades);

    action.action = 'FILLS_ADDED';
    action.fillsAddedCount = fillsAdded;
    action.details = {
      dbFilledQty: order.filledQuantity,
      exchangeFilledQty,
      fillsAdded,
    };

    return action;
  }

  /**
   * Add missing fills from exchange trades
   * Uses FillRepository which handles deduplication via exchange_fill_id unique constraint
   */
  private async addMissingFills(order: Order, exchangeTrades: BinanceTrade[]): Promise<number> {
    let fillsAdded = 0;

    for (const trade of exchangeTrades) {
      try {
        // Attempt to create fill (deduplication handled by unique constraint)
        await this.fillRepository.create({
          orderId: order.id,
          exchangeFillId: trade.id.toString(),
          price: parseFloat(trade.price),
          quantity: parseFloat(trade.qty),
          fee: parseFloat(trade.commission),
          feeAsset: trade.commissionAsset,
          timestamp: new Date(trade.time),
          source: 'RECONCILIATION',
        });

        fillsAdded++;
      } catch (error) {
        // Ignore duplicate fill errors (unique constraint violation)
        if (error instanceof Error && error.message.includes('exchange_fill_id')) {
          // Fill already exists, skip
          continue;
        }

        // Re-throw other errors
        throw error;
      }
    }

    return fillsAdded;
  }

  /**
   * Log reconciliation action to audit table
   */
  private async logReconciliationAction(action: ReconciliationAction): Promise<void> {
    const query = `
      INSERT INTO execution.order_reconciliation_log (
        order_id, exchange_order_id, action, db_status, exchange_status,
        db_filled_qty, exchange_filled_qty, fills_added_count, details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.pool.query(query, [
      action.orderId,
      action.exchangeOrderId,
      action.action,
      action.dbStatus,
      action.exchangeStatus,
      action.dbFilledQty,
      action.exchangeFilledQty,
      action.fillsAddedCount,
      JSON.stringify(action.details),
    ]);
  }
}
