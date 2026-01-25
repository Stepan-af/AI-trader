/**
 * HealthCheckService Tests
 */

import type { Pool } from 'pg';
import { HealthCheckService } from '../HealthCheckService';

// Mock Redis
jest.mock('@ai-trader/shared', () => ({
  getRedisClient: jest.fn(() => ({
    ping: jest.fn().mockResolvedValue('PONG'),
  })),
}));

describe('HealthCheckService', () => {
  let healthCheckService: HealthCheckService;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [{ count: '0' }] }),
    } as unknown as jest.Mocked<Pool>;

    healthCheckService = new HealthCheckService(mockPool);
  });

  describe('checkHealth', () => {
    it('should return healthy status when all services are up', async () => {
      const health = await healthCheckService.checkHealth();

      expect(health.status).toBe('healthy');
      expect(health.services.database.status).toBe('up');
      expect(health.services.redis.status).toBe('up');
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return degraded status when database is down', async () => {
      mockPool.query = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const health = await healthCheckService.checkHealth();

      expect(health.status).toBe('degraded');
      expect(health.services.database.status).toBe('down');
      expect(health.services.redis.status).toBe('up');
    });

    it('should return unhealthy status when all services are down', async () => {
      mockPool.query = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const { getRedisClient } = require('@ai-trader/shared');
      getRedisClient.mockReturnValue({
        ping: jest.fn().mockRejectedValue(new Error('Redis down')),
      });

      const health = await healthCheckService.checkHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.services.database.status).toBe('down');
      expect(health.services.redis.status).toBe('down');
    });
  });

  describe('checkDetailedHealth', () => {
    it('should include metrics in detailed health check', async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // For checkHealth
        .mockResolvedValueOnce({ rows: [{ count: '42' }] }) // totalOrders
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // activeStrategies
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }); // pendingEvents

      const health = await healthCheckService.checkDetailedHealth();

      expect(health.metrics).toBeDefined();
      expect(health.metrics?.totalOrders).toBe(42);
      expect(health.metrics?.activeStrategies).toBe(3);
      expect(health.metrics?.pendingEvents).toBe(10);
    });

    it('should handle metrics collection failures gracefully', async () => {
      mockPool.query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // For checkHealth
        .mockRejectedValueOnce(new Error('Query failed')); // For metrics

      const health = await healthCheckService.checkDetailedHealth();

      expect(health.metrics).toEqual({});
    });
  });
});
