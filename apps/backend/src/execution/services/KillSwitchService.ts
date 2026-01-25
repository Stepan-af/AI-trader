/**
 * Kill Switch Service
 * Global emergency stop mechanism per ADR-011, ADR-012, ADR-023
 * Stored in Redis for fast read/write across all instances
 */

import type { KillSwitchReason, KillSwitchState } from '@ai-trader/shared';
import type Redis from 'ioredis';

const KILL_SWITCH_KEY = 'kill_switch:global';

export class KillSwitchService {
  constructor(private readonly redis: Redis) {}

  /**
   * Check if kill switch is currently active
   * Used before every strategy start
   */
  async isActive(): Promise<boolean> {
    const state = await this.getState();
    return state.active;
  }

  /**
   * Get full kill switch state with metadata
   */
  async getState(): Promise<KillSwitchState> {
    const data = await this.redis.get(KILL_SWITCH_KEY);

    if (!data) {
      // Default state: inactive
      return {
        active: false,
        reason: null,
        activatedAt: null,
        activatedBy: null,
      };
    }

    const parsed = JSON.parse(data);
    return {
      active: parsed.active,
      reason: parsed.reason,
      activatedAt: parsed.activatedAt ? new Date(parsed.activatedAt) : null,
      activatedBy: parsed.activatedBy,
    };
  }

  /**
   * Activate kill switch
   * Blocks all new strategy starts until cleared
   *
   * @param reason - Why kill switch was activated
   * @param activatedBy - userId or 'system' for auto-trigger
   */
  async activate(reason: KillSwitchReason, activatedBy: string): Promise<void> {
    const state: KillSwitchState = {
      active: true,
      reason,
      activatedAt: new Date(),
      activatedBy,
    };

    await this.redis.set(KILL_SWITCH_KEY, JSON.stringify(state));
  }

  /**
   * Deactivate kill switch
   * Per ADR-023: Should only be called after verifying all preconditions
   * (reconciliation complete, services healthy, etc.)
   *
   * For MVP: No precondition checks implemented here (caller's responsibility)
   * Future: Add precondition validation
   */
  async deactivate(): Promise<void> {
    await this.redis.del(KILL_SWITCH_KEY);
  }

  /**
   * Check if kill switch is active and throw if so
   * Convenience method for strategy start flow
   *
   * @throws {Error} If kill switch is active
   */
  async checkAndThrow(): Promise<void> {
    const state = await this.getState();

    if (state.active) {
      const activatedAt = state.activatedAt?.toISOString() ?? 'unknown';
      throw new KillSwitchActiveError(
        `Emergency stop is active. Cannot start strategies until cleared by administrator.`,
        state.reason ?? 'unknown',
        activatedAt,
      );
    }
  }
}

/**
 * Custom error for kill switch active state
 * Includes metadata for API responses per API.md
 */
export class KillSwitchActiveError extends Error {
  public readonly code = 'KILL_SWITCH_ACTIVE';
  public readonly statusCode = 503;

  constructor(
    message: string,
    public readonly killSwitchReason: string,
    public readonly activatedAt: string,
  ) {
    super(message);
    this.name = 'KillSwitchActiveError';
    Object.setPrototypeOf(this, KillSwitchActiveError.prototype);
  }
}
