/**
 * Error Handling Middleware
 * Centralized error handling per API.md error format
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Not Found Handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
}

/**
 * Global Error Handler
 * Catches all unhandled errors
 */
export function errorHandler(err: Error, _req: Request, res: Response, next: NextFunction): void {
  console.error('Unhandled error:', err);

  // Avoid sending headers twice
  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}
