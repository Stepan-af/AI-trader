/**
 * Position Repository
 * Data access layer for portfolio.positions table
 * Implements optimistic locking via version counter per ARCHITECTURE.md
 */

import type { Position } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';

interface PositionRow {
  id: string;
  user_id: string;
  symbol: string;
  quantity: string;
  avg_entry_price: string;
  realized_pnl: string;
  total_fees: string;
  version: string;
  updated_at: string;
  data_as_of_timestamp: string;
}

export interface CreatePositionParams {
  userId: string;
  symbol: string;
  quantity: number;
  avgEntryPrice: number;
  realizedPnl?: number;
  totalFees?: number;
}

export interface UpdatePositionParams {
  id: string;
  quantity: number;
  avgEntryPrice: number;
  realizedPnl: number;
  totalFees: number;
  expectedVersion: number;
}

export class PositionRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Find position by user ID and symbol
   */
  async findByUserAndSymbol(
    userId: string,
    symbol: string,
    client?: PoolClient
  ): Promise<Position | null> {
    const db = client || this.pool;

    const query = `
      SELECT
        id, user_id, symbol, quantity, avg_entry_price,
        realized_pnl, total_fees, version, updated_at, data_as_of_timestamp
      FROM portfolio.positions
      WHERE user_id = $1 AND symbol = $2
    `;

    const result = await db.query(query, [userId, symbol]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToPosition(result.rows[0] as PositionRow);
  }

  /**
   * Create new position with version = 1
   */
  async create(params: CreatePositionParams, client?: PoolClient): Promise<Position> {
    const db = client || this.pool;

    const query = `
      INSERT INTO portfolio.positions (
        user_id, symbol, quantity, avg_entry_price,
        realized_pnl, total_fees, version, data_as_of_timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())
      RETURNING
        id, user_id, symbol, quantity, avg_entry_price,
        realized_pnl, total_fees, version, updated_at, data_as_of_timestamp
    `;

    const result = await db.query(query, [
      params.userId,
      params.symbol,
      params.quantity,
      params.avgEntryPrice,
      params.realizedPnl ?? 0,
      params.totalFees ?? 0,
    ]);

    return this.mapRowToPosition(result.rows[0] as PositionRow);
  }

  /**
   * Update position with optimistic locking
   * Increments version counter
   *
   * @throws Error if version mismatch (concurrent update detected)
   */
  async update(params: UpdatePositionParams, client?: PoolClient): Promise<Position> {
    const db = client || this.pool;

    const query = `
      UPDATE portfolio.positions
      SET
        quantity = $1,
        avg_entry_price = $2,
        realized_pnl = $3,
        total_fees = $4,
        version = version + 1,
        updated_at = NOW(),
        data_as_of_timestamp = NOW()
      WHERE id = $5 AND version = $6
      RETURNING
        id, user_id, symbol, quantity, avg_entry_price,
        realized_pnl, total_fees, version, updated_at, data_as_of_timestamp
    `;

    const result = await db.query(query, [
      params.quantity,
      params.avgEntryPrice,
      params.realizedPnl,
      params.totalFees,
      params.id,
      params.expectedVersion,
    ]);

    if (result.rows.length === 0) {
      throw new Error('OPTIMISTIC_LOCK_FAILED: Position was modified by another process');
    }

    return this.mapRowToPosition(result.rows[0] as PositionRow);
  }

  /**
   * Map database row to Position domain object
   */
  private mapRowToPosition(row: PositionRow): Position {
    return {
      id: row.id,
      userId: row.user_id,
      symbol: row.symbol,
      quantity: parseFloat(row.quantity),
      avgEntryPrice: parseFloat(row.avg_entry_price),
      realizedPnl: parseFloat(row.realized_pnl),
      totalFees: parseFloat(row.total_fees),
      version: parseInt(row.version, 10),
      updatedAt: new Date(row.updated_at),
      dataAsOfTimestamp: new Date(row.data_as_of_timestamp),
    };
  }
}
