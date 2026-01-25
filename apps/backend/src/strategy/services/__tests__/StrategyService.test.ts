/**
 * Strategy Service Tests
 * Tests strategy CRUD, validation, and status transitions
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */

import type { Strategy, StrategyConfig } from '@ai-trader/shared';
import { jest } from '@jest/globals';
import type { Pool } from 'pg';
import type { StrategyRepository } from '../../repositories/StrategyRepository';
import { StrategyService } from '../StrategyService';

// Mock StrategyRepository
const mockCreate = jest.fn<() => Promise<Strategy>>();
const mockFindById = jest.fn<() => Promise<Strategy | null>>();
const mockFindByUserId = jest.fn<() => Promise<Strategy[]>>();
const mockUpdate = jest.fn<() => Promise<Strategy>>();
const mockDelete = jest.fn<() => Promise<void>>();

const mockRepository = {
  create: mockCreate,
  findById: mockFindById,
  findByUserId: mockFindByUserId,
  update: mockUpdate,
  delete: mockDelete,
} as unknown as StrategyRepository;

const mockPool = {} as Pool;

describe('StrategyService', () => {
  let service: StrategyService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new StrategyService(mockPool);

    // Replace repository with mock
    // @ts-expect-error - Replacing private property for testing
    service['repository'] = mockRepository;
  });

  describe('createStrategy', () => {
    it('should create DCA strategy with valid configuration', async () => {
      const config: StrategyConfig = {
        name: 'BTC DCA',
        type: 'DCA',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        dca: {
          intervalSeconds: 3600,
          amountPerOrder: 100,
        },
        risk: {
          maxPositionSize: 0.1,
        },
      };

      const expectedStrategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config,
        status: 'DRAFT',
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCreate.mockResolvedValue(expectedStrategy);

      const result = await service.createStrategy({
        userId: 'user-1',
        config,
      });

      expect(result).toEqual(expectedStrategy);
      expect(mockCreate).toHaveBeenCalledWith({
        userId: 'user-1',
        config,
        status: 'DRAFT',
        mode: null,
      });
    });

    it('should create GRID strategy with valid configuration', async () => {
      const config: StrategyConfig = {
        name: 'BTC Grid',
        type: 'GRID',
        symbol: 'BTCUSDT',
        timeframe: '5m',
        grid: {
          lowerBound: 40000,
          upperBound: 50000,
          gridLevels: 10,
        },
        risk: {
          maxPositionSize: 0.5,
        },
      };

      const expectedStrategy: Strategy = {
        id: 'strategy-2',
        userId: 'user-1',
        config,
        status: 'DRAFT',
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCreate.mockResolvedValue(expectedStrategy);

      const result = await service.createStrategy({
        userId: 'user-1',
        config,
      });

      expect(result).toEqual(expectedStrategy);
    });

    it('should create SWING strategy with valid DSL rules', async () => {
      const config: StrategyConfig = {
        name: 'RSI Swing',
        type: 'SWING',
        symbol: 'BTCUSDT',
        timeframe: '1m',
        swing: {
          entryRule: 'RSI < 30 AND CLOSE > SMA(200)',
          exitRule: 'RSI > 60',
        },
        risk: {
          maxPositionSize: 0.2,
        },
      };

      const expectedStrategy: Strategy = {
        id: 'strategy-3',
        userId: 'user-1',
        config,
        status: 'DRAFT',
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCreate.mockResolvedValue(expectedStrategy);

      const result = await service.createStrategy({
        userId: 'user-1',
        config,
      });

      expect(result).toEqual(expectedStrategy);
    });

    it('should reject strategy with empty name', async () => {
      const config: StrategyConfig = {
        name: '',
        type: 'DCA',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        dca: {
          intervalSeconds: 3600,
          amountPerOrder: 100,
        },
        risk: {
          maxPositionSize: 0.1,
        },
      };

      await expect(
        service.createStrategy({
          userId: 'user-1',
          config,
        })
      ).rejects.toThrow('Strategy name is required');
    });

    it('should reject strategy with invalid type', async () => {
      const config = {
        name: 'Invalid Strategy',
        type: 'INVALID',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        risk: {
          maxPositionSize: 0.1,
        },
      } as unknown as StrategyConfig;

      await expect(
        service.createStrategy({
          userId: 'user-1',
          config,
        })
      ).rejects.toThrow('Invalid strategy type: INVALID');
    });

    it('should reject strategy with invalid timeframe', async () => {
      const config = {
        name: 'Invalid Timeframe',
        type: 'DCA',
        symbol: 'BTCUSDT',
        timeframe: '2h', // Invalid
        dca: {
          intervalSeconds: 3600,
          amountPerOrder: 100,
        },
        risk: {
          maxPositionSize: 0.1,
        },
      } as unknown as StrategyConfig;

      await expect(
        service.createStrategy({
          userId: 'user-1',
          config,
        })
      ).rejects.toThrow('Invalid timeframe: 2h');
    });

    it('should reject strategy without risk limits', async () => {
      const config = {
        name: 'No Risk',
        type: 'DCA',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        dca: {
          intervalSeconds: 3600,
          amountPerOrder: 100,
        },
      } as unknown as StrategyConfig;

      await expect(
        service.createStrategy({
          userId: 'user-1',
          config,
        })
      ).rejects.toThrow('Risk limits are required');
    });

    it('should reject DCA strategy without DCA config', async () => {
      const config: StrategyConfig = {
        name: 'Invalid DCA',
        type: 'DCA',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        risk: {
          maxPositionSize: 0.1,
        },
      };

      await expect(
        service.createStrategy({
          userId: 'user-1',
          config,
        })
      ).rejects.toThrow('DCA configuration is required for DCA strategy');
    });

    it('should reject GRID strategy with lowerBound >= upperBound', async () => {
      const config: StrategyConfig = {
        name: 'Invalid Grid',
        type: 'GRID',
        symbol: 'BTCUSDT',
        timeframe: '5m',
        grid: {
          lowerBound: 50000,
          upperBound: 40000, // Invalid: should be > lowerBound
          gridLevels: 10,
        },
        risk: {
          maxPositionSize: 0.5,
        },
      };

      await expect(
        service.createStrategy({
          userId: 'user-1',
          config,
        })
      ).rejects.toThrow('Grid lowerBound must be less than upperBound');
    });

    it('should reject SWING strategy without exit rule', async () => {
      const config: StrategyConfig = {
        name: 'Invalid Swing',
        type: 'SWING',
        symbol: 'BTCUSDT',
        timeframe: '1m',
        swing: {
          entryRule: 'RSI < 30',
          exitRule: '', // Empty
        },
        risk: {
          maxPositionSize: 0.2,
        },
      };

      await expect(
        service.createStrategy({
          userId: 'user-1',
          config,
        })
      ).rejects.toThrow('Swing exitRule is required');
    });
  });

  describe('getStrategy', () => {
    it('should return strategy by ID', async () => {
      const strategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test Strategy',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'DRAFT',
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(strategy);

      const result = await service.getStrategy('strategy-1');

      expect(result).toEqual(strategy);
      expect(mockFindById).toHaveBeenCalledWith('strategy-1');
    });

    it('should return null for non-existent strategy', async () => {
      mockFindById.mockResolvedValue(null);

      const result = await service.getStrategy('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('listStrategies', () => {
    it('should return all strategies for a user', async () => {
      const strategies: Strategy[] = [
        {
          id: 'strategy-1',
          userId: 'user-1',
          config: {
            name: 'Strategy 1',
            type: 'DCA',
            symbol: 'BTCUSDT',
            timeframe: '1h',
            dca: { intervalSeconds: 3600, amountPerOrder: 100 },
            risk: { maxPositionSize: 0.1 },
          },
          status: 'DRAFT',
          mode: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'strategy-2',
          userId: 'user-1',
          config: {
            name: 'Strategy 2',
            type: 'GRID',
            symbol: 'ETHUSDT',
            timeframe: '5m',
            grid: { lowerBound: 2000, upperBound: 3000, gridLevels: 10 },
            risk: { maxPositionSize: 0.5 },
          },
          status: 'STOPPED',
          mode: 'PAPER',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockFindByUserId.mockResolvedValue(strategies);

      const result = await service.listStrategies('user-1');

      expect(result).toEqual(strategies);
      expect(mockFindByUserId).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateStrategy', () => {
    it('should update strategy configuration in DRAFT status', async () => {
      const existingStrategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Old Name',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'DRAFT',
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const newConfig: StrategyConfig = {
        name: 'New Name',
        type: 'DCA',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        dca: { intervalSeconds: 7200, amountPerOrder: 200 },
        risk: { maxPositionSize: 0.2 },
      };

      mockFindById.mockResolvedValue(existingStrategy);
      mockUpdate.mockResolvedValue({ ...existingStrategy, config: newConfig });

      const result = await service.updateStrategy({
        id: 'strategy-1',
        config: newConfig,
      });

      expect(result.config).toEqual(newConfig);
      expect(mockUpdate).toHaveBeenCalledWith({
        id: 'strategy-1',
        config: newConfig,
      });
    });

    it('should update strategy configuration in STOPPED status', async () => {
      const existingStrategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'STOPPED',
        mode: 'PAPER',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(existingStrategy);
      mockUpdate.mockResolvedValue(existingStrategy);

      const result = await service.updateStrategy({
        id: 'strategy-1',
        config: existingStrategy.config,
      });

      expect(result).toBeDefined();
    });

    it('should reject update for RUNNING strategy', async () => {
      const existingStrategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'RUNNING',
        mode: 'LIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(existingStrategy);

      await expect(
        service.updateStrategy({
          id: 'strategy-1',
          config: existingStrategy.config,
        })
      ).rejects.toThrow('Cannot update strategy in RUNNING status. Must be DRAFT or STOPPED.');
    });

    it('should reject update for non-existent strategy', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(
        service.updateStrategy({
          id: 'non-existent',
          config: {} as StrategyConfig,
        })
      ).rejects.toThrow('Strategy not found: non-existent');
    });
  });

  describe('deleteStrategy', () => {
    it('should delete strategy in DRAFT status', async () => {
      const strategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'DRAFT',
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(strategy);
      mockDelete.mockResolvedValue(undefined);

      await service.deleteStrategy('strategy-1');

      expect(mockDelete).toHaveBeenCalledWith('strategy-1');
    });

    it('should delete strategy in STOPPED status', async () => {
      const strategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'STOPPED',
        mode: 'PAPER',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(strategy);
      mockDelete.mockResolvedValue(undefined);

      await service.deleteStrategy('strategy-1');

      expect(mockDelete).toHaveBeenCalledWith('strategy-1');
    });

    it('should reject delete for RUNNING strategy', async () => {
      const strategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'RUNNING',
        mode: 'LIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(strategy);

      await expect(service.deleteStrategy('strategy-1')).rejects.toThrow(
        'Cannot delete strategy in RUNNING status. Must be DRAFT or STOPPED.'
      );
    });
  });

  describe('updateStatus', () => {
    it('should transition from DRAFT to STOPPED', async () => {
      const strategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'DRAFT',
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(strategy);
      mockUpdate.mockResolvedValue({ ...strategy, status: 'STOPPED' });

      const result = await service.updateStatus('strategy-1', 'STOPPED');

      expect(result.status).toBe('STOPPED');
    });

    it('should transition from STOPPED to STARTING', async () => {
      const strategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'STOPPED',
        mode: 'PAPER',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(strategy);
      mockUpdate.mockResolvedValue({ ...strategy, status: 'STARTING' });

      const result = await service.updateStatus('strategy-1', 'STARTING');

      expect(result.status).toBe('STARTING');
    });

    it('should transition from RUNNING to STOPPING', async () => {
      const strategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'RUNNING',
        mode: 'LIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(strategy);
      mockUpdate.mockResolvedValue({ ...strategy, status: 'STOPPING' });

      const result = await service.updateStatus('strategy-1', 'STOPPING');

      expect(result.status).toBe('STOPPING');
    });

    it('should reject invalid transition from DRAFT to RUNNING', async () => {
      const strategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'DRAFT',
        mode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(strategy);

      await expect(service.updateStatus('strategy-1', 'RUNNING')).rejects.toThrow(
        'Invalid status transition: DRAFT → RUNNING'
      );
    });

    it('should reject invalid transition from RUNNING to DRAFT', async () => {
      const strategy: Strategy = {
        id: 'strategy-1',
        userId: 'user-1',
        config: {
          name: 'Test',
          type: 'DCA',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          dca: { intervalSeconds: 3600, amountPerOrder: 100 },
          risk: { maxPositionSize: 0.1 },
        },
        status: 'RUNNING',
        mode: 'LIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindById.mockResolvedValue(strategy);

      await expect(service.updateStatus('strategy-1', 'DRAFT')).rejects.toThrow(
        'Invalid status transition: RUNNING → DRAFT'
      );
    });
  });
});
