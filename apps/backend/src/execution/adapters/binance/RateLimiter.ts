/**
 * Token Bucket Rate Limiter
 * Implements token bucket algorithm for Binance order rate limiting
 * Capacity: 50 tokens, Refill: 5 tokens/second
 */

export interface RateLimiterConfig {
  capacity: number; // Maximum tokens
  refillRate: number; // Tokens added per second
  maxQueueSize: number; // Maximum queued requests
  maxWaitMs: number; // Maximum wait time in queue
}

interface QueuedRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export class RateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly maxQueueSize: number;
  private readonly maxWaitMs: number;
  private lastRefill: number;
  private queue: QueuedRequest[] = [];
  private refillInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimiterConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.maxQueueSize = config.maxQueueSize;
    this.maxWaitMs = config.maxWaitMs;
    this.tokens = config.capacity; // Start with full capacity
    this.lastRefill = Date.now();

    // Start refill interval (1 second)
    this.startRefillInterval();
  }

  /**
   * Acquire token for rate limiting
   * Returns immediately if token available, queues otherwise
   */
  async acquire(): Promise<void> {
    // If tokens available, consume and return
    if (this.tokens > 0) {
      this.tokens--;
      return Promise.resolve();
    }

    // If queue full, reject immediately
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('RATE_LIMIT_QUEUE_FULL');
    }

    // Queue request
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        resolve,
        reject,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Get current queue depth
   */
  getQueueDepth(): number {
    return this.queue.length;
  }

  /**
   * Get available tokens
   */
  getAvailableTokens(): number {
    return this.tokens;
  }

  /**
   * Start token refill interval
   */
  private startRefillInterval(): void {
    this.refillInterval = setInterval(() => {
      this.refillTokens();
    }, 1000); // Run every second
  }

  /**
   * Refill tokens based on refill rate
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;

    // Add tokens based on elapsed time and refill rate
    const tokensToAdd = Math.floor(elapsedSeconds * this.refillRate);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;

      // Process queued requests
      this.processQueue();
    }

    // Check for expired queue items
    this.checkQueueTimeouts();
  }

  /**
   * Process queued requests with available tokens
   */
  private processQueue(): void {
    while (this.queue.length > 0 && this.tokens > 0) {
      const request = this.queue.shift();
      if (request) {
        this.tokens--;
        request.resolve();
      }
    }
  }

  /**
   * Check for and reject timed-out queue items
   */
  private checkQueueTimeouts(): void {
    const now = Date.now();
    const expiredRequests: QueuedRequest[] = [];

    // Find expired requests
    this.queue = this.queue.filter((req) => {
      if (now - req.timestamp > this.maxWaitMs) {
        expiredRequests.push(req);
        return false;
      }
      return true;
    });

    // Reject expired requests
    expiredRequests.forEach((req) => {
      req.reject(new Error('RATE_LIMIT_QUEUE_TIMEOUT'));
    });
  }

  /**
   * Stop refill interval (for cleanup)
   */
  stop(): void {
    if (this.refillInterval) {
      clearInterval(this.refillInterval);
      this.refillInterval = null;
    }

    // Reject all queued requests
    this.queue.forEach((req) => {
      req.reject(new Error('RATE_LIMITER_STOPPED'));
    });
    this.queue = [];
  }
}

/**
 * Create default Binance rate limiter
 * 50 orders per 10 seconds = 5 tokens/second
 */
export function createBinanceRateLimiter(): RateLimiter {
  return new RateLimiter({
    capacity: 50,
    refillRate: 5,
    maxQueueSize: 100,
    maxWaitMs: 30000, // 30 seconds
  });
}
