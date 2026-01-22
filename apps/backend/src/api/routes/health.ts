/**
 * Health Check Route
 * Provides system health status per API.md
 */

import type { Request, Response } from 'express';
import { getRedisClient, type RedisClient } from '@ai-trader/shared';
import pg from 'pg';

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

/**
 * Check database connection
 */
async function checkDatabase(): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return false;
  }

  const client = new pg.Client({ connectionString });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check Redis connection
 */
async function checkRedis(): Promise<boolean> {
  try {
    const redis = getRedisClient() as RedisClient;
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * GET /health
 * Returns health status of all services
 */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const [dbUp, redisUp] = await Promise.all([checkDatabase(), checkRedis()]);

  const allHealthy = dbUp && redisUp;
  const anyHealthy = dbUp || redisUp;

  const response: HealthCheckResponse = {
    status: allHealthy ? 'healthy' : anyHealthy ? 'degraded' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
    },
  };

  const statusCode = allHealthy ? 200 : anyHealthy ? 200 : 503;
  res.status(statusCode).json(response);
}
