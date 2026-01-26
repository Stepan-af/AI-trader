/**
 * Portfolio Routes
 * HTTP endpoints for portfolio positions and PnL
 */

import type { Request, Response } from 'express';
import type { PortfolioService } from '../../portfolio/services/PortfolioService';

/**
 * GET /portfolio
 * Portfolio overview with balance, equity, PnL, and staleness indicators
 *
 * Per API.md:
 * - Returns data_as_of_timestamp (last update time)
 * - Returns is_stale flag (true if data age > 5 seconds)
 * - UI must display timestamp to user
 */
export async function getPortfolioOverview(
  req: Request,
  res: Response,
  portfolioService: PortfolioService
): Promise<void> {
  // User ID extracted from JWT by authenticateJWT middleware
  const userId = req.user!.userId;

  const overview = await portfolioService.getPortfolioOverview(userId);

  res.json({
    balance: overview.balance,
    equity: overview.equity,
    unrealized_pnl: overview.unrealizedPnl,
    realized_pnl: overview.realizedPnl,
    data_as_of_timestamp: overview.dataAsOfTimestamp.toISOString(),
    is_stale: overview.isStale,
  });
}

/**
 * GET /portfolio/positions
 * List all positions with unrealized PnL and staleness
 */
export async function getPositions(
  req: Request,
  res: Response,
  portfolioService: PortfolioService
): Promise<void> {
  // User ID extracted from JWT by authenticateJWT middleware
  const userId = req.user!.userId;

  const data = await portfolioService.getPositions(userId);

  res.json({
    items: data.positions.map((pos) => ({
      symbol: pos.symbol,
      quantity: pos.quantity,
      avg_entry_price: pos.avgEntryPrice,
      realized_pnl: pos.realizedPnl,
      unrealized_pnl: pos.unrealizedPnl,
      total_fees: pos.totalFees,
      data_as_of_timestamp: pos.dataAsOfTimestamp.toISOString(),
    })),
    data_as_of_timestamp: data.dataAsOfTimestamp.toISOString(),
    is_stale: data.isStale,
    meta: {
      total: data.positions.length,
      limit: 100,
      offset: 0,
    },
  });
}

/**
 * GET /portfolio/pnl
 * Get PnL breakdown (for future implementation)
 * Currently returns same data as portfolio overview
 */
export async function getPnL(
  req: Request,
  res: Response,
  portfolioService: PortfolioService
): Promise<void> {
  // User ID extracted from JWT by authenticateJWT middleware
  const userId = req.user!.userId;

  const overview = await portfolioService.getPortfolioOverview(userId);

  res.json({
    realized_pnl: overview.realizedPnl,
    unrealized_pnl: overview.unrealizedPnl,
    total_pnl: overview.realizedPnl + overview.unrealizedPnl,
    data_as_of_timestamp: overview.dataAsOfTimestamp.toISOString(),
    is_stale: overview.isStale,
  });
}
