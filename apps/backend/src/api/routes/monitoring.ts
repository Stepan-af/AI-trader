/**
 * Monitoring Routes
 * Health checks and metrics endpoints
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import type { HealthCheckService } from '../../monitoring/HealthCheckService';
import { register } from '../../monitoring/metrics';

export function createMonitoringRoutes(healthCheckService: HealthCheckService): Router {
  const router = Router();

  /**
   * GET /health
   * Basic health check endpoint
   */
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const health = await healthCheckService.checkHealth();

      const statusCode =
        health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /health/detailed
   * Detailed health check with metrics (admin endpoint)
   */
  router.get('/health/detailed', async (_req: Request, res: Response) => {
    try {
      const health = await healthCheckService.checkDetailedHealth();

      const statusCode =
        health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /metrics
   * Prometheus metrics endpoint
   */
  router.get('/metrics', async (_req: Request, res: Response) => {
    try {
      // Set content type for Prometheus
      res.set('Content-Type', register.contentType);

      // Get metrics
      const metrics = await register.metrics();

      res.send(metrics);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to collect metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
