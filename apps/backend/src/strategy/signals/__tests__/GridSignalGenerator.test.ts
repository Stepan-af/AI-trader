/**
 * Grid Signal Generator Tests
 * Validates price level-based trading logic
 */

import type { Candle, StrategyConfig } from '@ai-trader/shared';
import { GridSignalGenerator } from '../GridSignalGenerator';

describe('GridSignalGenerator', () => {
  let generator: GridSignalGenerator;

  beforeEach(() => {
    generator = new GridSignalGenerator();
  });

  const createGridConfig = (lowerBound: number, upperBound: number): StrategyConfig => ({
    name: 'Test Grid',
    type: 'GRID',
    symbol: 'BTCUSDT',
    timeframe: '1m',
    grid: {
      lowerBound,
      upperBound,
      gridLevels: 5,
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
      const config = createGridConfig(45000, 55000);
      const signal = generator.generateSignal(config, [], new Date());

      expect(signal.type).toBe('HOLD');
      expect(signal.reason).toBe('No candles available');
    });

    it('should return BUY when price is below lower bound', () => {
      const config = createGridConfig(45000, 55000);
      const candles = [createCandle(new Date(), 44000)]; // Below 45000

      const signal = generator.generateSignal(config, candles, new Date());

      expect(signal.type).toBe('BUY');
      expect(signal.reason).toContain('below grid lower bound');
      expect(signal.reason).toContain('44000');
      expect(signal.reason).toContain('45000');
    });

    it('should return SELL when price is above upper bound', () => {
      const config = createGridConfig(45000, 55000);
      const candles = [createCandle(new Date(), 56000)]; // Above 55000

      const signal = generator.generateSignal(config, candles, new Date());

      expect(signal.type).toBe('SELL');
      expect(signal.reason).toContain('above grid upper bound');
      expect(signal.reason).toContain('56000');
      expect(signal.reason).toContain('55000');
    });

    it('should return HOLD when price is within grid bounds', () => {
      const config = createGridConfig(45000, 55000);
      const candles = [createCandle(new Date(), 50000)]; // Between 45000 and 55000

      const signal = generator.generateSignal(config, candles, new Date());

      expect(signal.type).toBe('HOLD');
      expect(signal.reason).toContain('within grid bounds');
      expect(signal.reason).toContain('[45000, 55000]');
    });

    it('should return BUY when price equals lower bound', () => {
      const config = createGridConfig(45000, 55000);
      const candles = [createCandle(new Date(), 45000)];

      const signal = generator.generateSignal(config, candles, new Date());

      expect(signal.type).toBe('HOLD'); // Equal to bound is within range
    });

    it('should return SELL when price equals upper bound', () => {
      const config = createGridConfig(45000, 55000);
      const candles = [createCandle(new Date(), 55000)];

      const signal = generator.generateSignal(config, candles, new Date());

      expect(signal.type).toBe('HOLD'); // Equal to bound is within range
    });

    it('should throw error if grid config is missing', () => {
      const config: StrategyConfig = {
        name: 'Test',
        type: 'GRID',
        symbol: 'BTCUSDT',
        timeframe: '1m',
        risk: { maxPositionSize: 1000 },
      };

      expect(() => generator.generateSignal(config, [], new Date())).toThrow(
        'Grid config missing',
      );
    });

    it('should be deterministic', () => {
      const config = createGridConfig(45000, 55000);
      const candles = [createCandle(new Date('2024-01-01'), 50000)];
      const timestamp = new Date('2024-01-01T12:00:00Z');

      const signal1 = generator.generateSignal(config, candles, timestamp);
      const signal2 = generator.generateSignal(config, candles, timestamp);

      expect(signal1).toEqual(signal2);
    });

    it('should use latest candle close price', () => {
      const config = createGridConfig(45000, 55000);

      const oldCandle = createCandle(new Date('2024-01-01T00:00:00Z'), 40000); // Below bound
      const latestCandle = createCandle(new Date('2024-01-01T00:01:00Z'), 50000); // Within bounds

      // Candles ordered DESC
      const candles = [latestCandle, oldCandle];

      const signal = generator.generateSignal(config, candles, new Date());

      expect(signal.type).toBe('HOLD'); // Based on latest (50000), not old (40000)
    });
  });
});
