/**
 * Idempotency Middleware
 * Ensures write operations are idempotent per ARCHITECTURE.md and API.md
 *
 * Critical for money-safety: prevents duplicate orders, fills, etc.
 */

import type { Request, Response, NextFunction } from 'express';
import { getRedisClient, type RedisClient } from '@ai-trader/shared';
import { config } from '../config';

interface IdempotencyRecord {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  timestamp: string;
}

/**
 * Validate idempotency key format (UUID v4)
 */
function isValidIdempotencyKey(key: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(key);
}

/**
 * Get Redis key for idempotency record
 */
function getIdempotencyKey(idempotencyKey: string, userId: string): string {
  return `idempotency:${userId}:${idempotencyKey}`;
}

/**
 * Idempotency middleware for write operations
 * Required for POST and PUT requests per API.md
 */
export function requireIdempotency(req: Request, res: Response, next: NextFunction): void {
  // Only apply to write operations
  if (req.method !== 'POST' && req.method !== 'PUT') {
    next();
    return;
  }

  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  // Require idempotency key for write operations
  if (!idempotencyKey) {
    res.status(400).json({
      error: 'MISSING_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key header is required for POST/PUT requests',
    });
    return;
  }

  // Validate format
  if (!isValidIdempotencyKey(idempotencyKey)) {
    res.status(400).json({
      error: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key must be a valid UUID v4',
    });
    return;
  }

  // Must be authenticated to use idempotency (need userId for key)
  if (!req.user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required for write operations',
    });
    return;
  }

  const redisKey = getIdempotencyKey(idempotencyKey, req.user.userId);
  const redis = getRedisClient() as RedisClient;

  // Check if this request was already processed
  redis
    .get(redisKey)
    .then((cachedResponse) => {
      if (cachedResponse) {
        // Request already processed
        const record: IdempotencyRecord = JSON.parse(cachedResponse) as IdempotencyRecord;

        // Return cached response
        res.status(record.status);

        // Set cached headers
        Object.entries(record.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });

        res.json(record.body);
        return;
      }

      // New request - store in-progress marker
      const inProgressRecord: IdempotencyRecord = {
        status: 0, // 0 indicates in-progress
        headers: {},
        body: { processing: true },
        timestamp: new Date().toISOString(),
      };

      redis
        .setex(redisKey, config.idempotency.ttlSeconds, JSON.stringify(inProgressRecord))
        .then(() => {
          // Intercept response to cache it
          const originalJson = res.json.bind(res);

          res.json = function (body: unknown): Response {
            // Cache the successful response
            const responseRecord: IdempotencyRecord = {
              status: res.statusCode,
              headers: {
                'content-type': res.getHeader('content-type')?.toString() || 'application/json',
              },
              body,
              timestamp: new Date().toISOString(),
            };

            // Fire-and-forget: cache the response
            redis
              .setex(redisKey, config.idempotency.ttlSeconds, JSON.stringify(responseRecord))
              .catch((err) => {
                console.error('Failed to cache idempotent response:', err);
              });

            return originalJson(body);
          };

          next();
        })
        .catch((err: Error) => {
          console.error('Redis error in idempotency middleware:', err);
          res.status(503).json({
            error: 'SERVICE_UNAVAILABLE',
            message: 'Idempotency service temporarily unavailable',
          });
        });
    })
    .catch((err: Error) => {
      console.error('Redis error checking idempotency:', err);
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Idempotency service temporarily unavailable',
      });
    });
}
