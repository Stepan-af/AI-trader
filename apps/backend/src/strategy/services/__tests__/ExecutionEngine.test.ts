/**
 * Execution Engine Tests
 * Tests strategy lifecycle and signal execution
 */

import type { Strategy } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';
import type { OrderService } from '../../../execution/services/OrderService';
import type { CandleRepository } from '../../repositories/CandleRepository';
import type { StrategyRepository } from '../../repositories/StrategyRepository';
import { ExecutionEngine } from '../ExecutionEngine';

describe('ExecutionEngine', () => {
  let pool: jest.Mocked<Pool>;
  let orderService: jest.Mocked<OrderService>;
  let engine: ExecutionEngine;
  let mockClient: jest.Mocked<PoolClient>;
  let mockStrategyRepo: jest.Mocked<StrategyRepository>;
  let mockCandleRepo: jest.Mocked<CandleRepository>;

  beforeEach(() => {
    // Mock pool with connect/query
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;

    pool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
    } as unknown as jest.Mocked<Pool>;

    // Mock OrderService
    orderService = {
      createOrder: jest.fn(),
    } as unknown as jest.Mocked<OrderService>;

    // Create engine instance
    engine = new ExecutionEngine(pool, orderService);

    // Access internal repositories via type assertion
    mockStrategyRepo = (engine as any).strategyRepo as jest.Mocked<StrategyRepository>;
    mockCandleRepo = (engine as any).candleRepo as jest.Mocked<CandleRepository>;

    // Mock repository methods
    mockStrategyRepo.findById = jest.fn();
    mockStrategyRepo.updateStatus = jest.fn();
    mockCandleRepo.getLatestCandles = jest.fn();
  });

  describe('startStrategy', () => {
    it('should transition from STOPPED to STARTING then RUNNING', async () => {
      const strategyId = 'strat-1';
      const userId = 'user-1';

      const mockStrategy: Strategy = {
        id: strategyId,
        userId,
        status: 'STOPPED',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1m',
          dca: { intervalSeconds: 60, amountPerOrder: 100 },
          risk: { maxPositionSize: 1000 },
        },
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const startingStrategy: Strategy = { ...mockStrategy, status: 'STARTING' };

      mockStrategyRepo.findById.mockResolvedValue(mockStrategy);
      mockStrategyRepo.updateStatus.mockResolvedValue(startingStrategy);

      const result = await engine.startStrategy(strategyId, userId);

      expect(result.status).toBe('STARTING');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should reject if strategy is not STOPPED or DRAFT', async () => {
      const strategyId = 'strat-1';
      const userId = 'user-1';

      const mockStrategy: Strategy = {
        id: strategyId,
        userId,
        status: 'RUNNING', // Already running
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1m',
          dca: { intervalSeconds: 60, amountPerOrder: 100 },
          risk: { maxPositionSize: 1000 },
        },
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStrategyRepo.findById.mockResolvedValue(mockStrategy);

      await expect(engine.startStrategy(strategyId, userId)).rejects.toThrow(
        'Cannot start strategy in RUNNING status',
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should reject if strategy does not belong to user', async () => {
      const strategyId = 'strat-1';
      const userId = 'user-1';
      const otherUserId = 'user-2';

      const mockStrategy: Strategy = {
        id: strategyId,
        userId: otherUserId, // Different user
        status: 'STOPPED',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1m',
          dca: { intervalSeconds: 60, amountPerOrder: 100 },
          risk: { maxPositionSize: 1000 },
        },
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStrategyRepo.findById.mockResolvedValue(mockStrategy);

      await expect(engine.startStrategy(strategyId, userId)).rejects.toThrow('Unauthorized');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('stopStrategy', () => {
    it('should transition from RUNNING to STOPPING then STOPPED', async () => {
      const strategyId = 'strat-1';
      const userId = 'user-1';

      const mockStrategy: Strategy = {
        id: strategyId,
        userId,
        status: 'RUNNING',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1m',
          dca: { intervalSeconds: 60, amountPerOrder: 100 },
          risk: { maxPositionSize: 1000 },
        },
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const stoppingStrategy: Strategy = { ...mockStrategy, status: 'STOPPING' };

      mockStrategyRepo.findById.mockResolvedValue(mockStrategy);
      mockStrategyRepo.updateStatus.mockResolvedValue(stoppingStrategy);

      const result = await engine.stopStrategy(strategyId, userId);

      expect(result.status).toBe('STOPPING');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should reject if strategy is not RUNNING or ERROR', async () => {
      const strategyId = 'strat-1';
      const userId = 'user-1';

      const mockStrategy: Strategy = {
        id: strategyId,
        userId,
        status: 'STOPPED', // Already stopped
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1m',
          dca: { intervalSeconds: 60, amountPerOrder: 100 },
          risk: { maxPositionSize: 1000 },
        },
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStrategyRepo.findById.mockResolvedValue(mockStrategy);

      await expect(engine.stopStrategy(strategyId, userId)).rejects.toThrow(
        'Cannot stop strategy in STOPPED status',
      );
    });
  });

  describe('executeStrategy', () => {
    it('should return HOLD if strategy is not RUNNING', async () => {
      const strategyId = 'strat-1';

      const mockStrategy: Strategy = {
        id: strategyId,
        userId: 'user-1',
        status: 'STOPPED',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1m',
          dca: { intervalSeconds: 60, amountPerOrder: 100 },
          risk: { maxPositionSize: 1000 },
        },
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStrategyRepo.findById.mockResolvedValue(mockStrategy);

      const signal = await engine.executeStrategy(strategyId);

      expect(signal.type).toBe('HOLD');
      expect(signal.reason).toContain('not running');
    });

    it('should fetch candles and generate signal for RUNNING strategy', async () => {
      const strategyId = 'strat-1';

      const mockStrategy: Strategy = {
        id: strategyId,
        userId: 'user-1',
        status: 'RUNNING',
        config: {
          name: 'Test DCA',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1m',
          dca: { intervalSeconds: 60, amountPerOrder: 100 },
          risk: { maxPositionSize: 1000 },
        },
        mode: 'PAPER',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCandles = [
        {
          id: '1',
          symbol: 'BTCUSDT',
          timeframe: '1m' as const,
          timestamp: new Date('2024-01-01T00:00:00Z'),
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50000,
          volume: 1000,
        },
      ];

      mockStrategyRepo.findById.mockResolvedValue(mockStrategy);
      mockCandleRepo.getLatestCandles.mockResolvedValue(mockCandles);

      const signal = await engine.executeStrategy(strategyId);

      expect(signal.strategyId).toBe(strategyId);
      expect(signal.symbol).toBe('BTCUSDT');
      expect(['BUY', 'SELL', 'HOLD']).toContain(signal.type);
    });
  });
});
