/**
 * Portfolio Event Outbox Repository
 * Read-only access to execution.portfolio_events_outbox
 * Shared repository - used by both Execution and Portfolio services
 */

import type { PortfolioEventOutbox } from '@ai-trader/shared';
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

export class PortfolioEventOutboxRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Get unprocessed events (processed_at IS NULL)
   * Ordered by created_at ASC for FIFO processing
   */
  async getUnprocessedEvents(limit = 100, client?: PoolClient): Promise<PortfolioEventOutbox[]> {
    const db = client || this.pool;

    const query = `
      SELECT
        id, event_type, user_id, symbol, order_id, fill_id,
        data, created_at, processed_at
      FROM execution.portfolio_events_outbox
      WHERE processed_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `;

    const result = await db.query(query, [limit]);

    return result.rows.map((row) => this.mapRowToEvent(row as PortfolioEventOutboxRow));
  }

  /**
   * Mark event as processed
   */
  async markAsProcessed(eventId: string, client?: PoolClient): Promise<void> {
    const db = client || this.pool;

    const query = `
      UPDATE execution.portfolio_events_outbox
      SET processed_at = NOW()
      WHERE id = $1
    `;

    await db.query(query, [eventId]);
  }

  /**
   * Map database row to PortfolioEventOutbox domain object
   */
  private mapRowToEvent(row: PortfolioEventOutboxRow): PortfolioEventOutbox {
    return {
      id: row.id,
      eventType: row.event_type as 'FILL_PROCESSED' | 'ORDER_CANCELED',
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
