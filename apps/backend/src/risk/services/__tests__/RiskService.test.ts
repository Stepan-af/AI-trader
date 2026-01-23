/**
 * Risk Service Tests
 * Tests risk validation logic, position size limits, and version-based validation
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */

import type { RiskLimits, RiskValidationRequest, SystemConfig } from '@ai-trader/shared';
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

describe('RiskService', () => {
  let service: RiskService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new RiskService(mockPool);

    // Replace the repository with our mock
    // @ts-expect-error - Replacing private property for testing
    service['riskRepository'] = mockRiskRepository;
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
});
