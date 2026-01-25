/**
 * Backtest Repository
 * Data access layer for backtest.backtest_runs and backtest.backtest_results tables
 */

import type { BacktestResult, BacktestRun, BacktestStatus, StrategyConfig } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';

interface BacktestRunRow {
  id: string;
  user_id: string;
  strategy_config: string; // JSON
  symbol: string;
  start_date: string;
  end_date: string;
  initial_balance: string;
  status: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface BacktestResultRow {
  id: string;
  backtest_run_id: string;
  final_balance: string;
  total_trades: string;
  winning_trades: string;
  losing_trades: string;
  total_pnl: string;
  max_drawdown: string;
  sharpe_ratio: string | null;
  completed_at: string;
}

export interface CreateBacktestRunParams {
  userId: string;
  strategyConfig: StrategyConfig;
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialBalance: number;
}

export interface CreateBacktestResultParams {
  backtestRunId: string;
  finalBalance: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  maxDrawdown: number;
  sharpeRatio: number | null;
}

export class BacktestRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Create new backtest run with PENDING status
   */
  async createRun(params: CreateBacktestRunParams, client?: PoolClient): Promise<BacktestRun> {
    const db = client || this.pool;

    const query = `
      INSERT INTO backtest.backtest_runs (
        user_id, strategy_config, symbol, start_date, end_date, 
        initial_balance, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING
        id, user_id, strategy_config, symbol, start_date, end_date,
        initial_balance, status, error_message, created_at, completed_at
    `;

    const result = await db.query(query, [
      params.userId,
      JSON.stringify(params.strategyConfig),
      params.symbol,
      params.startDate,
      params.endDate,
      params.initialBalance,
    ]);

    return this.mapRowToBacktestRun(result.rows[0] as BacktestRunRow);
  }

  /**
   * Find backtest run by ID
   */
  async findRunById(id: string): Promise<BacktestRun | null> {
    const query = `
      SELECT
        id, user_id, strategy_config, symbol, start_date, end_date,
        initial_balance, status, error_message, created_at, completed_at
      FROM backtest.backtest_runs
      WHERE id = $1
    `;

    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToBacktestRun(result.rows[0] as BacktestRunRow);
  }

  /**
   * Find all backtest runs for a user
   */
  async findRunsByUserId(userId: string, limit = 50, offset = 0): Promise<BacktestRun[]> {
    const query = `
      SELECT
        id, user_id, strategy_config, symbol, start_date, end_date,
        initial_balance, status, error_message, created_at, completed_at
      FROM backtest.backtest_runs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.pool.query(query, [userId, limit, offset]);

    return result.rows.map((row) => this.mapRowToBacktestRun(row as BacktestRunRow));
  }

  /**
   * Update backtest run status
   */
  async updateRunStatus(
    id: string,
    status: BacktestStatus,
    errorMessage?: string,
    client?: PoolClient
  ): Promise<BacktestRun> {
    const db = client || this.pool;

    const completedAt = status === 'COMPLETED' || status === 'FAILED' ? 'NOW()' : 'NULL';

    const query = `
      UPDATE backtest.backtest_runs
      SET 
        status = $1,
        error_message = $2,
        completed_at = ${completedAt}
      WHERE id = $3
      RETURNING
        id, user_id, strategy_config, symbol, start_date, end_date,
        initial_balance, status, error_message, created_at, completed_at
    `;

    const result = await db.query(query, [status, errorMessage || null, id]);

    return this.mapRowToBacktestRun(result.rows[0] as BacktestRunRow);
  }

  /**
   * Create backtest result
   */
  async createResult(params: CreateBacktestResultParams, client?: PoolClient): Promise<BacktestResult> {
    const db = client || this.pool;

    const query = `
      INSERT INTO backtest.backtest_results (
        backtest_run_id, final_balance, total_trades, winning_trades,
        losing_trades, total_pnl, max_drawdown, sharpe_ratio
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id, backtest_run_id, final_balance, total_trades, winning_trades,
        losing_trades, total_pnl, max_drawdown, sharpe_ratio, completed_at
    `;

    const result = await db.query(query, [
      params.backtestRunId,
      params.finalBalance,
      params.totalTrades,
      params.winningTrades,
      params.losingTrades,
      params.totalPnl,
      params.maxDrawdown,
      params.sharpeRatio,
    ]);

    return this.mapRowToBacktestResult(result.rows[0] as BacktestResultRow);
  }

  /**
   * Find backtest result by run ID
   */
  async findResultByRunId(backtestRunId: string): Promise<BacktestResult | null> {
    const query = `
      SELECT
        id, backtest_run_id, final_balance, total_trades, winning_trades,
        losing_trades, total_pnl, max_drawdown, sharpe_ratio, completed_at
      FROM backtest.backtest_results
      WHERE backtest_run_id = $1
    `;

    const result = await this.pool.query(query, [backtestRunId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToBacktestResult(result.rows[0] as BacktestResultRow);
  }

  /**
   * Map database row to BacktestRun domain object
   */
  private mapRowToBacktestRun(row: BacktestRunRow): BacktestRun {
    return {
      id: row.id,
      userId: row.user_id,
      strategyConfig: JSON.parse(row.strategy_config) as StrategyConfig,
      symbol: row.symbol,
      startDate: new Date(row.start_date),
      endDate: new Date(row.end_date),
      initialBalance: parseFloat(row.initial_balance),
      status: row.status as BacktestStatus,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  }

  /**
   * Map database row to BacktestResult domain object
   */
  private mapRowToBacktestResult(row: BacktestResultRow): BacktestResult {
    return {
      id: row.id,
      backtestRunId: row.backtest_run_id,
      finalBalance: parseFloat(row.final_balance),
      totalTrades: parseInt(row.total_trades, 10),
      winningTrades: parseInt(row.winning_trades, 10),
      losingTrades: parseInt(row.losing_trades, 10),
      totalPnl: parseFloat(row.total_pnl),
      maxDrawdown: parseFloat(row.max_drawdown),
      sharpeRatio: row.sharpe_ratio ? parseFloat(row.sharpe_ratio) : 0,
      completedAt: new Date(row.completed_at),
    };
  }
}
