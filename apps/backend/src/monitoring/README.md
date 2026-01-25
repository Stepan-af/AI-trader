# Monitoring and Observability

This module provides comprehensive monitoring and observability for the AI Trader backend.

## Features

### Health Checks

#### Basic Health Check
- **Endpoint**: `GET /api/v1/health`
- **Purpose**: Quick health status check
- **Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T20:36:47.000Z",
  "uptime": 3600,
  "services": {
    "database": {
      "status": "up",
      "responseTime": 5
    },
    "redis": {
      "status": "up",
      "responseTime": 2
    }
  }
}
```

#### Detailed Health Check
- **Endpoint**: `GET /api/v1/health/detailed`
- **Purpose**: Comprehensive system status with metrics
- **Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T20:36:47.000Z",
  "uptime": 3600,
  "services": {
    "database": { "status": "up", "responseTime": 5 },
    "redis": { "status": "up", "responseTime": 2 }
  },
  "metrics": {
    "totalOrders": 1523,
    "activeStrategies": 3,
    "pendingEvents": 12
  }
}
```

### Prometheus Metrics

#### Metrics Endpoint
- **Endpoint**: `GET /api/v1/metrics`
- **Format**: Prometheus text format
- **Content-Type**: `text/plain; version=0.0.4`

#### Available Metrics

**Order Metrics**
- `orders_total` (Counter) - Total orders created, labeled by status/side/type
- `order_success_rate` (Gauge) - Order success rate percentage
- `order_execution_latency_seconds` (Histogram) - Order execution time

**Fill Metrics**
- `fills_total` (Counter) - Total fills processed, labeled by source
- `duplicate_fills_total` (Counter) - Duplicate fills detected

**Reconciliation Metrics**
- `reconciliation_runs_total` (Counter) - Reconciliation runs, labeled by status
- `reconciliation_errors_total` (Counter) - Reconciliation errors by type
- `missed_fills_total` (Counter) - Missed fills detected

**Portfolio Metrics**
- `portfolio_events_total` (Counter) - Portfolio events processed
- `portfolio_event_backlog` (Gauge) - Unprocessed events in outbox
- `position_updates_total` (Counter) - Position updates by symbol

**Strategy Metrics**
- `strategies_active` (Gauge) - Active strategies by type and mode
- `signals_total` (Counter) - Trading signals generated

**System Metrics**
- `database_connection_status` (Gauge) - Database status (1=up, 0=down)
- `redis_connection_status` (Gauge) - Redis status (1=up, 0=down)
- `kill_switch_active` (Gauge) - Kill switch status (1=active, 0=inactive)
- `clock_drift_milliseconds` (Gauge) - Clock drift from NTP

**Backtest Metrics**
- `backtests_total` (Counter) - Backtests executed by status
- `backtest_duration_seconds` (Histogram) - Backtest execution time

**HTTP Metrics**
- `http_requests_total` (Counter) - HTTP requests by method/route/status
- `http_request_duration_seconds` (Histogram) - Request duration

**Error Metrics**
- `errors_total` (Counter) - Total errors by type and service

## Usage

### In Code

#### Tracking Order Metrics
```typescript
import { orderCounter, orderLatency } from '@/monitoring/metrics';

// Increment order counter
orderCounter.inc({ status: 'FILLED', side: 'BUY', type: 'MARKET' });

// Track order latency
const timer = orderLatency.startTimer({ status: 'FILLED' });
// ... execute order ...
timer();
```

#### Tracking Errors
```typescript
import { errorCounter } from '@/monitoring/metrics';

try {
  // ... code ...
} catch (error) {
  errorCounter.inc({ type: 'DATABASE_ERROR', service: 'execution' });
  throw error;
}
```

### Prometheus Configuration

Add the following to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'ai-trader-backend'
    scrape_interval: 10s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/v1/metrics'
```

### Grafana Dashboards

Example queries for Grafana:

**Order Success Rate**
```promql
rate(orders_total{status="FILLED"}[5m]) / rate(orders_total[5m]) * 100
```

**Average Order Latency**
```promql
rate(order_execution_latency_seconds_sum[5m]) / rate(order_execution_latency_seconds_count[5m])
```

**Portfolio Event Backlog**
```promql
portfolio_event_backlog
```

**HTTP Request Rate**
```promql
rate(http_requests_total[5m])
```

## Alert Thresholds

Recommended alert rules:

```yaml
groups:
  - name: ai-trader
    rules:
      # System health
      - alert: DatabaseDown
        expr: database_connection_status == 0
        for: 1m
        annotations:
          summary: "Database connection is down"

      - alert: RedisDown
        expr: redis_connection_status == 0
        for: 1m
        annotations:
          summary: "Redis connection is down"

      # Kill switch
      - alert: KillSwitchActive
        expr: kill_switch_active == 1
        annotations:
          summary: "Kill switch is active - all trading stopped"

      # Portfolio backlog
      - alert: PortfolioBacklogHigh
        expr: portfolio_event_backlog > 200
        for: 5m
        annotations:
          summary: "Portfolio event backlog is high (>200 events)"

      # Reconciliation errors
      - alert: ReconciliationErrors
        expr: rate(reconciliation_errors_total[5m]) > 0
        annotations:
          summary: "Reconciliation errors detected"

      # Order failures
      - alert: HighOrderFailureRate
        expr: rate(orders_total{status="REJECTED"}[5m]) / rate(orders_total[5m]) > 0.1
        for: 5m
        annotations:
          summary: "Order failure rate > 10%"

      # Performance
      - alert: HighOrderLatency
        expr: histogram_quantile(0.95, rate(order_execution_latency_seconds_bucket[5m])) > 5
        for: 5m
        annotations:
          summary: "95th percentile order latency > 5s"
```

## Architecture

### Components

1. **Metrics Module** (`monitoring/metrics.ts`)
   - Defines all Prometheus metrics
   - Exports metric instances for use across the application

2. **Metrics Middleware** (`monitoring/middleware.ts`)
   - Automatically tracks HTTP request metrics
   - Applied globally to all routes

3. **HealthCheckService** (`monitoring/HealthCheckService.ts`)
   - Checks database and Redis connectivity
   - Collects system metrics
   - Determines overall health status

4. **Monitoring Routes** (`api/routes/monitoring.ts`)
   - Exposes `/health`, `/health/detailed`, and `/metrics` endpoints

### Integration

The monitoring module is integrated into the application through:

1. **App Initialization** - Metrics middleware is added in `app.ts`
2. **Service Initialization** - HealthCheckService is created in `init.ts`
3. **Route Registration** - Monitoring routes are registered in `routes/index.ts`

## Best Practices

1. **Metric Naming**: Follow Prometheus naming conventions (snake_case, descriptive)
2. **Label Cardinality**: Keep label values bounded (avoid user IDs, timestamps)
3. **Histogram Buckets**: Choose appropriate buckets for your use case
4. **Counter vs Gauge**: Use counters for cumulative values, gauges for current state
5. **Health Check Response Time**: Keep health checks fast (<100ms)

## Future Enhancements

- [ ] Distributed tracing with OpenTelemetry
- [ ] Custom metrics per strategy type
- [ ] Anomaly detection on metrics
- [ ] Real-time alerting integration
- [ ] Performance profiling endpoints
