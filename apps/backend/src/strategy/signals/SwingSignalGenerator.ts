/**
 * Swing Signal Generator
 * Rule-based signals using simple DSL evaluation
 */

import type { Candle, StrategyConfig, TradingSignal } from '@ai-trader/shared';
import type { SignalGenerator } from './SignalGenerator';

export class SwingSignalGenerator implements SignalGenerator {
  /**
   * Swing logic:
   * - Evaluate entry rule (DSL string) against candle data
   * - Evaluate exit rule (DSL string) against candle data
   * - BUY if entry rule matches
   * - SELL if exit rule matches
   * - HOLD otherwise
   *
   * For MVP: Stub implementation that always returns HOLD
   * DSL evaluation will be implemented in future commits
   * Per ARCHITECTURE.md: "Rule-based signal generation (DSL)"
   */
  generateSignal(config: StrategyConfig, candles: Candle[], currentTimestamp: Date): TradingSignal {
    if (!config.swing) {
      throw new Error('Swing config missing');
    }

    // If no candles, HOLD
    if (candles.length === 0) {
      return {
        strategyId: '',
        symbol: config.symbol,
        type: 'HOLD',
        timestamp: currentTimestamp,
        reason: 'No candles available',
      };
    }

    // MVP: DSL evaluation not implemented yet
    // TODO: Implement DSL parser and evaluator in future commit
    // For now, return HOLD with explanation
    return {
      strategyId: '',
      symbol: config.symbol,
      type: 'HOLD',
      timestamp: currentTimestamp,
      reason: 'DSL evaluation not implemented (MVP stub)',
    };
  }
}
