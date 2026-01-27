/**
 * API Routes
 * Route definitions and exports
 */

import { Router } from 'express';
import { authenticateJWT, requireIdempotency } from '../middleware';
import { healthCheck } from './health';
import { clearRiskCache, initializeRiskRoute, validateRisk } from './risk';

// Service instances will be injected during initialization
let servicesInitialized = false;

const router = Router();

/**
 * Health check endpoint (no auth required)
 */
router.get('/health', healthCheck);

/**
 * Risk validation endpoint (internal service-to-service)
 * Called by Execution Service before submitting orders
 * Protected by authentication to prevent external probing
 */
router.post('/risk/validate', authenticateJWT, validateRisk);

/**
 * Admin endpoint to clear risk approval cache
 * Per ARCHITECTURE.md: Manual cache invalidation
 * Requires authentication (admin-only in production)
 */
router.post('/admin/risk-cache/clear', authenticateJWT, clearRiskCache);

/**
 * Initialize routes with service dependencies
 * Must be called before app starts
 */
export function initializeRoutes(services: {
  strategyService: import('../../strategy/services/StrategyService').StrategyService;
  executionEngine: import('../../strategy/services/ExecutionEngine').ExecutionEngine;
  killSwitchService: import('../../execution/services/KillSwitchService').KillSwitchService;
  portfolioService: import('../../portfolio/services/PortfolioService').PortfolioService;
  riskService: import('../../risk/services/RiskService').RiskService;
  orderRepository: import('../../execution/repositories/OrderRepository').OrderRepository;
  fillRepository: import('../../execution/repositories/FillRepository').FillRepository;
  orderService: import('../../execution/services/OrderService').OrderService;
  backtestService: import('../../backtest/services/BacktestService').BacktestService;
  healthCheckService: import('../../monitoring/HealthCheckService').HealthCheckService;
  pool: import('pg').Pool;
}): void {
  if (servicesInitialized) {
    throw new Error('Routes already initialized');
  }

  // Import route handlers
  const strategyRoutes = require('./strategies');
  const portfolioRoutes = require('./portfolio');
  const orderRoutes = require('./orders');
  const { createBacktestRoutes } = require('./backtests');
  const { createMonitoringRoutes } = require('./monitoring');

  // Strategy routes - all require authentication
  router.get('/strategies', authenticateJWT, (req, res) =>
    strategyRoutes.listStrategies(req, res, services.strategyService)
  );
  router.post('/strategies', authenticateJWT, requireIdempotency, (req, res) =>
    strategyRoutes.createStrategy(req, res, services.strategyService)
  );
  router.put('/strategies/:id', authenticateJWT, requireIdempotency, (req, res) =>
    strategyRoutes.updateStrategy(req, res, services.strategyService)
  );
  router.delete('/strategies/:id', authenticateJWT, (req, res) =>
    strategyRoutes.deleteStrategy(req, res, services.strategyService)
  );
  router.post('/strategies/:id/start', authenticateJWT, requireIdempotency, (req, res) =>
    strategyRoutes.startStrategy(
      req,
      res,
      services.strategyService,
      services.executionEngine,
      services.killSwitchService,
      services.portfolioService,
      services.healthCheckService
    )
  );
  router.post('/strategies/:id/stop', authenticateJWT, requireIdempotency, (req, res) =>
    strategyRoutes.stopStrategy(req, res, services.executionEngine, services.strategyService)
  );

  // Portfolio routes - all require authentication
  router.get('/portfolio', authenticateJWT, (req, res) =>
    portfolioRoutes.getPortfolioOverview(req, res, services.portfolioService)
  );
  router.get('/portfolio/positions', authenticateJWT, (req, res) =>
    portfolioRoutes.getPositions(req, res, services.portfolioService)
  );
  router.get('/portfolio/pnl', authenticateJWT, (req, res) =>
    portfolioRoutes.getPnL(req, res, services.portfolioService)
  );

  // Order routes - all require authentication
  router.get('/orders', authenticateJWT, (req, res) =>
    orderRoutes.listOrders(req, res, services.orderRepository)
  );
  router.get('/orders/:id', authenticateJWT, (req, res) =>
    orderRoutes.getOrder(req, res, services.orderRepository)
  );
  router.get('/orders/:id/fills', authenticateJWT, (req, res) =>
    orderRoutes.getOrderFills(req, res, services.fillRepository, services.orderRepository)
  );
  router.post('/orders', authenticateJWT, requireIdempotency, (req, res) =>
    orderRoutes.placeOrder(
      req,
      res,
      services.orderService,
      services.killSwitchService,
      services.riskService
    )
  );
  router.post('/orders/:id/cancel', authenticateJWT, requireIdempotency, (req, res) =>
    orderRoutes.cancelOrder(req, res, services.orderService, services.orderRepository)
  );

  // Backtest routes - all require authentication per API.md
  router.use('/backtests', authenticateJWT, createBacktestRoutes(services.backtestService));

  // Monitoring routes (health checks and metrics)
  router.use('/', createMonitoringRoutes(services.healthCheckService));

  servicesInitialized = true;
}

export { initializeRiskRoute };
export default router;
