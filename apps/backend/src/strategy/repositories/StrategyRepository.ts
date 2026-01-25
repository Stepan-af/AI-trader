/**
 * Strategy Repository
 * Data access layer for strategy.strategies table
 * Handles CRUD operations per ARCHITECTURE.md
 */

import type { Strategy, StrategyConfig, StrategyStatus, TradingMode } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';

interface StrategyRow {
  id: string;
  user_id: string;
  config: string; // JSONB stored as string
  status: StrategyStatus;
  mode: TradingMode | null;
  created_at: string;
  updated_at: string;
}

export interface CreateStrategyParams {
  userId: string;
  config: StrategyConfig;
  status?: StrategyStatus;
  mode?: TradingMode | null;
}

export interface UpdateStrategyParams {
  id: string;
  config?: StrategyConfig;
  status?: StrategyStatus;
  mode?: TradingMode | null;
}

export class StrategyRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create new strategy
   * Default status: DRAFT
   */
  async create(params: CreateStrategyParams, client?: PoolClient): Promise<Strategy> {
    const db = client || this.pool;

    const query = `
      INSERT INTO strategy.strategies (
        user_id, config, status, mode
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id, user_id, config, status, mode, created_at, updated_at
    `;

    const result = await db.query(query, [
      params.userId,
      JSON.stringify(params.config),
      params.status ?? 'DRAFT',
      params.mode ?? null,
    ]);

    return this.mapRowToStrategy(result.rows[0] as StrategyRow);
  }

  /**
   * Find strategy by ID
   */
  async findById(id: string, client?: PoolClient): Promise<Strategy | null> {
    const db = client || this.pool;

    const query = `
      SELECT id, user_id, config, status, mode, created_at, updated_at
      FROM strategy.strategies
      WHERE id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToStrategy(result.rows[0] as StrategyRow);
  }

  /**
   * Find all strategies for a user
   */
  async findByUserId(userId: string, client?: PoolClient): Promise<Strategy[]> {
    const db = client || this.pool;

    const query = `
      SELECT id, user_id, config, status, mode, created_at, updated_at
      FROM strategy.strategies
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const result = await db.query(query, [userId]);

    return result.rows.map((row) => this.mapRowToStrategy(row as StrategyRow));
  }

  /**
   * Update strategy
   * Updates updated_at timestamp automatically
   */
  async update(params: UpdateStrategyParams, client?: PoolClient): Promise<Strategy> {
    const db = client || this.pool;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (params.config !== undefined) {
      updates.push(`config = $${paramCount}`);
      values.push(JSON.stringify(params.config));
      paramCount++;
    }

    if (params.status !== undefined) {
      updates.push(`status = $${paramCount}`);
      values.push(params.status);
      paramCount++;
    }

    if (params.mode !== undefined) {
      updates.push(`mode = $${paramCount}`);
      values.push(params.mode);
      paramCount++;
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push(`updated_at = NOW()`);
    values.push(params.id);

    const query = `
      UPDATE strategy.strategies
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, user_id, config, status, mode, created_at, updated_at
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error(`Strategy not found: ${params.id}`);
    }

    return this.mapRowToStrategy(result.rows[0] as StrategyRow);
  }

  /**
   * Delete strategy by ID
   */
  async delete(id: string, client?: PoolClient): Promise<void> {
    const db = client || this.pool;

    const query = `
      DELETE FROM strategy.strategies
      WHERE id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rowCount === 0) {
      throw new Error(`Strategy not found: ${id}`);
    }
  }

  /**
   * Map database row to Strategy domain object
   */
  private mapRowToStrategy(row: StrategyRow): Strategy {
    return {
      id: row.id,
      userId: row.user_id,
      config: JSON.parse(row.config) as StrategyConfig,
      status: row.status,
      mode: row.mode,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
