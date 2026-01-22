# Redis and Job Queue Infrastructure

This document describes the Redis and BullMQ-based job queue infrastructure.

## Overview

Single Redis instance for:

- Job queues (BullMQ)
- Caching (Risk Service approvals, etc.)
- Pub/Sub (future: real-time updates)

## Queue Architecture

### Queue Names

Per ARCHITECTURE.md requirements:

**Portfolio Service (Two-Tier Priority)**

- `portfolio:high_priority` - User queries, fill events
- `portfolio:low_priority` - Price updates, snapshots

**Execution Service**

- `execution:order_submission` - Order placement (rate-limited)
- `execution:reconciliation` - Periodic exchange sync

**Strategy Service**

- `strategy:signals` - Signal generation
- `backtest:jobs` - Backtest execution

**Exchange Adapter**

- `exchange:candle_ingestion` - Candle data ingestion

### Priority Levels

```typescript
enum QueuePriority {
  CRITICAL = 1, // User-facing operations
  HIGH = 5, // Fill processing, position updates
  NORMAL = 10, // Background reconciliation
  LOW = 15, // Price updates, snapshots
}
```

### Worker Concurrency

| Queue                        | Concurrency | Reason               |
| ---------------------------- | ----------- | -------------------- |
| `portfolio:high_priority`    | 20          | User-facing, fast    |
| `portfolio:low_priority`     | 5           | Background, can wait |
| `execution:order_submission` | 5           | Rate-limited by API  |
| `execution:reconciliation`   | 3           | I/O bound            |
| `strategy:signals`           | 10          | CPU-light            |
| `backtest:jobs`              | 2           | CPU-intensive        |
| `exchange:candle_ingestion`  | 10          | Network I/O          |

## Usage

### Adding Jobs

```typescript
import { getQueue, QueueName } from '@ai-trader/shared';

const queue = getQueue(QueueName.PORTFOLIO_HIGH_PRIORITY);

await queue.add('recalculate-position', {
  userId: 'user-123',
  symbol: 'BTCUSDT',
  fillId: 'fill-456',
});
```

### Creating Workers

```typescript
import { createWorker, QueueName, type JobProcessor } from '@ai-trader/shared';

interface MyJobData {
  userId: string;
  symbol: string;
}

const processor: JobProcessor<MyJobData> = async (job) => {
  console.log('Processing:', job.data);
  // Do work...
};

const worker = createWorker(QueueName.PORTFOLIO_HIGH_PRIORITY, processor);
```

### Monitoring Queue Health

```typescript
import { getQueueHealth, getAllQueuesHealth } from '@ai-trader/shared';

// Single queue
const health = await getQueueHealth(QueueName.PORTFOLIO_HIGH_PRIORITY);
console.log(health);
// { name: 'portfolio:high_priority', waiting: 5, active: 2, completed: 100, failed: 0, delayed: 0 }

// All queues
const allHealth = await getAllQueuesHealth();
```

## Redis Setup

### Local Development

```bash
# macOS
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo systemctl start redis

# Test connection
redis-cli ping
# Expected: PONG
```

### Configuration

Environment variables in `.env`:

```
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0
```

### Production

Recommended Redis configuration for production:

```conf
maxmemory 2gb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

## Job Retry Strategy

Default retry configuration:

```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000  // 1s, 2s, 4s
  }
}
```

Queue-specific overrides:

- **Order submission**: 5 attempts (critical)
- **Backtests**: 1 attempt (no retry)

## Monitoring

### Queue Metrics

Monitor these metrics per queue:

- `waiting` - Jobs waiting to be processed
- `active` - Jobs currently processing
- `completed` - Successfully completed jobs
- `failed` - Failed jobs (needs investigation)
- `delayed` - Jobs scheduled for future execution

### Alerts

Set up alerts for:

- `waiting > 100` on high-priority queues → Scale workers
- `failed > 50` on any queue → Investigate errors
- `active` stuck for > 5 minutes → Dead worker detection

## Examples

See [apps/backend/src/examples/queue-usage.ts](../apps/backend/src/examples/queue-usage.ts) for complete usage examples.
