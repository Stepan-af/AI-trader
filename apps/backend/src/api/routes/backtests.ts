/**
 * Backtest API Routes
 * Per API.md: POST /backtests, GET /backtests/:id
 */

import type { BacktestRun } from '@ai-trader/shared';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import type { BacktestService } from '../../backtest/services/BacktestService';
import { requireIdempotency } from '../middleware';

export function createBacktestRoutes(backtestService: BacktestService): Router {
  const router = Router();

  /**
   * POST /backtests
   * Start a new backtest
   * Per API.md: Requires Idempotency-Key header
   */
  router.post('/', requireIdempotency, (req: Request, res: Response, next: NextFunction): void => {
    handlePostBacktest(req, res, next, backtestService);
  });

  /**
   * GET /backtests/:id
   * Get backtest status and results
   */
  router.get('/:id', (req: Request, res: Response, next: NextFunction): void => {
    handleGetBacktest(req, res, next, backtestService);
  });

  /**
   * GET /backtests
   * List user's backtests
   */
  router.get('/', (req: Request, res: Response, next: NextFunction): void => {
    handleListBacktests(req, res, next, backtestService);
  });

  return router;
}

/**
 * Handle POST /backtests
 */
function handlePostBacktest(
  req: Request,
  res: Response,
  next: NextFunction,
  backtestService: BacktestService
): void {
  void (async (): Promise<void> => {
    try {
      const { strategyId, from, to, initialBalance } = req.body as {
        strategyId: string;
        from: string;
        to: string;
        initialBalance: number;
      };

      // Validate required fields
      if (!strategyId || !from || !to || !initialBalance) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Missing required fields: strategyId, from, to, initialBalance',
        });
        return;
      }

      // Parse dates
      const startDate = new Date(from);
      const endDate = new Date(to);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid date format. Use ISO 8601 format (e.g., 2024-01-01T00:00:00Z)',
        });
        return;
      }

      // Get strategy configuration
      // TODO: Fetch strategy from database using strategyId
      // For now, this is a placeholder - strategy service integration needed
      const strategyConfig = {
        name: 'Test Strategy',
        type: 'DCA' as const,
        symbol: 'BTCUSDT',
        timeframe: '1h' as const,
        risk: {
          maxPositionSize: 1.0,
          stopLoss: 0.05,
          takeProfit: 0.1,
        },
        dca: {
          intervalSeconds: 3600,
          amountPerOrder: 100,
        },
      };

      // Start backtest
      const backtestId = await backtestService.startBacktest({
        userId: req.user!.userId,
        strategyConfig,
        startDate,
        endDate,
        initialBalance,
      });

      res.status(201).json({ backtestId });
    } catch (error) {
      next(error);
    }
  })();
}

/**
 * Handle GET /backtests/:id
 */
function handleGetBacktest(
  req: Request,
  res: Response,
  next: NextFunction,
  backtestService: BacktestService
): void {
  void (async (): Promise<void> => {
    try {
      const { id } = req.params;

      const { run, result } = await backtestService.getBacktest(id);

      // Check authorization
      if (run.userId !== req.user!.userId) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Cannot access backtest belonging to another user',
        });
        return;
      }

      // Build response per API.md
      const response: {
        status: BacktestRun['status'];
        metrics?: {
          totalReturn: number;
          maxDrawdown: number;
          sharpe: number;
        };
        error?: string;
      } = {
        status: run.status,
      };

      if (run.status === 'COMPLETED' && result) {
        const totalReturn = (result.finalBalance - run.initialBalance) / run.initialBalance;
        response.metrics = {
          totalReturn,
          maxDrawdown: result.maxDrawdown,
          sharpe: result.sharpeRatio,
        };
      }

      if (run.status === 'FAILED') {
        // TODO: Add errorMessage field to BacktestRun in domain types
        response.error = 'Backtest failed';
      }

      res.json(response);
    } catch (error) {
      if (error instanceof Error && error.message === 'Backtest not found') {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Backtest not found',
        });
        return;
      }
      next(error);
    }
  })();
}

/**
 * Handle GET /backtests
 */
function handleListBacktests(
  req: Request,
  res: Response,
  next: NextFunction,
  backtestService: BacktestService
): void {
  void (async (): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const backtests = await backtestService.listBacktests(req.user!.userId, limit, offset);

      res.json({ backtests });
    } catch (error) {
      next(error);
    }
  })();
}
