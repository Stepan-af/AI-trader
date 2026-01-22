/**
 * Request Validation Middleware
 * Validates request format per API.md
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Validate JSON content type for POST/PUT
 */
export function validateContentType(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'POST' || req.method === 'PUT') {
    const contentType = req.headers['content-type'];

    if (!contentType || !contentType.includes('application/json')) {
      res.status(415).json({
        error: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/json for POST/PUT requests',
      });
      return;
    }
  }

  next();
}

/**
 * Validate request body exists for POST/PUT
 */
export function validateBodyExists(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!req.body || Object.keys(req.body).length === 0) {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Request body is required for POST/PUT requests',
      });
      return;
    }
  }

  next();
}
