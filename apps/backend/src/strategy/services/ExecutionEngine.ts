/**
 * Strategy Execution Engine
 * Orchestrates signal generation and order placement
 * Per ARCHITECTURE.md: "Strategies are pure functions over candle data"
 */

import type { Candle, Strategy, StrategyConfig, TradingSignal } from '@ai-trader/shared';
import type { Pool } from 'pg';
import type { KillSwitchService } from '../../execution/services/KillSwitchService';
import type { OrderService } from '../../execution/services/OrderService';
import { CandleRepository } from '../repositories/CandleRepository';
import { StrategyRepository } from '../repositories/StrategyRepository';
import { DCASignalGenerator } from '../signals/DCASignalGenerator';
import { GridSignalGenerator } from '../signals/GridSignalGenerator';
import type { SignalGenerator } from '../signals/SignalGenerator';
import { SwingSignalGenerator } from '../signals/SwingSignalGenerator';

export interface HealthCheckResult {
  portfolioHealthy: boolean;
  riskServiceHealthy: boolean;
  reason?: string;
}

/**
 * ExecutionEngine
 * Manages strategy lifecycle and signal execution
 */
export class ExecutionEngine {
  private readonly strategyRepo: StrategyRepository;
  private readonly candleRepo: CandleRepository;
  private readonly signalGenerators: Map<string, SignalGenerator>;

  constructor(
    private readonly pool: Pool,
    private readonly orderService: OrderService,
    private readonly killSwitchService: KillSwitchService
  ) {
    this.strategyRepo = new StrategyRepository(pool);
    this.candleRepo = new CandleRepository(pool);

    // Initialize signal generators
    this.signalGenerators = new Map([
      ['DCA', new DCASignalGenerator()],
      ['GRID', new GridSignalGenerator()],
      ['SWING', new SwingSignalGenerator()],
    ]);
  }

  /**
   * Start a strategy
   * Transitions: STOPPED → STARTING → RUNNING
   * Validates health checks before starting
   * Per ADR-011, ADR-012: Blocks start if kill switch is active
   */
  async startStrategy(strategyId: string, userId: string): Promise<Strategy> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Check kill switch (per ADR-011: system-wide check)
      await this.killSwitchService.checkAndThrow();

      // 2. Load strategy
      const strategy = await this.strategyRepo.findById(strategyId, client);
      if (!strategy) {
        throw new Error(`Strategy ${strategyId} not found`);
      }

      if (strategy.userId !== userId) {
        throw new Error(`Unauthorized: Strategy ${strategyId} does not belong to user ${userId}`);
      }

      // 3. Validate current status
      if (strategy.status !== 'STOPPED' && strategy.status !== 'DRAFT') {
        throw new Error(`Cannot start strategy in ${strategy.status} status`);
      }

      // 4. Health checks
      const healthCheck = await this.performHealthChecks(userId);
      if (!healthCheck.portfolioHealthy || !healthCheck.riskServiceHealthy) {
        throw new Error(`Health check failed: ${healthCheck.reason}`);
      }

      // 5. Transition to STARTING
      const startingStrategy = await this.strategyRepo.updateStatus(strategyId, 'STARTING', client);

      await client.query('COMMIT');

      // 6. Async: Transition to RUNNING after initialization
      // For MVP: Immediate transition (no async init needed)
      setImmediate(() => {
        void (async (): Promise<void> => {
          try {
            await this.strategyRepo.updateStatus(strategyId, 'RUNNING');
          } catch (error) {
            console.error(`Failed to transition strategy ${strategyId} to RUNNING:`, error);
            await this.strategyRepo.updateStatus(strategyId, 'ERROR');
          }
        })();
      });

      return startingStrategy;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Stop a strategy
   * Transitions: RUNNING → STOPPING → STOPPED
   */
  async stopStrategy(strategyId: string, userId: string): Promise<Strategy> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Load strategy
      const strategy = await this.strategyRepo.findById(strategyId, client);
      if (!strategy) {
        throw new Error(`Strategy ${strategyId} not found`);
      }

      if (strategy.userId !== userId) {
        throw new Error(`Unauthorized: Strategy ${strategyId} does not belong to user ${userId}`);
      }

      // 2. Validate current status
      if (strategy.status !== 'RUNNING' && strategy.status !== 'ERROR') {
        throw new Error(`Cannot stop strategy in ${strategy.status} status`);
      }

      // 3. Transition to STOPPING
      const stoppingStrategy = await this.strategyRepo.updateStatus(strategyId, 'STOPPING', client);

      await client.query('COMMIT');

      // 4. Async: Transition to STOPPED after cleanup
      // For MVP: Immediate transition (no async cleanup needed)
      setImmediate(() => {
        void (async (): Promise<void> => {
          try {
            await this.strategyRepo.updateStatus(strategyId, 'STOPPED');
          } catch (error) {
            console.error(`Failed to transition strategy ${strategyId} to STOPPED:`, error);
          }
        })();
      });

      return stoppingStrategy;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute strategy - evaluate signals and place orders
   * Called periodically by background worker
   * Must be idempotent: safe to call multiple times
   */
  async executeStrategy(strategyId: string): Promise<TradingSignal> {
    // 1. Load strategy
    const strategy = await this.strategyRepo.findById(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    // 2. Only execute RUNNING strategies
    if (strategy.status !== 'RUNNING') {
      return {
        strategyId,
        symbol: strategy.config.symbol,
        type: 'HOLD',
        timestamp: new Date(),
        reason: `Strategy not running (status: ${strategy.status})`,
      };
    }

    // 3. Fetch latest candles
    const candles = await this.candleRepo.getLatestCandles(
      strategy.config.symbol,
      strategy.config.timeframe,
      100 // Fetch enough for technical indicators
    );

    // 4. Generate signal
    const signal = this.generateSignal(strategy.config, candles, new Date());
    signal.strategyId = strategyId;

    // 5. Execute signal (place order if actionable)
    if (signal.type === 'BUY' || signal.type === 'SELL') {
      await this.placeOrder(strategy, signal);
    }

    return signal;
  }

  /**
   * Generate trading signal using appropriate generator
   */
  private generateSignal(
    config: StrategyConfig,
    candles: Candle[],
    timestamp: Date
  ): TradingSignal {
    const generator = this.signalGenerators.get(config.type);
    if (!generator) {
      throw new Error(`Unknown strategy type: ${config.type}`);
    }

    return generator.generateSignal(config, candles, timestamp);
  }

  /**
   * Place order via Execution Service
   */
  private async placeOrder(strategy: Strategy, signal: TradingSignal): Promise<void> {
    const { config } = strategy;

    // Determine order quantity based on strategy type
    let quantity: number;

    if (config.dca?.amountPerOrder) {
      quantity = config.dca.amountPerOrder;
    } else if (config.grid) {
      // For grid: use a fixed amount (simplified for MVP)
      // In production: would calculate based on grid level
      quantity = 100; // Placeholder
    } else {
      // Swing: use risk-based sizing (simplified for MVP)
      quantity = 100; // Placeholder
    }

    // Only place orders for BUY or SELL signals
    if (signal.type !== 'BUY' && signal.type !== 'SELL') {
      return;
    }

    // Place order via OrderService
    await this.orderService.createOrder({
      userId: strategy.userId,
      strategyId: strategy.id,
      symbol: signal.symbol,
      side: signal.type,
      type: 'MARKET', // MVP: Always market orders
      quantity,
    });
  }

  /**
   * Perform health checks before starting strategy
   * Per API.md: Check Portfolio not stale, Risk Service responsive
   */
  private performHealthChecks(_userId: string): Promise<HealthCheckResult> {
    // MVP: Stub implementation - always returns healthy
    // TODO: Implement actual health checks in future commits
    // - Query Portfolio Service for staleness
    // - Ping Risk Service for responsiveness

    return Promise.resolve({
      portfolioHealthy: true,
      riskServiceHealthy: true,
    });
  }
}
