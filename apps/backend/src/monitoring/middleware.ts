/**
 * Metrics Middleware
 * Tracks HTTP request metrics
 */

import type { NextFunction, Request, Response } from 'express';
import { httpRequestCounter, httpRequestDuration } from './metrics';

/**
 * Middleware to track HTTP request metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Track response finish
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds

    // Get route pattern (e.g., /api/strategies/:id instead of /api/strategies/123)
    const route = req.route?.path || req.path;

    // Increment request counter
    httpRequestCounter.inc({
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    });

    // Record request duration
    httpRequestDuration.observe(
      {
        method: req.method,
        route,
      },
      duration
    );
  });

  next();
}
