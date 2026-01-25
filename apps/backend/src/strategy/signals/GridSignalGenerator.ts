/**
 * Grid Signal Generator
 * Price level-based buy/sell signals
 */

import type { Candle, StrategyConfig, TradingSignal } from '@ai-trader/shared';
import type { SignalGenerator } from './SignalGenerator';

export class GridSignalGenerator implements SignalGenerator {
  /**
   * Grid logic:
   * - Divide price range [lowerBound, upperBound] into N levels
   * - BUY if price crosses below a grid level
   * - SELL if price crosses above a grid level
   * - HOLD if price is stable or no cross detected
   *
   * For MVP: Simplified to just check current price against grid levels
   * In production: Would track filled grid levels and only trade at unfilled levels
   */
  generateSignal(config: StrategyConfig, candles: Candle[], currentTimestamp: Date): TradingSignal {
    if (!config.grid) {
      throw new Error('Grid config missing');
    }

    const { lowerBound, upperBound } = config.grid;

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

    // Get latest price
    const latestCandle = candles[0];
    const currentPrice = latestCandle.close;

    // Check if price is within grid bounds
    if (currentPrice < lowerBound) {
      return {
        strategyId: '',
        symbol: config.symbol,
        type: 'BUY',
        timestamp: currentTimestamp,
        reason: `Price ${currentPrice} below grid lower bound ${lowerBound}`,
      };
    }

    if (currentPrice > upperBound) {
      return {
        strategyId: '',
        symbol: config.symbol,
        type: 'SELL',
        timestamp: currentTimestamp,
        reason: `Price ${currentPrice} above grid upper bound ${upperBound}`,
      };
    }

    // Price is within bounds - simplified MVP logic: HOLD
    // In production: Would check if we need to rebalance grid levels
    return {
      strategyId: '',
      symbol: config.symbol,
      type: 'HOLD',
      timestamp: currentTimestamp,
      reason: `Price ${currentPrice} within grid bounds [${lowerBound}, ${upperBound}]`,
    };
  }
}
