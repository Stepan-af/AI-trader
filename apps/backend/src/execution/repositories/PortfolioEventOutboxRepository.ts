/**
 * Portfolio Event Outbox Repository
 * Data access layer for execution.portfolio_events_outbox table
 * Implements transactional outbox pattern for eventual consistency
 */

import type { PortfolioEventOutbox, PortfolioEventType } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';

interface PortfolioEventOutboxRow {
  id: string;
  event_type: string;
  user_id: string;
  symbol: string;
  order_id: string;
  fill_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
}

export interface CreatePortfolioEventParams {
  eventType: PortfolioEventType;
  userId: string;
  symbol: string;
  orderId: string;
  fillId: string | null;
  data: Record<string, unknown>;
}

export class PortfolioEventOutboxRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create portfolio event in outbox
   * Will be processed by Portfolio Service worker
   */
  async create(
    params: CreatePortfolioEventParams,
    client?: PoolClient
  ): Promise<PortfolioEventOutbox> {
    const db = client || this.pool;

    const query = `
      INSERT INTO execution.portfolio_events_outbox (
        event_type, user_id, symbol, order_id, fill_id, data
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id, event_type, user_id, symbol, order_id, fill_id, data, created_at, processed_at
    `;

    const result = await db.query(query, [
      params.eventType,
      params.userId,
      params.symbol,
      params.orderId,
      params.fillId,
      JSON.stringify(params.data),
    ]);

    return this.mapRowToPortfolioEventOutbox(result.rows[0] as PortfolioEventOutboxRow);
  }

  /**
   * Find unprocessed events (for worker)
   */
  async findUnprocessed(limit = 100): Promise<PortfolioEventOutbox[]> {
    const query = `
      SELECT
        id, event_type, user_id, symbol, order_id, fill_id, data, created_at, processed_at
      FROM execution.portfolio_events_outbox
      WHERE processed_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);

    return result.rows.map((row) =>
      this.mapRowToPortfolioEventOutbox(row as PortfolioEventOutboxRow)
    );
  }

  /**
   * Mark event as processed
   */
  async markProcessed(id: string, client?: PoolClient): Promise<void> {
    const db = client || this.pool;

    const query = `
      UPDATE execution.portfolio_events_outbox
      SET processed_at = NOW()
      WHERE id = $1
    `;

    await db.query(query, [id]);
  }

  /**
   * Map database row to PortfolioEventOutbox domain object
   */
  private mapRowToPortfolioEventOutbox(row: PortfolioEventOutboxRow): PortfolioEventOutbox {
    return {
      id: row.id,
      eventType: row.event_type as PortfolioEventType,
      userId: row.user_id,
      symbol: row.symbol,
      orderId: row.order_id,
      fillId: row.fill_id,
      data: row.data,
      createdAt: new Date(row.created_at),
      processedAt: row.processed_at ? new Date(row.processed_at) : null,
    };
  }
}
