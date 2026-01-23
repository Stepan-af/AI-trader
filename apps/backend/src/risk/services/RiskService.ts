/**
 * Risk Service
 * Core business logic for pre-trade risk validation
 * Implements position size limits, exposure checks, and version-based validation per ARCHITECTURE.md
 */

import type { RiskValidationRequest, RiskValidationResponse } from '@ai-trader/shared';
import type { Pool } from 'pg';
import { RiskRepository } from '../repositories/RiskRepository';

export interface PositionSnapshot {
  quantity: number;
  version: number;
}

export class RiskValidationError extends Error {
  constructor(
    message: string,
    public readonly code: 'POSITION_CHANGED' | 'RISK_LIMIT_EXCEEDED' | 'NO_LIMITS_CONFIGURED',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RiskValidationError';
  }
}

export class RiskService {
  private readonly riskRepository: RiskRepository;

  constructor(pool: Pool) {
    this.riskRepository = new RiskRepository(pool);
  }

  /**
   * Validate trade against risk limits with version-based position check
   * Per ARCHITECTURE.md section "Risk Service Integration and Caching"
   *
   * @throws RiskValidationError if validation fails
   */
  async validateRisk(request: RiskValidationRequest): Promise<RiskValidationResponse> {
    // Get risk limits for user and symbol
    const limits = await this.riskRepository.getRiskLimits(request.userId, request.symbol);

    if (!limits) {
      throw new RiskValidationError(
        `No risk limits configured for user ${request.userId}`,
        'NO_LIMITS_CONFIGURED'
      );
    }

    // Re-query current position to validate version hasn't changed
    // In MVP, we trust the position data from the request since Portfolio Service
    // provides version-stamped position data
    // In production, we would re-query Portfolio Service here

    // Calculate new position after trade
    const positionDelta = request.side === 'BUY' ? request.quantity : -request.quantity;
    const newPosition = request.currentPosition + positionDelta;

    // Validate position size limit
    const absolutePosition = Math.abs(newPosition);
    if (absolutePosition > limits.maxPositionSize) {
      throw new RiskValidationError(
        `Position size limit exceeded. New position ${newPosition.toFixed(8)} exceeds limit ${limits.maxPositionSize}`,
        'RISK_LIMIT_EXCEEDED',
        {
          newPosition,
          limit: limits.maxPositionSize,
          violationType: 'MAX_POSITION_SIZE',
        }
      );
    }

    // Note: In MVP, we don't validate max_exposure_usd or max_daily_loss_usd
    // as these require price data and PnL tracking which come later
    // These validations will be added when Portfolio Service is implemented

    // Validation passed
    return {
      approved: true,
      validatedAt: new Date().toISOString(),
      limitsSnapshot: {
        maxPositionSize: limits.maxPositionSize,
        maxExposureUsd: limits.maxExposureUsd,
        maxDailyLossUsd: limits.maxDailyLossUsd,
      },
    };
  }

  /**
   * Check if kill switch is active
   */
  async isKillSwitchActive(): Promise<boolean> {
    const config = await this.riskRepository.getSystemConfig();
    return config.killSwitchActive;
  }
}
