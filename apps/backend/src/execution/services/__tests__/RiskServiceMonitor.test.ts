/**
 * Risk Service Monitor Tests
 * Tests auto-trigger of kill switch on Risk Service downtime
 */

import type { KillSwitchService } from '../KillSwitchService';
import { RiskServiceMonitor } from '../RiskServiceMonitor';

// Increase Jest timeout for timer tests
jest.setTimeout(10000);

describe('RiskServiceMonitor', () => {
  let mockKillSwitchService: jest.Mocked<KillSwitchService>;
  let mockHealthCheck: jest.Mock;
  let monitor: RiskServiceMonitor;

  beforeEach(() => {
    // Mock KillSwitchService
    mockKillSwitchService = {
      activate: jest.fn(),
      deactivate: jest.fn(),
      isActive: jest.fn(),
      getState: jest.fn(),
      checkAndThrow: jest.fn(),
    } as unknown as jest.Mocked<KillSwitchService>;

    // Mock health check function
    mockHealthCheck = jest.fn();

    monitor = new RiskServiceMonitor(mockKillSwitchService, mockHealthCheck);
  });

  afterEach(() => {
    monitor.stop();
    jest.clearAllTimers();
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      monitor.start();

      const status = monitor.getStatus();
      expect(status.running).toBe(true);
    });

    it('should stop monitoring', () => {
      monitor.start();
      monitor.stop();

      const status = monitor.getStatus();
      expect(status.running).toBe(false);
    });

    it('should not start twice', () => {
      monitor.start();
      monitor.start(); // Should warn but not crash

      const status = monitor.getStatus();
      expect(status.running).toBe(true);
    });
  });

  describe('health check monitoring', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should not trigger kill switch if Risk Service is healthy', async () => {
      mockHealthCheck.mockResolvedValue({
        healthy: true,
        lastCheckAt: new Date(),
      });

      monitor.start();

      // Advance time by 60 seconds (12 checks at 5s interval)
      for (let i = 0; i < 12; i++) {
        jest.advanceTimersByTime(5000);
        await Promise.resolve(); // Flush promises
      }

      expect(mockKillSwitchService.activate).not.toHaveBeenCalled();
    });

    it('should trigger kill switch after 30s of continuous downtime', async () => {
      mockHealthCheck.mockResolvedValue({
        healthy: false,
        lastCheckAt: new Date(),
        errorMessage: 'Connection refused',
      });

      monitor.start();

      // Advance time by 35 seconds (7 checks at 5s interval)
      for (let i = 0; i < 7; i++) {
        jest.advanceTimersByTime(5000);
        await Promise.resolve(); // Flush promises
      }

      expect(mockKillSwitchService.activate).toHaveBeenCalledWith('risk_service_down', 'system');
      expect(mockKillSwitchService.activate).toHaveBeenCalledTimes(1);
    });

    it('should not trigger kill switch if downtime < 30s', async () => {
      mockHealthCheck.mockResolvedValue({
        healthy: false,
        lastCheckAt: new Date(),
        errorMessage: 'Timeout',
      });

      monitor.start();

      // Advance time by 25 seconds (5 checks)
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      }

      expect(mockKillSwitchService.activate).not.toHaveBeenCalled();
    });

    it('should reset failure tracking when Risk Service recovers', async () => {
      // Initially unhealthy
      mockHealthCheck.mockResolvedValue({
        healthy: false,
        lastCheckAt: new Date(),
        errorMessage: 'Down',
      });

      monitor.start();

      // Down for 20 seconds
      for (let i = 0; i < 4; i++) {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      }

      // Recover
      mockHealthCheck.mockResolvedValue({
        healthy: true,
        lastCheckAt: new Date(),
      });

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Down again - should restart 30s timer
      mockHealthCheck.mockResolvedValue({
        healthy: false,
        lastCheckAt: new Date(),
      });

      // 25 more seconds (not enough to trigger)
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      }

      expect(mockKillSwitchService.activate).not.toHaveBeenCalled();
    });

    it('should only trigger kill switch once per downtime period', async () => {
      mockHealthCheck.mockResolvedValue({
        healthy: false,
        lastCheckAt: new Date(),
        errorMessage: 'Down',
      });

      monitor.start();

      // Advance time by 60 seconds (well past threshold)
      for (let i = 0; i < 12; i++) {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      }

      // Should only activate once, not on every check
      expect(mockKillSwitchService.activate).toHaveBeenCalledTimes(1);
    });

    it('should track failure timing correctly', async () => {
      mockHealthCheck.mockResolvedValue({
        healthy: false,
        lastCheckAt: new Date(),
      });

      monitor.start();

      // Check initial status
      let status = monitor.getStatus();
      expect(status.firstFailureAt).toBeNull();
      expect(status.killSwitchTriggered).toBe(false);

      // First check - advance and flush pending promises
      await jest.advanceTimersByTimeAsync(5000);

      status = monitor.getStatus();
      expect(status.firstFailureAt).toBeTruthy();
      expect(status.killSwitchTriggered).toBe(false);

      // After threshold - advance to 35s total
      await jest.advanceTimersByTimeAsync(30000);

      status = monitor.getStatus();
      expect(status.killSwitchTriggered).toBe(true);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle health check errors gracefully', async () => {
      mockHealthCheck.mockRejectedValue(new Error('Network error'));

      monitor.start();

      // Should not crash
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      const status = monitor.getStatus();
      expect(status.running).toBe(true);
    });

    it('should handle kill switch activation errors gracefully', async () => {
      mockHealthCheck.mockResolvedValue({
        healthy: false,
        lastCheckAt: new Date(),
      });

      mockKillSwitchService.activate.mockRejectedValue(new Error('Redis error'));

      monitor.start();

      // Should not crash even if activation fails
      for (let i = 0; i < 7; i++) {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      }

      const status = monitor.getStatus();
      expect(status.running).toBe(true);
    });
  });
});
