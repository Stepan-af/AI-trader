/**
 * API Gateway Configuration
 * Centralized configuration for Express server and middleware
 */

/**
 * Validate and get JWT secret
 * Throws error in production if JWT_SECRET not set
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret === 'your-secret-key-change-in-production') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_SECRET environment variable must be set to a secure value in production. ' +
          'Generate one with: openssl rand -hex 32'
      );
    }
    // Development fallback
    return 'dev-secret-unsafe-for-production';
  }

  return secret;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: '/api/v1',
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT Configuration
  jwt: {
    secret: getJwtSecret(),
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
