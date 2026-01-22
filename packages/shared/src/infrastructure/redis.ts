/**
 * Redis Connection Configuration
 * Single Redis instance for jobs, cache, and pub/sub
 */

import Redis from 'ioredis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest: number;
  retryStrategy?: (times: number) => number | null;
}

/**
 * Parse Redis URL from environment
 */
export function parseRedisUrl(url: string): RedisConfig {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) : 0,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number): number | null => {
      if (times > 10) {
        return null; // Stop retrying
      }
      return Math.min(times * 100, 3000); // Exponential backoff, max 3s
    },
  };
}

/**
 * Create Redis client
 */
export function createRedisClient(config: RedisConfig): Redis {
  const client = new Redis(config);

  client.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  client.on('connect', () => {
    // Redis client connected
  });

  client.on('ready', () => {
    // Redis client ready
  });

  return client;
}

/**
 * Singleton Redis instance
 */
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const config = parseRedisUrl(redisUrl);
    redisClient = createRedisClient(config);
  }
  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Export Redis type for type safety in consumers
 */
export type { Redis };
export type RedisClient = Redis;
