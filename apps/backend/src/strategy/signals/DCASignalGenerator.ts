/**
 * DCA Signal Generator
 * Time-based buy signals at fixed intervals
 */

import type { Candle, StrategyConfig, TradingSignal } from '@ai-trader/shared';
import type { SignalGenerator } from './SignalGenerator';

export class DCASignalGenerator implements SignalGenerator {
  /**
   * DCA logic:
   * - BUY signal if current time >= lastExecutionTime + interval
   * - HOLD otherwise
   *
   * For MVP: We use candle timestamp as execution marker
   * In production: Would track actual order placements in DB
   */
  generateSignal(config: StrategyConfig, candles: Candle[], currentTimestamp: Date): TradingSignal {
    if (!config.dca) {
      throw new Error('DCA config missing');
    }

    const { intervalSeconds } = config.dca;

    // If no candles, HOLD (wait for data)
    if (candles.length === 0) {
      return {
        strategyId: '', // Will be set by caller
        symbol: config.symbol,
        type: 'HOLD',
        timestamp: currentTimestamp,
        reason: 'No candles available',
      };
    }

    // Get latest candle (candles are ordered DESC)
    const latestCandle = candles[0];

    // Simple DCA logic: Check if interval has passed since last candle
    // In production: Would check lastOrderTimestamp from DB
    const intervalMs = intervalSeconds * 1000;
    const timeSinceLastCandle = currentTimestamp.getTime() - latestCandle.timestamp.getTime();

    if (timeSinceLastCandle >= intervalMs) {
      return {
        strategyId: '',
        symbol: config.symbol,
        type: 'BUY',
        timestamp: currentTimestamp,
        reason: `DCA interval elapsed (${intervalSeconds}s)`,
      };
    }

    return {
      strategyId: '',
      symbol: config.symbol,
      type: 'HOLD',
      timestamp: currentTimestamp,
      reason: `DCA interval not elapsed (${Math.floor(timeSinceLastCandle / 1000)}s / ${intervalSeconds}s)`,
    };
  }
}
