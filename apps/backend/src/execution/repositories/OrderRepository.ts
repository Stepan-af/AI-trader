/**
 * Order Repository
 * Data access layer for execution.orders table
 * Implements type-safe database operations per ARCHITECTURE.md
 */

import type { Order, OrderSide, OrderStatus, OrderType } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';

interface OrderRow {
  id: string;
  user_id: string;
  strategy_id: string | null;
  symbol: string;
  side: string;
  type: string;
  quantity: string;
  price: string | null;
  status: string;
  filled_quantity: string;
  avg_fill_price: string | null;
  exchange_order_id: string | null;
  created_at: string;
  updated_at: string;
  queued_at: string | null;
}

export interface CreateOrderParams {
  userId: string;
  strategyId: string | null;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
  quantity: number;
  price: number | null;
}

export interface UpdateOrderStatusParams {
  id: string;
  status: OrderStatus;
  exchangeOrderId?: string;
  filledQuantity?: number;
  avgFillPrice?: number;
  queuedAt?: Date | null;
}

export interface UpdateOrderFillParams {
  id: string;
  status: OrderStatus;
  filledQuantity: number;
  avgFillPrice: number;
}

export class OrderRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create new order in NEW status
   * Returns order with generated UUID
   */
  async create(params: CreateOrderParams, client?: PoolClient): Promise<Order> {
    const db = client || this.pool;

    const query = `
      INSERT INTO execution.orders (
        user_id, strategy_id, symbol, side, type, quantity, price, status, filled_quantity
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'NEW', 0)
      RETURNING
        id, user_id, strategy_id, symbol, side, type, quantity, price,
        status, filled_quantity, avg_fill_price, exchange_order_id,
        created_at, updated_at, queued_at
    `;

    const result = await db.query(query, [
      params.userId,
      params.strategyId,
      params.symbol,
      params.side,
      params.type,
      params.quantity,
      params.price,
    ]);

    return this.mapRowToOrder(result.rows[0] as OrderRow);
  }

  /**
   * Find order by ID
   */
  async findById(id: string, client?: PoolClient): Promise<Order | null> {
    const db = client || this.pool;

    const query = `
      SELECT
        id, user_id, strategy_id, symbol, side, type, quantity, price,
        status, filled_quantity, avg_fill_price, exchange_order_id,
        created_at, updated_at, queued_at
      FROM execution.orders
      WHERE id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToOrder(result.rows[0] as OrderRow);
  }

  /**
   * Find orders by user ID
   */
  async findByUserId(userId: string, limit = 100, offset = 0): Promise<Order[]> {
    const query = `
      SELECT
        id, user_id, strategy_id, symbol, side, type, quantity, price,
        status, filled_quantity, avg_fill_price, exchange_order_id,
        created_at, updated_at, queued_at
      FROM execution.orders
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.pool.query(query, [userId, limit, offset]);

    return result.rows.map((row) => this.mapRowToOrder(row as OrderRow));
  }

  /**
   * Update order status and related fields
   * Used for state transitions
   */
  async updateStatus(params: UpdateOrderStatusParams, client?: PoolClient): Promise<Order> {
    const db = client || this.pool;

    const updates: string[] = ['status = $2', 'updated_at = NOW()'];
    const values: unknown[] = [params.id, params.status];
    let paramIndex = 3;

    if (params.exchangeOrderId !== undefined) {
      updates.push(`exchange_order_id = $${paramIndex}`);
      values.push(params.exchangeOrderId);
      paramIndex++;
    }

    if (params.filledQuantity !== undefined) {
      updates.push(`filled_quantity = $${paramIndex}`);
      values.push(params.filledQuantity);
      paramIndex++;
    }

    if (params.avgFillPrice !== undefined) {
      updates.push(`avg_fill_price = $${paramIndex}`);
      values.push(params.avgFillPrice);
      paramIndex++;
    }

    if (params.queuedAt !== undefined) {
      updates.push(`queued_at = $${paramIndex}`);
      values.push(params.queuedAt);
      paramIndex++;
    }

    const query = `
      UPDATE execution.orders
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING
        id, user_id, strategy_id, symbol, side, type, quantity, price,
        status, filled_quantity, avg_fill_price, exchange_order_id,
        created_at, updated_at, queued_at
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error(`Order not found: ${params.id}`);
    }

    return this.mapRowToOrder(result.rows[0] as OrderRow);
  }

  /**
   * Find orders by status
   * Used for reconciliation and recovery
   */
  async findByStatus(status: OrderStatus[], limit = 1000): Promise<Order[]> {
    const query = `
      SELECT
        id, user_id, strategy_id, symbol, side, type, quantity, price,
        status, filled_quantity, avg_fill_price, exchange_order_id,
        created_at, updated_at, queued_at
      FROM execution.orders
      WHERE status = ANY($1)
      ORDER BY created_at ASC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [status, limit]);

    return result.rows.map((row) => this.mapRowToOrder(row as OrderRow));
  }

  /**
   * Find non-final orders for reconciliation
   * Returns orders in SUBMITTED, OPEN, PARTIALLY_FILLED, CANCELING states
   * from the last 24 hours (older orders assumed final)
   */
  async findNonFinalOrders(hoursBack = 24): Promise<Order[]> {
    const query = `
      SELECT
        id, user_id, strategy_id, symbol, side, type, quantity, price,
        status, filled_quantity, avg_fill_price, exchange_order_id,
        created_at, updated_at, queued_at
      FROM execution.orders
      WHERE status IN ('SUBMITTED', 'OPEN', 'PARTIALLY_FILLED', 'CANCELING')
        AND created_at > NOW() - INTERVAL '${hoursBack} hours'
      ORDER BY created_at ASC
    `;

    const result = await this.pool.query(query);

    return result.rows.map((row) => this.mapRowToOrder(row as OrderRow));
  }

  /**
   * Update order with fill data
   * Used when processing fills to update filled_quantity, avg_fill_price, and status
   */
  async updateFill(params: UpdateOrderFillParams, client?: PoolClient): Promise<Order> {
    const db = client || this.pool;

    const query = `
      UPDATE execution.orders
      SET
        status = $2,
        filled_quantity = $3,
        avg_fill_price = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id, user_id, strategy_id, symbol, side, type, quantity, price,
        status, filled_quantity, avg_fill_price, exchange_order_id,
        created_at, updated_at, queued_at
    `;

    const result = await db.query(query, [
      params.id,
      params.status,
      params.filledQuantity,
      params.avgFillPrice,
    ]);

    if (result.rows.length === 0) {
      throw new Error(`Order not found: ${params.id}`);
    }

    return this.mapRowToOrder(result.rows[0] as OrderRow);
  }

  /**
   * Map database row to Order domain object
   */
  private mapRowToOrder(row: OrderRow): Order {
    return {
      id: row.id,
      userId: row.user_id,
      strategyId: row.strategy_id,
      symbol: row.symbol,
      side: row.side as OrderSide,
      type: row.type as OrderType,
      quantity: parseFloat(row.quantity),
      price: row.price ? parseFloat(row.price) : null,
      status: row.status as OrderStatus,
      filledQuantity: parseFloat(row.filled_quantity),
      avgFillPrice: row.avg_fill_price ? parseFloat(row.avg_fill_price) : null,
      exchangeOrderId: row.exchange_order_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      queuedAt: row.queued_at ? new Date(row.queued_at) : null,
    };
  }
}
