/**
 * Risk Service Tests
 * Tests risk validation logic, position size limits, and version-based validation
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */

import type { RedisClient, RiskLimits, RiskValidationRequest, RiskValidationResponse, SystemConfig } from '@ai-trader/shared';
import { jest } from '@jest/globals';
import type { Pool } from 'pg';
import type { RiskRepository } from '../../repositories/RiskRepository';
import { RiskService, RiskValidationError } from '../RiskService';

// Mock dependencies
const mockPool = {} as Pool;

// Create typed mocks
const getRiskLimitsMock = jest.fn<() => Promise<RiskLimits | null>>();
const getSystemConfigMock = jest.fn<() => Promise<SystemConfig>>();

const mockRiskRepository = {
  getRiskLimits: getRiskLimitsMock,
  getSystemConfig: getSystemConfigMock,
} as unknown as RiskRepository;

// Mock Redis client
const redisGetMock = jest.fn<() => Promise<string | null>>();
const redisSetexMock = jest.fn<() => Promise<string>>();
const redisKeysMock = jest.fn<() => Promise<string[]>>();
const redisDelMock = jest.fn<() => Promise<number>>();

const redisMock = {
  get: redisGetMock,
  setex: redisSetexMock,
  keys: redisKeysMock,
  del: redisDelMock,
} as unknown as RedisClient;

describe('RiskService', () => {
  let service: RiskService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new RiskService(mockPool);

    // Replace the repository and redis with our mocks
    // @ts-expect-error - Replacing private property for testing
    service['riskRepository'] = mockRiskRepository;
    // @ts-expect-error - Replacing private property for testing
    service['redis'] = redisMock;
    
    // Default Redis behavior: cache miss (returns null)
    redisGetMock.mockResolvedValue(null);
    redisSetexMock.mockResolvedValue('OK');
  });

  describe('validateRisk', () => {
    const baseRequest: RiskValidationRequest = {
      userId: 'user-1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      quantity: 0.01,
      currentPosition: 0.05,
      positionVersion: 1,
    };

    const baseLimits: RiskLimits = {
      id: 'limit-1',
      userId: 'user-1',
      symbol: 'BTCUSDT',
      maxPositionSize: 0.1,
      maxExposureUsd: 10000,
      maxDailyLossUsd: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should approve valid trade within position limits', async () => {
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      const response = await service.validateRisk(baseRequest);

      expect(response.approved).toBe(true);
      expect(response.limitsSnapshot).toEqual({
        maxPositionSize: 0.1,
        maxExposureUsd: 10000,
        maxDailyLossUsd: 1000,
      });
      expect(response.validatedAt).toBeDefined();
      expect(getRiskLimitsMock).toHaveBeenCalledWith('user-1', 'BTCUSDT');
      expect(redisSetexMock).toHaveBeenCalled(); // Should cache the result
    });

    it('should reject trade that exceeds position size limit (BUY)', async () => {
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      const request: RiskValidationRequest = {
        ...baseRequest,
        quantity: 0.1, // Current 0.05 + 0.1 = 0.15 > limit 0.1
      };

      await expect(service.validateRisk(request)).rejects.toThrow(RiskValidationError);
      await expect(service.validateRisk(request)).rejects.toThrow(/Position size limit exceeded/);

      try {
        await service.validateRisk(request);
      } catch (error) {
        expect(error).toBeInstanceOf(RiskValidationError);
        const riskError = error as RiskValidationError;
        expect(riskError.code).toBe('RISK_LIMIT_EXCEEDED');
        expect(riskError.details?.violationType).toBe('MAX_POSITION_SIZE');
      }
    });

    it('should reject trade that exceeds position size limit (SELL)', async () => {
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      const request: RiskValidationRequest = {
        ...baseRequest,
        side: 'SELL',
        quantity: 0.2, // Current 0.05 - 0.2 = -0.15, abs(-0.15) = 0.15 > limit 0.1
      };

      await expect(service.validateRisk(request)).rejects.toThrow(RiskValidationError);

      try {
        await service.validateRisk(request);
      } catch (error) {
        const riskError = error as RiskValidationError;
        expect(riskError.code).toBe('RISK_LIMIT_EXCEEDED');
      }
    });

    it('should approve trade at exact position limit', async () => {
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      const request: RiskValidationRequest = {
        ...baseRequest,
        currentPosition: 0,
        quantity: 0.1, // Exactly at limit
      };

      const response = await service.validateRisk(request);

      expect(response.approved).toBe(true);
    });

    it('should approve SELL trade reducing position', async () => {
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      const request: RiskValidationRequest = {
        ...baseRequest,
        side: 'SELL',
        quantity: 0.03, // Current 0.05 - 0.03 = 0.02 < limit 0.1
      };

      const response = await service.validateRisk(request);

      expect(response.approved).toBe(true);
    });

    it('should throw error when no risk limits configured', async () => {
      getRiskLimitsMock.mockResolvedValue(null);

      await expect(service.validateRisk(baseRequest)).rejects.toThrow(RiskValidationError);

      try {
        await service.validateRisk(baseRequest);
      } catch (error) {
        const riskError = error as RiskValidationError;
        expect(riskError.code).toBe('NO_LIMITS_CONFIGURED');
        expect(riskError.message).toContain('No risk limits configured');
      }
    });

    it('should use global limits when symbol-specific limits not found', async () => {
      const globalLimits: RiskLimits = {
        ...baseLimits,
        symbol: null, // Global limit
        maxPositionSize: 0.5,
      };

      getRiskLimitsMock.mockResolvedValue(globalLimits);

      const response = await service.validateRisk(baseRequest);

      expect(response.approved).toBe(true);
      expect(response.limitsSnapshot.maxPositionSize).toBe(0.5);
    });

    it('should handle zero current position', async () => {
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      const request: RiskValidationRequest = {
        ...baseRequest,
        currentPosition: 0,
        quantity: 0.05,
      };

      const response = await service.validateRisk(request);

      expect(response.approved).toBe(true);
    });

    it('should handle negative positions (shorts)', async () => {
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      const request: RiskValidationRequest = {
        ...baseRequest,
        currentPosition: -0.05,
        side: 'SELL',
        quantity: 0.03, // -0.05 - 0.03 = -0.08, abs = 0.08 < 0.1
      };

      const response = await service.validateRisk(request);

      expect(response.approved).toBe(true);
    });
  });

  describe('isKillSwitchActive', () => {
    it('should return true when kill switch is active', async () => {
      const config: SystemConfig = {
        id: 'global',
        killSwitchActive: true,
        killSwitchReason: 'Manual activation',
        killSwitchActivatedAt: new Date(),
        updatedAt: new Date(),
      };

      getSystemConfigMock.mockResolvedValue(config);

      const result = await service.isKillSwitchActive();

      expect(result).toBe(true);
    });

    it('should return false when kill switch is inactive', async () => {
      const config: SystemConfig = {
        id: 'global',
        killSwitchActive: false,
        killSwitchReason: null,
        killSwitchActivatedAt: null,
        updatedAt: new Date(),
      };

      getSystemConfigMock.mockResolvedValue(config);

      const result = await service.isKillSwitchActive();

      expect(result).toBe(false);
    });
  });

  describe('cache behavior', () => {
    const baseRequest: RiskValidationRequest = {
      userId: 'user-1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      quantity: 0.01,
      currentPosition: 0.05,
      positionVersion: 1,
    };

    const baseLimits: RiskLimits = {
      id: 'limit-1',
      userId: 'user-1',
      symbol: 'BTCUSDT',
      maxPositionSize: 0.1,
      maxExposureUsd: 10000,
      maxDailyLossUsd: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return cached approval on cache hit', async () => {
      const cachedResponse: RiskValidationResponse = {
        approved: true,
        validatedAt: '2026-01-23T10:00:00.000Z',
        limitsSnapshot: {
          maxPositionSize: 0.1,
          maxExposureUsd: 10000,
          maxDailyLossUsd: 1000,
        },
      };

      redisGetMock.mockResolvedValue(JSON.stringify(cachedResponse));

      const response = await service.validateRisk(baseRequest);

      expect(response).toEqual(cachedResponse);
      expect(redisGetMock).toHaveBeenCalled();
      expect(getRiskLimitsMock).not.toHaveBeenCalled(); // Should not query DB on cache hit
      expect(redisSetexMock).not.toHaveBeenCalled(); // Should not re-cache
    });

    it('should perform validation and cache on cache miss', async () => {
      redisGetMock.mockResolvedValue(null); // Cache miss
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      const response = await service.validateRisk(baseRequest);

      expect(response.approved).toBe(true);
      expect(redisGetMock).toHaveBeenCalled();
      expect(getRiskLimitsMock).toHaveBeenCalled();
      expect(redisSetexMock).toHaveBeenCalledWith(
        expect.stringContaining('risk:approval:user-1:BTCUSDT:BUY:0.01:1'),
        10, // TTL in seconds
        expect.any(String)
      );
    });

    it('should use different cache keys for different versions', async () => {
      redisGetMock.mockResolvedValue(null);
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      // First request with version 1
      await service.validateRisk(baseRequest);
      
      // @ts-expect-error - Accessing mock internals
      const firstCacheKey = redisSetexMock.mock.calls[0][0] as string;

      jest.clearAllMocks();
      redisGetMock.mockResolvedValue(null);
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      // Second request with version 2
      const request2 = { ...baseRequest, positionVersion: 2 };
      await service.validateRisk(request2);
      
      // @ts-expect-error - Accessing mock internals
      const secondCacheKey = redisSetexMock.mock.calls[0][0] as string;

      expect(firstCacheKey).toContain(':1'); // version 1
      expect(secondCacheKey).toContain(':2'); // version 2
      expect(firstCacheKey).not.toEqual(secondCacheKey);
    });

    it('should not cache rejections', async () => {
      redisGetMock.mockResolvedValue(null);
      getRiskLimitsMock.mockResolvedValue(baseLimits);

      const request: RiskValidationRequest = {
        ...baseRequest,
        quantity: 0.1, // Exceeds limit
      };

      await expect(service.validateRisk(request)).rejects.toThrow(RiskValidationError);

      expect(redisSetexMock).not.toHaveBeenCalled(); // Should not cache rejections
    });
  });

  describe('clearCache', () => {
    it('should clear all risk approval cache entries', async () => {
      const mockKeys = [
        'risk:approval:user-1:BTCUSDT:BUY:0.01:1',
        'risk:approval:user-1:ETHUSDT:BUY:0.1:2',
        'risk:approval:user-2:BTCUSDT:SELL:0.02:3',
      ];

      redisKeysMock.mockResolvedValue(mockKeys);
      redisDelMock.mockResolvedValue(3);

      const cleared = await service.clearCache();

      expect(cleared).toBe(3);
      expect(redisKeysMock).toHaveBeenCalledWith('risk:approval:*');
      expect(redisDelMock).toHaveBeenCalledWith(...mockKeys);
    });

    it('should return 0 when no cache entries exist', async () => {
      redisKeysMock.mockResolvedValue([]);

      const cleared = await service.clearCache();

      expect(cleared).toBe(0);
      expect(redisKeysMock).toHaveBeenCalledWith('risk:approval:*');
      expect(redisDelMock).not.toHaveBeenCalled();
    });
  });
});
