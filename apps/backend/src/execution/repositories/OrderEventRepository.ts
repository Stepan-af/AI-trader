/**
 * Order Event Repository
 * Data access layer for execution.order_events table
 * Ensures complete audit trail per ARCHITECTURE.md
 */

import type { OrderEvent, OrderEventType } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';

interface OrderEventRow {
  id: string;
  order_id: string;
  event_type: string;
  data: Record<string, unknown>;
  sequence_number: string;
  timestamp: string;
}

export interface CreateOrderEventParams {
  orderId: string;
  eventType: OrderEventType;
  data: Record<string, unknown>;
  sequenceNumber: number;
}

export class OrderEventRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create new order event
   * Sequence number must be unique per order (enforced by DB constraint)
   */
  async create(params: CreateOrderEventParams, client?: PoolClient): Promise<OrderEvent> {
    const db = client || this.pool;

    const query = `
      INSERT INTO execution.order_events (
        order_id, event_type, data, sequence_number
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id, order_id, event_type, data, sequence_number, timestamp
    `;

    const result = await db.query(query, [
      params.orderId,
      params.eventType,
      JSON.stringify(params.data),
      params.sequenceNumber,
    ]);

    return this.mapRowToOrderEvent(result.rows[0] as OrderEventRow);
  }

  /**
   * Find all events for an order, ordered by sequence
   */
  async findByOrderId(orderId: string): Promise<OrderEvent[]> {
    const query = `
      SELECT id, order_id, event_type, data, sequence_number, timestamp
      FROM execution.order_events
      WHERE order_id = $1
      ORDER BY sequence_number ASC
    `;

    const result = await this.pool.query(query, [orderId]);

    return result.rows.map((row) => this.mapRowToOrderEvent(row as OrderEventRow));
  }

  /**
   * Get next sequence number for an order
   * Used to ensure correct event ordering
   */
  async getNextSequenceNumber(orderId: string, client?: PoolClient): Promise<number> {
    const db = client || this.pool;

    const query = `
      SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
      FROM execution.order_events
      WHERE order_id = $1
    `;

    const result = await db.query<{ next_seq: string }>(query, [orderId]);

    return parseInt(result.rows[0].next_seq, 10);
  }

  /**
   * Map database row to OrderEvent domain object
   */
  private mapRowToOrderEvent(row: OrderEventRow): OrderEvent {
    return {
      id: row.id,
      orderId: row.order_id,
      eventType: row.event_type as OrderEventType,
      data: row.data,
      sequenceNumber: parseInt(row.sequence_number, 10),
      timestamp: new Date(row.timestamp),
    };
  }
}
