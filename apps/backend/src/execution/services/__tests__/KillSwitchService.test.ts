/**
 * Kill Switch Service Tests
 * Tests activation/deactivation, state persistence, error handling
 */

import type Redis from 'ioredis';
import { KillSwitchActiveError, KillSwitchService } from '../KillSwitchService';

describe('KillSwitchService', () => {
  let mockRedis: jest.Mocked<Redis>;
  let service: KillSwitchService;

  beforeEach(() => {
    // Mock Redis client
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as jest.Mocked<Redis>;

    service = new KillSwitchService(mockRedis);
  });

  describe('isActive', () => {
    it('should return false when kill switch not set', async () => {
      mockRedis.get.mockResolvedValue(null);

      const active = await service.isActive();

      expect(active).toBe(false);
      expect(mockRedis.get).toHaveBeenCalledWith('kill_switch:global');
    });

    it('should return true when kill switch is active', async () => {
      const state = {
        active: true,
        reason: 'risk_service_down',
        activatedAt: new Date().toISOString(),
        activatedBy: 'system',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      const active = await service.isActive();

      expect(active).toBe(true);
    });

    it('should return false when kill switch is inactive', async () => {
      const state = {
        active: false,
        reason: null,
        activatedAt: null,
        activatedBy: null,
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      const active = await service.isActive();

      expect(active).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return default inactive state when not set', async () => {
      mockRedis.get.mockResolvedValue(null);

      const state = await service.getState();

      expect(state).toEqual({
        active: false,
        reason: null,
        activatedAt: null,
        activatedBy: null,
      });
    });

    it('should return full state with metadata when active', async () => {
      const activatedAt = new Date('2024-01-01T12:00:00Z');
      const storedState = {
        active: true,
        reason: 'manual',
        activatedAt: activatedAt.toISOString(),
        activatedBy: 'admin-user-123',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(storedState));

      const state = await service.getState();

      expect(state.active).toBe(true);
      expect(state.reason).toBe('manual');
      expect(state.activatedAt).toEqual(activatedAt);
      expect(state.activatedBy).toBe('admin-user-123');
    });
  });

  describe('activate', () => {
    it('should activate kill switch with metadata', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.activate('risk_service_down', 'system');

      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      const [key, value] = mockRedis.set.mock.calls[0];

      expect(key).toBe('kill_switch:global');

      const parsed = JSON.parse(value as string);
      expect(parsed.active).toBe(true);
      expect(parsed.reason).toBe('risk_service_down');
      expect(parsed.activatedBy).toBe('system');
      expect(parsed.activatedAt).toBeTruthy();
      expect(new Date(parsed.activatedAt).getTime()).toBeGreaterThan(Date.now() - 1000);
    });

    it('should activate with manual reason', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.activate('manual', 'admin-user-456');

      const [, value] = mockRedis.set.mock.calls[0];
      const parsed = JSON.parse(value as string);

      expect(parsed.reason).toBe('manual');
      expect(parsed.activatedBy).toBe('admin-user-456');
    });

    it('should be idempotent - can activate multiple times', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.activate('manual', 'user-1');
      await service.activate('manual', 'user-1');

      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('deactivate', () => {
    it('should deactivate kill switch by deleting key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.deactivate();

      expect(mockRedis.del).toHaveBeenCalledWith('kill_switch:global');
    });

    it('should be idempotent - can deactivate when already inactive', async () => {
      mockRedis.del.mockResolvedValue(0); // Key didn't exist

      await service.deactivate();

      expect(mockRedis.del).toHaveBeenCalledWith('kill_switch:global');
    });
  });

  describe('checkAndThrow', () => {
    it('should not throw when kill switch is inactive', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.checkAndThrow()).resolves.not.toThrow();
    });

    it('should throw KillSwitchActiveError when kill switch is active', async () => {
      const activatedAt = new Date('2024-01-01T12:00:00Z');
      const state = {
        active: true,
        reason: 'risk_service_down',
        activatedAt: activatedAt.toISOString(),
        activatedBy: 'system',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await expect(service.checkAndThrow()).rejects.toThrow(KillSwitchActiveError);
    });

    it('should include metadata in KillSwitchActiveError', async () => {
      const activatedAt = new Date('2024-01-01T12:00:00Z');
      const state = {
        active: true,
        reason: 'manual',
        activatedAt: activatedAt.toISOString(),
        activatedBy: 'admin-123',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      try {
        await service.checkAndThrow();
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KillSwitchActiveError);
        const killSwitchError = error as KillSwitchActiveError;
        expect(killSwitchError.code).toBe('KILL_SWITCH_ACTIVE');
        expect(killSwitchError.statusCode).toBe(503);
        expect(killSwitchError.killSwitchReason).toBe('manual');
        expect(killSwitchError.activatedAt).toBe(activatedAt.toISOString());
        expect(killSwitchError.message).toContain('Emergency stop is active');
      }
    });
  });

  describe('state transitions', () => {
    it('should transition from inactive → active → inactive', async () => {
      // Initially inactive
      mockRedis.get.mockResolvedValue(null);
      expect(await service.isActive()).toBe(false);

      // Activate
      mockRedis.set.mockResolvedValue('OK');
      await service.activate('manual', 'admin');

      // Now active
      const state = {
        active: true,
        reason: 'manual',
        activatedAt: new Date().toISOString(),
        activatedBy: 'admin',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(state));
      expect(await service.isActive()).toBe(true);

      // Deactivate
      mockRedis.del.mockResolvedValue(1);
      await service.deactivate();

      // Back to inactive
      mockRedis.get.mockResolvedValue(null);
      expect(await service.isActive()).toBe(false);
    });
  });
});
