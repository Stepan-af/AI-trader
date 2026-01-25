/**
 * Risk Validation Route
 * Provides pre-trade risk validation endpoint per ARCHITECTURE.md
 */

import type { RiskValidationRequest, RiskValidationResponse } from '@ai-trader/shared';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { RiskService, RiskValidationError } from '../../risk';

let riskService: RiskService;

/**
 * Initialize risk service with database pool
 */
export function initializeRiskRoute(pool: Pool): void {
  riskService = new RiskService(pool);
}

/**
 * POST /risk/validate
 * Validate trade against risk limits
 *
 * Request body: RiskValidationRequest
 * Response: RiskValidationResponse (200) or error (403/409)
 */
export async function validateRisk(req: Request, res: Response): Promise<void> {
  try {
    const request = req.body as RiskValidationRequest;

    // Validate required fields
    if (
      !request.userId ||
      !request.symbol ||
      !request.side ||
      request.quantity === undefined ||
      request.currentPosition === undefined ||
      request.positionVersion === undefined
    ) {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Missing required fields',
      });
      return;
    }

    // Check kill switch before validation
    const killSwitchActive = await riskService.isKillSwitchActive();
    if (killSwitchActive) {
      res.status(503).json({
        error: 'KILL_SWITCH_ACTIVE',
        message: 'Emergency stop is active. Cannot validate new trades.',
      });
      return;
    }

    // Perform risk validation
    const response: RiskValidationResponse = await riskService.validateRisk(request);

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof RiskValidationError) {
      if (error.code === 'POSITION_CHANGED') {
        res.status(409).json({
          error: error.code,
          message: error.message,
          currentVersion: error.details?.currentVersion,
        });
        return;
      }

      if (error.code === 'RISK_LIMIT_EXCEEDED') {
        res.status(403).json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
        return;
      }

      if (error.code === 'NO_LIMITS_CONFIGURED') {
        res.status(400).json({
          error: error.code,
          message: error.message,
        });
        return;
      }
    }

    // Unexpected error
    console.error('Risk validation error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred during risk validation',
    });
  }
}

/**
 * POST /admin/risk-cache/clear
 * Clear all risk approval cache entries (admin only)
 * 
 * Per ARCHITECTURE.md: Manual cache invalidation
 * Use cases: Risk limits changed by admin, debugging cache issues
 * 
 * Response: { cleared: number, message: string }
 */
export async function clearRiskCache(_req: Request, res: Response): Promise<void> {
  try {
    const cleared = await riskService.clearCache();

    res.status(200).json({
      cleared,
      message: cleared > 0
        ? `Cleared ${cleared} risk approval cache entries. New orders will undergo fresh validation.`
        : 'No cache entries found.',
    });
  } catch (error) {
    console.error('Risk cache clear error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred while clearing cache',
    });
  }
}
