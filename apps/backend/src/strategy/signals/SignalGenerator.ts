/**
 * Signal Generator Interface
 * Pure functions over candle data
 */

import type { Candle, StrategyConfig, TradingSignal } from '@ai-trader/shared';

export interface SignalGenerator {
  /**
   * Evaluate candles and generate trading signal
   * Must be deterministic: same inputs → same output
   *
   * @param config - Strategy configuration
   * @param candles - Array of candles ordered by timestamp DESC (newest first)
   * @param currentTimestamp - Current timestamp for signal generation
   * @returns Trading signal (BUY/SELL/HOLD)
   */
  generateSignal(config: StrategyConfig, candles: Candle[], currentTimestamp: Date): TradingSignal;
}
