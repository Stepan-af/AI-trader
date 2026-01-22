/**
 * Order Service
 * Core business logic for order state machine
 * Implements state transitions and event persistence per ARCHITECTURE.md
 */

import type { Pool } from 'pg';
import type { Order, OrderEvent, OrderEventType, OrderStatus } from '@ai-trader/shared';
import { OrderRepository, type CreateOrderParams } from '../repositories/OrderRepository';
import { OrderEventRepository } from '../repositories/OrderEventRepository';

export interface CreateOrderRequest {
  userId: string;
  strategyId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
  quantity: number;
  price?: number;
}

export interface TransitionOrderRequest {
  orderId: string;
  newStatus: OrderStatus;
  exchangeOrderId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Valid state transitions per ARCHITECTURE.md
 * NEW → SUBMITTED → OPEN → PARTIALLY_FILLED → FILLED
 *                        ↓ CANCELED
 *                        ↓ REJECTED
 *                        ↓ EXPIRED
 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['OPEN', 'REJECTED', 'EXPIRED'],
  OPEN: ['PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'],
  PARTIALLY_FILLED: ['FILLED', 'CANCELED', 'REJECTED'],
  FILLED: [], // Final state
  CANCELED: [], // Final state
  REJECTED: [], // Final state
  EXPIRED: [], // Final state
};

/**
 * Map order status to event type
 */
function getEventTypeForStatus(status: OrderStatus): OrderEventType {
  const mapping: Record<OrderStatus, OrderEventType> = {
    NEW: 'CREATED',
    SUBMITTED: 'SUBMITTED',
    OPEN: 'OPENED',
    PARTIALLY_FILLED: 'PARTIAL_FILL',
    FILLED: 'FILLED',
    CANCELED: 'CANCELED',
    REJECTED: 'REJECTED',
    EXPIRED: 'EXPIRED',
  };

  return mapping[status];
}

export class OrderService {
  private readonly orderRepo: OrderRepository;
  private readonly eventRepo: OrderEventRepository;

  constructor(private readonly pool: Pool) {
    this.orderRepo = new OrderRepository(pool);
    this.eventRepo = new OrderEventRepository(pool);
  }

  /**
   * Create new order in NEW status with idempotency
   * Validates inputs and persists order + CREATED event atomically
   */
  async createOrder(request: CreateOrderRequest): Promise<Order> {
    // Validation
    this.validateCreateOrderRequest(request);

    // Execute in transaction for atomicity
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create order in NEW status
      const createParams: CreateOrderParams = {
        userId: request.userId,
        strategyId: request.strategyId ?? null,
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        quantity: request.quantity,
        price: request.price ?? null,
      };

      const order = await this.orderRepo.create(createParams, client);

      // Record CREATED event
      await this.eventRepo.create(
        {
          orderId: order.id,
          eventType: 'CREATED',
          data: {
            userId: request.userId,
            strategyId: request.strategyId,
            symbol: request.symbol,
            side: request.side,
            type: request.type,
            quantity: request.quantity,
            price: request.price,
          },
          sequenceNumber: 1,
        },
        client
      );

      await client.query('COMMIT');

      return order;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Transition order to new status
   * Validates transition is legal and persists order + event atomically
   */
  async transitionOrder(request: TransitionOrderRequest): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get current order
      const currentOrder = await this.orderRepo.findById(request.orderId, client);
      if (!currentOrder) {
        throw new Error(`Order not found: ${request.orderId}`);
      }

      // Validate transition
      this.validateTransition(currentOrder.status, request.newStatus);

      // Update order status
      const updatedOrder = await this.orderRepo.updateStatus(
        {
          id: request.orderId,
          status: request.newStatus,
          exchangeOrderId: request.exchangeOrderId,
        },
        client
      );

      // Get next sequence number
      const sequenceNumber = await this.eventRepo.getNextSequenceNumber(request.orderId, client);

      // Record event
      await this.eventRepo.create(
        {
          orderId: request.orderId,
          eventType: getEventTypeForStatus(request.newStatus),
          data: request.metadata || {},
          sequenceNumber,
        },
        client
      );

      await client.query('COMMIT');

      return updatedOrder;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<Order | null> {
    return this.orderRepo.findById(orderId);
  }

  /**
   * Get order events for audit trail
   */
  async getOrderEvents(orderId: string): Promise<OrderEvent[]> {
    return this.eventRepo.findByOrderId(orderId);
  }

  /**
   * Get orders for a user
   */
  async getUserOrders(userId: string, limit = 100, offset = 0): Promise<Order[]> {
    return this.orderRepo.findByUserId(userId, limit, offset);
  }

  /**
   * Validate create order request
   */
  private validateCreateOrderRequest(request: CreateOrderRequest): void {
    if (!request.userId) {
      throw new Error('userId is required');
    }

    if (!request.symbol) {
      throw new Error('symbol is required');
    }

    if (!request.side || !['BUY', 'SELL'].includes(request.side)) {
      throw new Error('side must be BUY or SELL');
    }

    if (!request.type || !['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT'].includes(request.type)) {
      throw new Error('type must be MARKET, LIMIT, STOP_LOSS, or TAKE_PROFIT');
    }

    if (!request.quantity || request.quantity <= 0) {
      throw new Error('quantity must be greater than 0');
    }

    if (request.type === 'LIMIT' && !request.price) {
      throw new Error('price is required for LIMIT orders');
    }

    if (request.type === 'LIMIT' && request.price && request.price <= 0) {
      throw new Error('price must be greater than 0');
    }
  }

  /**
   * Validate state transition is legal per ARCHITECTURE.md
   */
  private validateTransition(currentStatus: OrderStatus, newStatus: OrderStatus): void {
    const validTransitions = VALID_TRANSITIONS[currentStatus];

    if (!validTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid transition from ${currentStatus} to ${newStatus}. ` +
          `Valid transitions: ${validTransitions.join(', ') || 'none (final state)'}`
      );
    }
  }
}
