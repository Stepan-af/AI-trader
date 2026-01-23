/**
 * Risk Repository
 * Data access layer for risk.risk_limits and risk.system_config tables
 * Provides read access to risk limits and system configuration
 */

import type { RiskLimits, SystemConfig } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';

interface RiskLimitsRow {
  id: string;
  user_id: string;
  symbol: string | null;
  max_position_size: string;
  max_exposure_usd: string;
  max_daily_loss_usd: string;
  created_at: string;
  updated_at: string;
}

interface SystemConfigRow {
  id: string;
  kill_switch_active: boolean;
  kill_switch_reason: string | null;
  kill_switch_activated_at: string | null;
  updated_at: string;
}

export class RiskRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Get risk limits for a user and symbol
   * Returns symbol-specific limits if they exist, otherwise global user limits
   */
  async getRiskLimits(
    userId: string,
    symbol: string,
    client?: PoolClient
  ): Promise<RiskLimits | null> {
    const db = client || this.pool;

    // First try to get symbol-specific limits
    const symbolQuery = `
      SELECT
        id, user_id, symbol, max_position_size, max_exposure_usd,
        max_daily_loss_usd, created_at, updated_at
      FROM risk.risk_limits
      WHERE user_id = $1 AND symbol = $2
    `;

    const symbolResult = await db.query(symbolQuery, [userId, symbol]);

    if (symbolResult.rows.length > 0) {
      return this.mapRowToRiskLimits(symbolResult.rows[0] as RiskLimitsRow);
    }

    // Fallback to global user limits (symbol IS NULL)
    const globalQuery = `
      SELECT
        id, user_id, symbol, max_position_size, max_exposure_usd,
        max_daily_loss_usd, created_at, updated_at
      FROM risk.risk_limits
      WHERE user_id = $1 AND symbol IS NULL
    `;

    const globalResult = await db.query(globalQuery, [userId]);

    if (globalResult.rows.length > 0) {
      return this.mapRowToRiskLimits(globalResult.rows[0] as RiskLimitsRow);
    }

    return null;
  }

  /**
   * Get global system configuration
   */
  async getSystemConfig(client?: PoolClient): Promise<SystemConfig> {
    const db = client || this.pool;

    const query = `
      SELECT
        id, kill_switch_active, kill_switch_reason,
        kill_switch_activated_at, updated_at
      FROM risk.system_config
      WHERE id = 'global'
    `;

    const result = await db.query(query);

    if (result.rows.length === 0) {
      throw new Error('SYSTEM_CONFIG_NOT_FOUND');
    }

    return this.mapRowToSystemConfig(result.rows[0] as SystemConfigRow);
  }

  /**
   * Map database row to RiskLimits domain object
   */
  private mapRowToRiskLimits(row: RiskLimitsRow): RiskLimits {
    return {
      id: row.id,
      userId: row.user_id,
      symbol: row.symbol,
      maxPositionSize: parseFloat(row.max_position_size),
      maxExposureUsd: parseFloat(row.max_exposure_usd),
      maxDailyLossUsd: parseFloat(row.max_daily_loss_usd),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    } as const;
  }

  /**
   * Map database row to SystemConfig domain object
   */
  private mapRowToSystemConfig(row: SystemConfigRow): SystemConfig {
    return {
      id: row.id,
      killSwitchActive: row.kill_switch_active,
      killSwitchReason: row.kill_switch_reason,
      killSwitchActivatedAt: row.kill_switch_activated_at
        ? new Date(row.kill_switch_activated_at)
        : null,
      updatedAt: new Date(row.updated_at),
    };
  }
}
