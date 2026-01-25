/**
 * Health Check Service
 * Provides comprehensive system health status
 */

import { getRedisClient } from '@ai-trader/shared';
import type { Pool } from 'pg';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
  };
  metrics?: {
    totalOrders?: number;
    activeStrategies?: number;
    pendingEvents?: number;
  };
}

interface ServiceHealth {
  status: 'up' | 'down';
  responseTime?: number;
  error?: string;
}

export class HealthCheckService {
  private startTime: number;

  constructor(private readonly pool: Pool) {
    this.startTime = Date.now();
  }

  /**
   * Perform basic health check
   */
  async checkHealth(): Promise<HealthStatus> {
    const [dbHealth, redisHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const overallStatus = this.determineOverallStatus(dbHealth, redisHealth);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      services: {
        database: dbHealth,
        redis: redisHealth,
      },
    };
  }

  /**
   * Perform detailed health check with metrics
   */
  async checkDetailedHealth(): Promise<HealthStatus> {
    const basicHealth = await this.checkHealth();

    // Get additional metrics
    const metrics = await this.collectMetrics();

    return {
      ...basicHealth,
      metrics,
    };
  }

  /**
   * Check database connection
   */
  private async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();

    try {
      await this.pool.query('SELECT 1');
      const responseTime = Date.now() - start;

      return {
        status: 'up',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'down',
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Redis connection
   */
  private async checkRedis(): Promise<ServiceHealth> {
    const start = Date.now();

    try {
      const redis = getRedisClient();
      const result = await redis.ping();
      const responseTime = Date.now() - start;

      if (result === 'PONG') {
        return {
          status: 'up',
          responseTime,
        };
      }

      return {
        status: 'down',
        responseTime,
        error: 'Unexpected ping response',
      };
    } catch (error) {
      return {
        status: 'down',
        responseTime: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Collect system metrics
   */
  private async collectMetrics(): Promise<{
    totalOrders?: number;
    activeStrategies?: number;
    pendingEvents?: number;
  }> {
    try {
      const [ordersResult, strategiesResult, eventsResult] = await Promise.all([
        this.pool.query<{ count: string }>('SELECT COUNT(*) FROM execution.orders'),
        this.pool.query<{ count: string }>("SELECT COUNT(*) FROM strategy.strategies WHERE status = 'RUNNING'"),
        this.pool.query<{ count: string }>('SELECT COUNT(*) FROM portfolio.portfolio_event_outbox WHERE processed_at IS NULL'),
      ]);

      return {
        totalOrders: parseInt(ordersResult.rows[0]?.count || '0', 10),
        activeStrategies: parseInt(strategiesResult.rows[0]?.count || '0', 10),
        pendingEvents: parseInt(eventsResult.rows[0]?.count || '0', 10),
      };
    } catch {
      // Return empty metrics if collection fails
      return {};
    }
  }

  /**
   * Determine overall system status
   */
  private determineOverallStatus(
    dbHealth: ServiceHealth,
    redisHealth: ServiceHealth
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const dbUp = dbHealth.status === 'up';
    const redisUp = redisHealth.status === 'up';

    if (dbUp && redisUp) {
      return 'healthy';
    }

    if (dbUp || redisUp) {
      return 'degraded';
    }

    return 'unhealthy';
  }
}
