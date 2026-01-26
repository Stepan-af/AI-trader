/**
 * API Gateway Server
 * HTTP server entry point
 */

import { createApp } from './app';
import { config } from './config';
import { initializeServices } from './init';
import { validateEnvironment } from './validateEnv';

async function start() {
  // Validate environment variables before proceeding
  try {
    validateEnvironment();
  } catch (error) {
    /* eslint-disable no-console */
    console.error('Environment validation failed:');
    console.error((error as Error).message);
    /* eslint-enable no-console */
    process.exit(1);
  }

  // Initialize all services and wire routes
  await initializeServices();

  // Create and start Express app
  const app = createApp();

  const server = app.listen(config.port, () => {
    /* eslint-disable no-console */
    console.log(`API Gateway listening on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`API base URL: http://localhost:${config.port}${config.apiPrefix}`);
    /* eslint-enable no-console */
  });

  /**
   * Graceful shutdown
   */
  process.on('SIGTERM', () => {
    /* eslint-disable no-console */
    console.log('SIGTERM received, shutting down gracefully...');
    /* eslint-enable no-console */
    server.close(() => {
      /* eslint-disable no-console */
      console.log('Server closed');
      /* eslint-enable no-console */
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    /* eslint-disable no-console */
    console.log('SIGINT received, shutting down gracefully...');
    /* eslint-enable no-console */
    server.close(() => {
      /* eslint-disable no-console */
      console.log('Server closed');
      /* eslint-enable no-console */
      process.exit(0);
    });
  });

  return server;
}

// Start server
start().catch((error) => {
  /* eslint-disable no-console */
  console.error('Failed to start server:', error);
  /* eslint-enable no-console */
  process.exit(1);
});
