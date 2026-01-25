/**
 * API Routes
 * Route definitions and exports
 */

import { Router } from 'express';
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
 */
router.post('/risk/validate', validateRisk);

/**
 * Admin endpoint to clear risk approval cache
 * Per ARCHITECTURE.md: Manual cache invalidation
 */
router.post('/admin/risk-cache/clear', clearRiskCache);

/**
 * Initialize routes with service dependencies
 * Must be called before app starts
 */
export function initializeRoutes(services: {
  strategyService: import('../../strategy/services/StrategyService').StrategyService;
  executionEngine: import('../../strategy/services/ExecutionEngine').ExecutionEngine;
  killSwitchService: import('../../execution/services/KillSwitchService').KillSwitchService;
  portfolioService: import('../../portfolio/services/PortfolioService').PortfolioService;
  orderRepository: import('../../execution/repositories/OrderRepository').OrderRepository;
  fillRepository: import('../../execution/repositories/FillRepository').FillRepository;
}): void {
  if (servicesInitialized) {
    throw new Error('Routes already initialized');
  }

  // Import route handlers
  const strategyRoutes = require('./strategies');
  const portfolioRoutes = require('./portfolio');
  const orderRoutes = require('./orders');

  // Strategy routes
  router.get('/strategies', (req, res) =>
    strategyRoutes.listStrategies(req, res, services.strategyService)
  );
  router.post('/strategies', (req, res) =>
    strategyRoutes.createStrategy(req, res, services.strategyService)
  );
  router.put('/strategies/:id', (req, res) =>
    strategyRoutes.updateStrategy(req, res, services.strategyService)
  );
  router.delete('/strategies/:id', (req, res) =>
    strategyRoutes.deleteStrategy(req, res, services.strategyService)
  );
  router.post('/strategies/:id/start', (req, res) =>
    strategyRoutes.startStrategy(
      req,
      res,
      services.strategyService,
      services.executionEngine,
      services.killSwitchService
    )
  );
  router.post('/strategies/:id/stop', (req, res) =>
    strategyRoutes.stopStrategy(req, res, services.executionEngine, services.strategyService)
  );

  // Portfolio routes
  router.get('/portfolio', (req, res) =>
    portfolioRoutes.getPortfolioOverview(req, res, services.portfolioService)
  );
  router.get('/portfolio/positions', (req, res) =>
    portfolioRoutes.getPositions(req, res, services.portfolioService)
  );
  router.get('/portfolio/pnl', (req, res) =>
    portfolioRoutes.getPnL(req, res, services.portfolioService)
  );

  // Order routes
  router.get('/orders', (req, res) =>
    orderRoutes.listOrders(req, res, services.orderRepository)
  );
  router.get('/orders/:id', (req, res) =>
    orderRoutes.getOrder(req, res, services.orderRepository)
  );
  router.get('/orders/:id/fills', (req, res) =>
    orderRoutes.getOrderFills(req, res, services.fillRepository, services.orderRepository)
  );

  servicesInitialized = true;
}

export { initializeRiskRoute };
export default router;
