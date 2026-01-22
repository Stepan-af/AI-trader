/**
 * Express Application
 * API Gateway implementation per ARCHITECTURE.md
 */

import express, { type Express } from 'express';
import { config } from './config';
import {
  errorHandler,
  globalRateLimiter,
  notFoundHandler,
  validateBodyExists,
  validateContentType,
  writeRateLimiter,
} from './middleware';
import routes from './routes';

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // Trust proxy (for rate limiting by IP when behind reverse proxy)
  app.set('trust proxy', 1);

  // JSON body parser
  app.use(express.json());

  // Global middleware
  app.use(globalRateLimiter);
  app.use(writeRateLimiter);
  app.use(validateContentType);
  app.use(validateBodyExists);

  // API routes under /api/v1
  app.use(config.apiPrefix, routes);

  // Error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
