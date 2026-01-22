/**
 * API Gateway Server
 * HTTP server entry point
 */

import { createApp } from './app';
import { config } from './config';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`API Gateway listening on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`API base URL: http://localhost:${config.port}${config.apiPrefix}`);
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { server };
