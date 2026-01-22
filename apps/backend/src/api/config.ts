/**
 * API Gateway Configuration
 * Centralized configuration for Express server and middleware
 */

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: '/api/v1',
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
  },

  // Idempotency
  idempotency: {
    ttlSeconds: 24 * 60 * 60, // 24 hours
  },
};
