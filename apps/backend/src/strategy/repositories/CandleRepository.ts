/**
 * Candle Repository
 * Data access layer for candles (TimescaleDB hypertable)
 */

import type { Candle, Timeframe } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';

export class CandleRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Get the latest N candles for a symbol/timeframe
   * Ordered by timestamp DESC (newest first)
   *
   * @param symbol - Trading pair (e.g., 'BTCUSDT')
   * @param timeframe - Candle timeframe
   * @param limit - Number of candles to fetch
   */
  async getLatestCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number,
    client?: PoolClient,
  ): Promise<Candle[]> {
    const db = client ?? this.pool;

    const result = await db.query<{
      id: string;
      symbol: string;
      timeframe: string;
      timestamp: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>(
      `
        SELECT id, symbol, timeframe, timestamp, open, high, low, close, volume
        FROM candles
        WHERE symbol = $1 AND timeframe = $2
        ORDER BY timestamp DESC
        LIMIT $3
      `,
      [symbol, timeframe, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      timeframe: row.timeframe as Timeframe,
      timestamp: row.timestamp,
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseFloat(row.volume),
    }));
  }

  /**
   * Get candles in a time range
   * Ordered by timestamp ASC (oldest first)
   */
  async getCandlesInRange(
    symbol: string,
    timeframe: Timeframe,
    startTime: Date,
    endTime: Date,
    client?: PoolClient,
  ): Promise<Candle[]> {
    const db = client ?? this.pool;

    const result = await db.query<{
      id: string;
      symbol: string;
      timeframe: string;
      timestamp: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>(
      `
        SELECT id, symbol, timeframe, timestamp, open, high, low, close, volume
        FROM candles
        WHERE symbol = $1 
          AND timeframe = $2
          AND timestamp >= $3
          AND timestamp < $4
        ORDER BY timestamp ASC
      `,
      [symbol, timeframe, startTime, endTime],
    );

    return result.rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      timeframe: row.timeframe as Timeframe,
      timestamp: row.timestamp,
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseFloat(row.volume),
    }));
  }
}
