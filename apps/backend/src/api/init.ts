/**
 * Service Initialization
 * Creates and wires all service instances for API Gateway
 */

import { createRedisClient } from '@ai-trader/shared';
import { BacktestService } from '../backtest/services/BacktestService';
import { createDatabasePool } from '../execution/database';
import { FillRepository } from '../execution/repositories/FillRepository';
import { OrderRepository } from '../execution/repositories/OrderRepository';
import { KillSwitchService } from '../execution/services/KillSwitchService';
import { OrderService } from '../execution/services/OrderService';
import { HealthCheckService } from '../monitoring/HealthCheckService';
import { PortfolioService } from '../portfolio/services/PortfolioService';
import { ExecutionEngine } from '../strategy/services/ExecutionEngine';
import { StrategyService } from '../strategy/services/StrategyService';
import { initializeRoutes } from './routes';

/**
 * Initialize all services and wire them to routes
 * Must be called before starting the server
 */
export async function initializeServices(): Promise<void> {
  /* eslint-disable no-console */
  console.log('Initializing services...');

  // Create database connection pool (single pool for MVP)
  const pool = createDatabasePool();

  // Create Redis client
  const redis = createRedisClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: 3,
  });

  // Wait for Redis to connect
  await new Promise<void>((resolve, reject) => {
    redis.once('ready', () => resolve());
    redis.once('error', (err) => reject(err));
  });

  // Create repositories
  const orderRepository = new OrderRepository(pool);
  const fillRepository = new FillRepository(pool);

  // Create services
  const killSwitchService = new KillSwitchService(redis);
  const portfolioService = new PortfolioService(pool);
  const strategyService = new StrategyService(pool);
  const orderService = new OrderService(pool);
  const backtestService = new BacktestService(pool);
  const healthCheckService = new HealthCheckService(pool);

  // Create execution engine
  const executionEngine = new ExecutionEngine(pool, orderService, killSwitchService);

  // Initialize routes with service dependencies
  initializeRoutes({
    strategyService,
    executionEngine,
    killSwitchService,
    portfolioService,
    orderRepository,
    fillRepository,
    backtestService,
    healthCheckService,
    pool,
  });

  console.log('Services initialized successfully');
  /* eslint-enable no-console */
}

/**
 * Cleanup all service connections
 */
export function cleanupServices(): void {
  /* eslint-disable no-console */
  console.log('Cleaning up services...');
  // TODO: Close database pools and Redis connection
  // This will be implemented when we add proper lifecycle management
  console.log('Services cleaned up');
  /* eslint-enable no-console */
}
