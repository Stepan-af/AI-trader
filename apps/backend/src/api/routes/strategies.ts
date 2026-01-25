/**
 * Strategy Routes
 * HTTP endpoints for strategy CRUD and lifecycle management
 */

import type { Request, Response } from 'express';
import type { ExecutionEngine } from '../../strategy/services/ExecutionEngine';
import type { StrategyService } from '../../strategy/services/StrategyService';
import type { KillSwitchService } from '../../execution/services/KillSwitchService';

/**
 * GET /strategies
 * List all strategies for authenticated user
 */
export async function listStrategies(
  _req: Request,
  res: Response,
  strategyService: StrategyService
): Promise<void> {
  // TODO: Extract userId from JWT token (authentication not implemented yet)
  const userId = 'default-user';

  const strategies = await strategyService.listStrategies(userId);

  res.json({
    items: strategies,
    meta: {
      total: strategies.length,
      limit: 100,
      offset: 0,
    },
  });
}

/**
 * POST /strategies
 * Create new strategy
 */
export async function createStrategy(
  req: Request,
  res: Response,
  strategyService: StrategyService
): Promise<void> {
  // TODO: Extract userId from JWT token
  const userId = 'default-user';

  const { name, type, symbol, timeframe, dca, grid, swing, risk } = req.body as {
    name?: string;
    type?: string;
    symbol?: string;
    timeframe?: string;
    dca?: { intervalSeconds: number; amountPerOrder: number };
    grid?: { lowerBound: number; upperBound: number; gridLevels: number };
    swing?: { entryRule: string; exitRule: string };
    risk?: {
      maxPositionSize?: number;
      maxExposureUsd?: number;
      maxDailyLossUsd?: number;
    };
  };

  // Validate required fields
  if (!name || !type || !symbol || !timeframe || !risk?.maxPositionSize) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message:
        'Missing required fields: name, type, symbol, timeframe, risk.maxPositionSize',
    });
    return;
  }

  // Validate type-specific params
  if (type === 'DCA' && !dca) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'DCA strategy requires dca configuration',
    });
    return;
  }

  if (type === 'GRID' && !grid) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'GRID strategy requires grid configuration',
    });
    return;
  }

  if (type === 'SWING' && !swing) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'SWING strategy requires swing configuration',
    });
    return;
  }

  const strategy = await strategyService.createStrategy({
    userId,
    config: {
      name,
      type: type as 'DCA' | 'GRID' | 'SWING',
      symbol,
      timeframe: timeframe as '1s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
      dca,
      grid,
      swing,
      risk: {
        maxPositionSize: risk.maxPositionSize,
        maxExposureUsd: risk.maxExposureUsd,
        maxDailyLossUsd: risk.maxDailyLossUsd,
      },
    },
  });

  res.status(201).json(strategy);
}

/**
 * PUT /strategies/:id
 * Update existing strategy
 */
export async function updateStrategy(
  req: Request,
  res: Response,
  strategyService: StrategyService
): Promise<void> {
  const { id } = req.params;
  const { config } = req.body as { config?: import('@ai-trader/shared').StrategyConfig };

  if (!config) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Missing required field: config',
    });
    return;
  }

  const strategy = await strategyService.getStrategy(id);

  if (!strategy) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Strategy not found',
    });
    return;
  }

  // Cannot update running strategy
  if (strategy.status === 'RUNNING' || strategy.status === 'STARTING') {
    res.status(400).json({
      error: 'INVALID_STATE',
      message: 'Cannot update strategy while running or starting',
    });
    return;
  }

  const updated = await strategyService.updateStrategy({
    id,
    config,
  });

  res.json(updated);
}

/**
 * DELETE /strategies/:id
 * Delete strategy (only if stopped)
 */
export async function deleteStrategy(
  req: Request,
  res: Response,
  strategyService: StrategyService
): Promise<void> {
  const { id } = req.params;

  const strategy = await strategyService.getStrategy(id);

  if (!strategy) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Strategy not found',
    });
    return;
  }

  // Cannot delete running strategy
  if (strategy.status === 'RUNNING' || strategy.status === 'STARTING') {
    res.status(400).json({
      error: 'INVALID_STATE',
      message: 'Cannot delete strategy while running or starting. Stop it first.',
    });
    return;
  }

  await strategyService.deleteStrategy(id);

  res.status(204).send();
}

/**
 * POST /strategies/:id/start
 * Start strategy with comprehensive precondition checks
 *
 * Preconditions (per API.md):
 * - Strategy status must be STOPPED or DRAFT
 * - Kill switch must NOT be active
 * - Risk Service health check passed (last response < 5s ago)
 * - Portfolio Service responsive (data not stale)
 * - Exchange WebSocket connected (for LIVE mode)
 */
export async function startStrategy(
  req: Request,
  res: Response,
  strategyService: StrategyService,
  executionEngine: ExecutionEngine,
  killSwitchService: KillSwitchService
): Promise<void> {
  const { id } = req.params;
  const { mode } = req.body as { mode?: string };

  // Validate mode
  if (!mode || !['PAPER', 'LIVE'].includes(mode)) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'mode must be PAPER or LIVE',
    });
    return;
  }

  // Check if strategy exists
  const strategy = await strategyService.getStrategy(id);

  if (!strategy) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Strategy not found',
    });
    return;
  }

  // Check strategy status
  if (strategy.status !== 'STOPPED' && strategy.status !== 'DRAFT') {
    res.status(400).json({
      error: 'INVALID_STATE',
      message: `Cannot start strategy in ${strategy.status} state. Must be STOPPED or DRAFT.`,
    });
    return;
  }

  // Precondition 1: Check kill switch
  try {
    await killSwitchService.checkAndThrow();
  } catch (error) {
    if (error instanceof Error && error.name === 'KillSwitchActiveError') {
      const state: import('@ai-trader/shared').KillSwitchState | null =
        await killSwitchService.getState();
      res.status(503).json({
        error: 'KILL_SWITCH_ACTIVE',
        message:
          'Emergency stop is active. Cannot start strategies until cleared by administrator.',
        kill_switch_reason: state?.reason ?? 'unknown',
        activated_at: state?.activatedAt ?? null,
      });
      return;
    }
    throw error;
  }

  // Precondition 2-4: Delegate to ExecutionEngine which checks:
  // - Risk Service health
  // - Portfolio staleness
  // - Exchange connection (for LIVE mode)
  try {
    await executionEngine.startStrategy(id, mode as 'PAPER' | 'LIVE');

    // Strategy transitioned to STARTING
    const updated = await strategyService.getStrategy(id);

    res.json({
      id: updated!.id,
      status: updated!.status,
      mode,
    });
  } catch (error) {
    if (error instanceof Error) {
      // Service health check failures
      if (
        error.message.includes('Risk Service') ||
        error.message.includes('Portfolio') ||
        error.message.includes('Exchange')
      ) {
        res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: error.message,
          retry_after_seconds: 10,
        });
        return;
      }

      // Portfolio staleness
      if (error.message.includes('stale')) {
        res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Portfolio data stale, cannot validate risk limits',
          retry_after_seconds: 10,
        });
        return;
      }
    }

    // Unknown error - rethrow for error handler
    throw error;
  }
}

/**
 * POST /strategies/:id/stop
 * Stop running strategy
 */
export async function stopStrategy(
  req: Request,
  res: Response,
  executionEngine: ExecutionEngine,
  strategyService: StrategyService
): Promise<void> {
  const { id } = req.params;

  const strategy = await strategyService.getStrategy(id);

  if (!strategy) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Strategy not found',
    });
    return;
  }

  if (strategy.status !== 'RUNNING') {
    res.status(400).json({
      error: 'INVALID_STATE',
      message: `Cannot stop strategy in ${strategy.status} state. Must be RUNNING.`,
    });
    return;
  }

  await executionEngine.stopStrategy(id, 'USER_REQUESTED');

  const updated = await strategyService.getStrategy(id);

  res.json({
    id: updated!.id,
    status: updated!.status,
  });
}
