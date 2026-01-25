/**
 * DCA Signal Generator Tests
 * Validates time-based buy signal logic
 */

import type { Candle, StrategyConfig } from '@ai-trader/shared';
import { DCASignalGenerator } from '../DCASignalGenerator';

describe('DCASignalGenerator', () => {
  let generator: DCASignalGenerator;

  beforeEach(() => {
    generator = new DCASignalGenerator();
  });

  const createDCAConfig = (intervalSeconds: number): StrategyConfig => ({
    name: 'Test DCA',
    type: 'DCA',
    symbol: 'BTCUSDT',
    timeframe: '1m',
    dca: {
      intervalSeconds,
      amountPerOrder: 100,
    },
    risk: {
      maxPositionSize: 1000,
    },
  });

  const createCandle = (timestamp: Date, close: number): Candle => ({
    id: '1',
    symbol: 'BTCUSDT',
    timeframe: '1m',
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  });

  describe('generateSignal', () => {
    it('should return HOLD when no candles available', () => {
      const config = createDCAConfig(60);
      const signal = generator.generateSignal(config, [], new Date());

      expect(signal.type).toBe('HOLD');
      expect(signal.reason).toBe('No candles available');
      expect(signal.symbol).toBe('BTCUSDT');
    });

    it('should return BUY when interval has elapsed', () => {
      const config = createDCAConfig(60); // 60 seconds interval

      const candleTimestamp = new Date('2024-01-01T00:00:00Z');
      const currentTimestamp = new Date('2024-01-01T00:01:01Z'); // 61 seconds later

      const candles = [createCandle(candleTimestamp, 50000)];
      const signal = generator.generateSignal(config, candles, currentTimestamp);

      expect(signal.type).toBe('BUY');
      expect(signal.reason).toContain('DCA interval elapsed');
      expect(signal.symbol).toBe('BTCUSDT');
      expect(signal.timestamp).toEqual(currentTimestamp);
    });

    it('should return HOLD when interval has not elapsed', () => {
      const config = createDCAConfig(60); // 60 seconds interval

      const candleTimestamp = new Date('2024-01-01T00:00:00Z');
      const currentTimestamp = new Date('2024-01-01T00:00:30Z'); // 30 seconds later

      const candles = [createCandle(candleTimestamp, 50000)];
      const signal = generator.generateSignal(config, candles, currentTimestamp);

      expect(signal.type).toBe('HOLD');
      expect(signal.reason).toContain('DCA interval not elapsed');
      expect(signal.reason).toContain('30s / 60s');
    });

    it('should return BUY exactly when interval elapses', () => {
      const config = createDCAConfig(60);

      const candleTimestamp = new Date('2024-01-01T00:00:00Z');
      const currentTimestamp = new Date('2024-01-01T00:01:00Z'); // Exactly 60 seconds

      const candles = [createCandle(candleTimestamp, 50000)];
      const signal = generator.generateSignal(config, candles, currentTimestamp);

      expect(signal.type).toBe('BUY');
    });

    it('should throw error if DCA config is missing', () => {
      const config: StrategyConfig = {
        name: 'Test',
        type: 'DCA',
        symbol: 'BTCUSDT',
        timeframe: '1m',
        risk: { maxPositionSize: 1000 },
      };

      expect(() => generator.generateSignal(config, [], new Date())).toThrow('DCA config missing');
    });

    it('should use latest candle when multiple candles provided', () => {
      const config = createDCAConfig(60);

      const oldCandle = createCandle(new Date('2024-01-01T00:00:00Z'), 49000);
      const latestCandle = createCandle(new Date('2024-01-01T00:01:00Z'), 50000);

      // Candles ordered DESC (newest first)
      const candles = [latestCandle, oldCandle];
      const currentTimestamp = new Date('2024-01-01T00:02:01Z');

      const signal = generator.generateSignal(config, candles, currentTimestamp);

      expect(signal.type).toBe('BUY');
      // Should calculate interval from latest candle (00:01:00), not old candle
    });

    it('should be deterministic - same inputs produce same output', () => {
      const config = createDCAConfig(60);
      const candleTimestamp = new Date('2024-01-01T00:00:00Z');
      const currentTimestamp = new Date('2024-01-01T00:01:01Z');
      const candles = [createCandle(candleTimestamp, 50000)];

      const signal1 = generator.generateSignal(config, candles, currentTimestamp);
      const signal2 = generator.generateSignal(config, candles, currentTimestamp);

      expect(signal1).toEqual(signal2);
    });
  });
});
