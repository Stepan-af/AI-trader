/**
 * API Routes
 * Route definitions and exports
 */

import { Router } from 'express';
import { healthCheck } from './health';

const router = Router();

/**
 * Health check endpoint (no auth required)
 */
router.get('/health', healthCheck);

/**
 * Placeholder routes for future implementation
 * These will be implemented in subsequent commits
 */

// Authentication routes (Commit 5+)
// router.post('/auth/login', ...);
// router.post('/auth/refresh', ...);

// Strategy routes (Commit 13-14)
// router.get('/strategies', authenticateJWT, ...);
// router.post('/strategies', authenticateJWT, requireIdempotency, ...);

// Order routes (Commit 5-8)
// router.get('/orders', authenticateJWT, ...);
// router.post('/orders', authenticateJWT, requireIdempotency, ...);

// Portfolio routes (Commit 11-12)
// router.get('/portfolio/positions', authenticateJWT, ...);
// router.get('/portfolio/balances', authenticateJWT, ...);

export default router;
