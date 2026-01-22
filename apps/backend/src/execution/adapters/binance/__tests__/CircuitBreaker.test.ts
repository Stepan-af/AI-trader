/**
 * Circuit Breaker Tests
 * Tests circuit breaker pattern for exchange API failures
 */

/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-floating-promises */

import { CircuitBreaker } from '../CircuitBreaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 5, // 5 failures out of...
      successThreshold: 3, // Need 3 successes to close
      timeout: 1000, // Wait 1s before testing
      windowSize: 10, // ...10 requests
    });
  });

  it('should start in CLOSED state', () => {
    expect(circuitBreaker.getState()).toBe('CLOSED');
  });

  it('should allow requests in CLOSED state', async () => {
    const result = await circuitBreaker.execute(async () => 'success');
    expect(result).toBe('success');
  });

  it('should track failures', async () => {
    for (let i = 0; i < 3; i++) {
      await circuitBreaker
        .execute(async () => {
          throw new Error('Test failure');
        })
        .catch(() => {
          // Expected
        });
    }

    expect(circuitBreaker.getFailures()).toBe(3);
  });

  it('should track successes', async () => {
    await circuitBreaker.execute(async () => 'success');
    await circuitBreaker.execute(async () => 'success');

    expect(circuitBreaker.getRequestCount()).toBe(2);
  });

  it('should reset correctly', async () => {
    // Generate some failures
    for (let i = 0; i < 2; i++) {
      await circuitBreaker
        .execute(async () => {
          throw new Error('Test failure');
        })
        .catch(() => {
          // Expected
        });
    }

    circuitBreaker.reset();

    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker.getFailures()).toBe(0);
    expect(circuitBreaker.getRequestCount()).toBe(0);
  });

  it('should return state as number', () => {
    expect(circuitBreaker.getStateNumber()).toBe(0); // CLOSED
  });
});
