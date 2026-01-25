/**
 * Prometheus Metrics
 * Collects and exposes metrics for monitoring per ARCHITECTURE.md
 */

import { Counter, Gauge, Histogram, Registry } from 'prom-client';

// Create a Registry to register metrics
export const register = new Registry();

// Default labels for all metrics
register.setDefaultLabels({
  app: 'ai-trader-backend',
});

// ============================================================================
// Order Metrics
// ============================================================================

export const orderCounter = new Counter({
  name: 'orders_total',
  help: 'Total number of orders created',
  labelNames: ['status', 'side', 'type'],
  registers: [register],
});

export const orderSuccessRate = new Gauge({
  name: 'order_success_rate',
  help: 'Order success rate (percentage)',
  registers: [register],
});

export const orderLatency = new Histogram({
  name: 'order_execution_latency_seconds',
  help: 'Order execution latency in seconds',
  labelNames: ['status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// ============================================================================
// Fill Metrics
// ============================================================================

export const fillCounter = new Counter({
  name: 'fills_total',
  help: 'Total number of fills processed',
  labelNames: ['source'],
  registers: [register],
});

export const duplicateFillCounter = new Counter({
  name: 'duplicate_fills_total',
  help: 'Total number of duplicate fills detected',
  registers: [register],
});

// ============================================================================
// Reconciliation Metrics
// ============================================================================

export const reconciliationCounter = new Counter({
  name: 'reconciliation_runs_total',
  help: 'Total number of reconciliation runs',
  labelNames: ['status'],
  registers: [register],
});

export const reconciliationErrorCounter = new Counter({
  name: 'reconciliation_errors_total',
  help: 'Total number of reconciliation errors',
  labelNames: ['error_type'],
  registers: [register],
});

export const missedFillCounter = new Counter({
  name: 'missed_fills_total',
  help: 'Total number of missed fills detected by reconciliation',
  registers: [register],
});

// ============================================================================
// Portfolio Metrics
// ============================================================================

export const portfolioEventCounter = new Counter({
  name: 'portfolio_events_total',
  help: 'Total number of portfolio events processed',
  labelNames: ['event_type'],
  registers: [register],
});

export const portfolioBacklogGauge = new Gauge({
  name: 'portfolio_event_backlog',
  help: 'Number of unprocessed portfolio events in outbox',
  registers: [register],
});

export const positionUpdateCounter = new Counter({
  name: 'position_updates_total',
  help: 'Total number of position updates',
  labelNames: ['symbol'],
  registers: [register],
});

// ============================================================================
// Strategy Metrics
// ============================================================================

export const strategyCounter = new Gauge({
  name: 'strategies_active',
  help: 'Number of active strategies',
  labelNames: ['type', 'mode'],
  registers: [register],
});

export const signalCounter = new Counter({
  name: 'signals_total',
  help: 'Total number of trading signals generated',
  labelNames: ['strategy_type', 'signal_type'],
  registers: [register],
});

// ============================================================================
// System Metrics
// ============================================================================

export const databaseConnectionGauge = new Gauge({
  name: 'database_connection_status',
  help: 'Database connection status (1 = up, 0 = down)',
  registers: [register],
});

export const redisConnectionGauge = new Gauge({
  name: 'redis_connection_status',
  help: 'Redis connection status (1 = up, 0 = down)',
  registers: [register],
});

export const killSwitchGauge = new Gauge({
  name: 'kill_switch_active',
  help: 'Kill switch status (1 = active, 0 = inactive)',
  registers: [register],
});

export const clockDriftGauge = new Gauge({
  name: 'clock_drift_milliseconds',
  help: 'Clock drift from NTP server in milliseconds',
  registers: [register],
});

// ============================================================================
// Backtest Metrics
// ============================================================================

export const backtestCounter = new Counter({
  name: 'backtests_total',
  help: 'Total number of backtests executed',
  labelNames: ['status'],
  registers: [register],
});

export const backtestDuration = new Histogram({
  name: 'backtest_duration_seconds',
  help: 'Backtest execution duration in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

// ============================================================================
// HTTP Metrics
// ============================================================================

export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// ============================================================================
// Error Metrics
// ============================================================================

export const errorCounter = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'service'],
  registers: [register],
});

/**
 * Collect default Node.js metrics
 */
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register });
