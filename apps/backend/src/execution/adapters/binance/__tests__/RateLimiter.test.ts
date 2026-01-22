/**
 * Rate Limiter Tests
 * Tests token bucket algorithm for Binance rate limiting
 */

import { RateLimiter } from '../RateLimiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      capacity: 10,
      refillRate: 2, // 2 tokens per second
      maxQueueSize: 5,
      maxWaitMs: 2000,
    });
  });

  afterEach(() => {
    rateLimiter.stop();
  });

  it('should allow immediate acquire when tokens available', async () => {
    const start = Date.now();
    await rateLimiter.acquire();
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100); // Should be immediate
    expect(rateLimiter.getAvailableTokens()).toBe(9);
  });

  it('should queue requests when no tokens available', async () => {
    // Exhaust all tokens
    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire();
    }

    expect(rateLimiter.getAvailableTokens()).toBe(0);

    // Next request should be queued
    const promise = rateLimiter.acquire();
    expect(rateLimiter.getQueueDepth()).toBe(1);

    await promise;
  });

  it('should reject when queue is full', async () => {
    // Exhaust all tokens
    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire();
    }

    // Fill queue
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(rateLimiter.acquire().catch(() => {})); // Handle rejections
    }

    // Queue is full, next request should be rejected
    await expect(rateLimiter.acquire()).rejects.toThrow('RATE_LIMIT_QUEUE_FULL');

    // Wait for queued promises to complete
    await Promise.all(promises);
  }, 5000);

  it('should refill tokens over time', async () => {
    // Exhaust all tokens
    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire();
    }

    expect(rateLimiter.getAvailableTokens()).toBe(0);

    // Wait for refill (2 tokens per second)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Should have ~2-3 tokens
    const tokens = rateLimiter.getAvailableTokens();
    expect(tokens).toBeGreaterThanOrEqual(2);
    expect(tokens).toBeLessThanOrEqual(4);
  }, 5000);

  it('should process queued requests when tokens become available', async () => {
    // Exhaust all tokens
    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire();
    }

    // Queue 2 requests
    const promise1 = rateLimiter.acquire();
    const promise2 = rateLimiter.acquire();

    expect(rateLimiter.getQueueDepth()).toBe(2);

    // Wait for promises to resolve (should happen when tokens refill)
    await Promise.all([promise1, promise2]);

    expect(rateLimiter.getQueueDepth()).toBe(0);
  }, 5000);

  it('should respect maximum capacity', async () => {
    // Start with full capacity
    expect(rateLimiter.getAvailableTokens()).toBe(10);

    // Wait for potential over-refill
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Should not exceed capacity
    expect(rateLimiter.getAvailableTokens()).toBeLessThanOrEqual(10);
  });
});
