/**
 * Rate Limiting Middleware
 * Prevents abuse per ARCHITECTURE.md
 */

import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Global rate limiter
 * 100 requests per minute per IP
 */
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
      retry_after_seconds: Math.ceil(config.rateLimit.windowMs / 1000),
    });
  },
});

/**
 * Strict rate limiter for write operations
 * 20 requests per minute per IP
 */
export const writeRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'RATE_LIMITED',
      message: 'Write operation rate limit exceeded. Please reduce request frequency.',
      retry_after_seconds: 60,
    });
  },
  skip: (req) => {
    // Only apply to write operations
    return req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'DELETE';
  },
});
