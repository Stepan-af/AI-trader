/**
 * Fill Repository
 * Data access layer for execution.fills table
 * Handles fill ingestion with exchange_fill_id deduplication
 */

import type { Fill, FillSource } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';

interface FillRow {
  id: string;
  order_id: string;
  exchange_fill_id: string;
  price: string;
  quantity: string;
  fee: string;
  fee_asset: string;
  timestamp: string;
  source: string;
}

export interface CreateFillParams {
  orderId: string;
  exchangeFillId: string;
  price: number;
  quantity: number;
  fee: number;
  feeAsset: string;
  timestamp: Date;
  source: FillSource;
}

export class FillRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create fill with deduplication via exchange_fill_id
   * Returns null if fill already exists (idempotent)
   */
  async create(params: CreateFillParams, client?: PoolClient): Promise<Fill | null> {
    const db = client || this.pool;

    const query = `
      INSERT INTO execution.fills (
        order_id, exchange_fill_id, price, quantity, fee, fee_asset, timestamp, source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (exchange_fill_id) DO NOTHING
      RETURNING 
        id, order_id, exchange_fill_id, price, quantity, fee, fee_asset, timestamp, source
    `;

    const result = await db.query(query, [
      params.orderId,
      params.exchangeFillId,
      params.price,
      params.quantity,
      params.fee,
      params.feeAsset,
      params.timestamp,
      params.source,
    ]);

    // If no rows returned, fill already existed (deduplication)
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToFill(result.rows[0] as FillRow);
  }

  /**
   * Find all fills for an order
   */
  async findByOrderId(orderId: string): Promise<Fill[]> {
    const query = `
      SELECT 
        id, order_id, exchange_fill_id, price, quantity, fee, fee_asset, timestamp, source
      FROM execution.fills
      WHERE order_id = $1
      ORDER BY timestamp ASC
    `;

    const result = await this.pool.query(query, [orderId]);

    return result.rows.map((row) => this.mapRowToFill(row as FillRow));
  }

  /**
   * Find fill by exchange fill ID
   */
  async findByExchangeFillId(exchangeFillId: string): Promise<Fill | null> {
    const query = `
      SELECT 
        id, order_id, exchange_fill_id, price, quantity, fee, fee_asset, timestamp, source
      FROM execution.fills
      WHERE exchange_fill_id = $1
    `;

    const result = await this.pool.query(query, [exchangeFillId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToFill(result.rows[0] as FillRow);
  }

  /**
   * Map database row to Fill domain object
   */
  private mapRowToFill(row: FillRow): Fill {
    return {
      id: row.id,
      orderId: row.order_id,
      exchangeFillId: row.exchange_fill_id,
      price: parseFloat(row.price),
      quantity: parseFloat(row.quantity),
      fee: parseFloat(row.fee),
      feeAsset: row.fee_asset,
      timestamp: new Date(row.timestamp),
      source: row.source as FillSource,
    };
  }
}
