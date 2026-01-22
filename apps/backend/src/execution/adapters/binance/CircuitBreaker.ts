/**
 * Circuit Breaker
 * Implements circuit breaker pattern for exchange API failures
 * States: CLOSED (normal) → OPEN (fail-fast) → HALF_OPEN (testing)
 */

export interface CircuitBreakerConfig {
  failureThreshold: number; // Failures before opening (e.g., 5 out of 10 requests)
  successThreshold: number; // Successes to close from half-open (e.g., 3)
  timeout: number; // Time to wait before half-open (ms, e.g., 30000)
  windowSize: number; // Sliding window size (requests, e.g., 10)
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private successes: number = 0;
  private requestCount: number = 0;
  private lastFailureTime: number | null = null;
  private testRequests: number = 0;

  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly windowSize: number;

  // Sliding window for requests
  private requestWindow: boolean[] = []; // true = success, false = failure

  constructor(config: CircuitBreakerConfig) {
    this.failureThreshold = config.failureThreshold;
    this.successThreshold = config.successThreshold;
    this.timeout = config.timeout;
    this.windowSize = config.windowSize;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        this.testRequests = 0;
      } else {
        throw new Error('EXCHANGE_UNAVAILABLE: Circuit breaker open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record successful request
   */
  private onSuccess(): void {
    this.requestCount++;
    this.requestWindow.push(true);

    // Trim window
    if (this.requestWindow.length > this.windowSize) {
      this.requestWindow.shift();
    }

    if (this.state === 'HALF_OPEN') {
      this.testRequests++;
      // If enough successful test requests, close circuit
      if (this.testRequests >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failures = 0;
        this.testRequests = 0;
        this.requestWindow = [];
      }
    }

    // Reset failure counter if in CLOSED state
    if (this.state === 'CLOSED') {
      this.successes++;
    }
  }

  /**
   * Record failed request
   */
  private onFailure(): void {
    this.requestCount++;
    this.failures++;
    this.lastFailureTime = Date.now();
    this.requestWindow.push(false);

    // Trim window
    if (this.requestWindow.length > this.windowSize) {
      this.requestWindow.shift();
    }

    // Check if we should open circuit
    if (this.state === 'CLOSED' && this.shouldOpen()) {
      this.state = 'OPEN';
      this.testRequests = 0;
    }

    // If failure in HALF_OPEN, return to OPEN
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.testRequests = 0;
    }
  }

  /**
   * Determine if circuit should open based on failure threshold
   */
  private shouldOpen(): boolean {
    // Need at least windowSize requests to evaluate
    if (this.requestWindow.length < this.windowSize) {
      return false;
    }

    // Count failures in window
    const failuresInWindow = this.requestWindow.filter((success) => !success).length;

    // Open if failure rate exceeds threshold
    return failuresInWindow >= this.failureThreshold;
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get state as number for metrics (0=CLOSED, 1=OPEN, 2=HALF_OPEN)
   */
  getStateNumber(): number {
    switch (this.state) {
      case 'CLOSED':
        return 0;
      case 'OPEN':
        return 1;
      case 'HALF_OPEN':
        return 2;
    }
  }

  /**
   * Get failure count
   */
  getFailures(): number {
    return this.failures;
  }

  /**
   * Get request count
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Reset circuit breaker (for testing/manual intervention)
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.testRequests = 0;
    this.requestWindow = [];
  }
}

/**
 * Create default circuit breaker for Binance API
 */
export function createBinanceCircuitBreaker(): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 5, // 5 failures out of...
    successThreshold: 3, // Need 3 successes to close
    timeout: 30000, // Wait 30s before testing
    windowSize: 10, // ...10 requests
  });
}
