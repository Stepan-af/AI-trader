
# ARCHITECTURE.md

## Purpose
Описать архитектуру **MVP web-платформы автоматизированной торговли**, ориентированной на:
- корректность исполнения,
- воспроизводимость,
- управляемый риск,
- простоту эксплуатации.

Архитектура **не рассчитана на HFT** и не использует tick-level или order-book стратегии в MVP.

---

## Architectural Principles

1. **Correctness over performance**
2. **Explicit state machines**
3. **Idempotent write operations**
4. **Exchange is external truth, DB is internal truth**
5. **One source of truth per domain**
6. **MVP first — extensible later**

---

## High-Level Diagram



[ Web UI ]
|
[ API Gateway ]
|
-

## | Strategy | Execution | Risk | Portfolio | Backtest |

```
 |
```

[ Exchange Adapter (Binance) ]
|
[ External Exchange API ]

```

---

## Database Architecture (MVP)

### Single PostgreSQL Cluster with Schema Isolation

**Topology**
- One PostgreSQL 15+ instance with TimescaleDB extension
- Logical separation via schemas (not separate databases)
- Each service owns its schema and tables

**Schema Ownership**
```
execution schema:
  - orders (Execution Service writes/reads)
  - order_events (Execution Service writes, Portfolio reads)
  - fills (Execution Service writes, Portfolio reads)
  - portfolio_events_outbox (Execution Service writes, Portfolio reads)

portfolio schema:
  - positions (Portfolio Service owns)
  - balances (Portfolio Service owns)
  - pnl_snapshots (Portfolio Service owns)

strategy schema:
  - strategies (Strategy Service owns)

backtest schema:
  - backtest_runs (Backtest Service owns)
  - backtest_results (Backtest Service owns)

candles schema:
  - candles (TimescaleDB hypertable, Exchange Adapter writes)
```

**Cross-Schema Transaction Rules**
- **No cross-schema transactions** (services do not write to each other's tables)
- Event-driven communication via outbox pattern
- Consistency model: Eventual consistency between services

**Fill Processing Flow (Execution Service)**
```sql
BEGIN;

-- 1. Record fill (with deduplication)
INSERT INTO execution.fills (id, order_id, exchange_fill_id, price, quantity, fee, timestamp, source)
VALUES (?, ?, ?, ?, ?, ?, ?, 'WEBSOCKET')
ON CONFLICT (exchange_fill_id) DO NOTHING;

-- 2. Record event
INSERT INTO execution.order_events (order_id, event_type, data, sequence_number, timestamp)
VALUES (?, 'PARTIAL_FILL', ?::jsonb, ?, NOW());

-- 3. Update order state
UPDATE execution.orders
SET status = 'PARTIALLY_FILLED',
    filled_quantity = filled_quantity + ?,
    avg_fill_price = ...,
    updated_at = NOW()
WHERE id = ?;

-- 4. Notify Portfolio Service (transactional outbox)
INSERT INTO execution.portfolio_events_outbox (event_type, user_id, symbol, order_id, fill_id, created_at)
VALUES ('FILL_PROCESSED', ?, ?, ?, ?, NOW());

COMMIT;
```

**Position Update Flow (Portfolio Service)**
```typescript
// Background worker polls outbox every 500ms
const events = await db.query(`
  SELECT * FROM execution.portfolio_events_outbox
  WHERE processed_at IS NULL
  ORDER BY created_at ASC
  LIMIT 100
`);

for (const event of events) {
  await db.transaction(async (trx) => {
    // 1. Update position
    await trx.query(`
      UPDATE portfolio.positions
      SET quantity = quantity + ?,
          version = version + 1,
          updated_at = NOW()
      WHERE user_id = ? AND symbol = ?
    `);

    // 2. Mark outbox event processed
    await trx.query(`
      UPDATE execution.portfolio_events_outbox
      SET processed_at = NOW()
      WHERE id = ?
    `);
  });
}
```

**Consistency Guarantees**
- Fill and order state: Immediate consistency (single transaction)
- Fill and position: Eventual consistency (< 1 second p95)
- Outbox worker failure: Events reprocessed on next poll (idempotent)
- Crash during outbox processing: Unprocessed events picked up on restart

**Why This Approach?**
- Simpler than distributed transactions (no 2PC)
- Each service owns its data (clear boundaries)
- Outbox pattern is proven for event-driven systems
- Eventual consistency acceptable for portfolio updates (users see staleness indicator)
- Enables future migration to separate databases (pattern remains same)

---

## Service Overview (MVP)

### 1. API Gateway
**Responsibilities**
- Authentication (JWT)
- Authorization
- Rate limiting
- Request validation
- Routing to internal services

**Notes**
- No business logic
- All write requests support idempotency

---

### 2. Strategy Service
**Responsibilities**
- Strategy CRUD
- Strategy configuration
- Rule-based signal generation (DSL)
- Strategy validation

**Out of Scope (MVP)**
- ML / RL
- Custom user code
- Tick-level signals

**Notes**
- Strategies are **pure functions** over candle data
- No direct access to exchange or balances

---

### 3. Execution Service (Critical)
**Responsibilities**
- Order placement
- Order lifecycle management
- Reconciliation with exchange
- Handling retries and failures
- Enforcing idempotency

**Order Lifecycle State Machine**
```

NEW
↓
SUBMITTED
↓
PARTIALLY_FILLED
↓
FILLED
├─ CANCELED
├─ REJECTED
└─ EXPIRED

```

**Key Guarantees**
- No duplicated orders
- Safe retries
- Final state is always known
- Recovery after restart is deterministic

**Notes**
- Only this service has access to decrypted exchange keys
- All state changes are persisted as events

---

### Partial Fill Processing (Corrected - Outbox Pattern)

**Requirement**
Fill processing must be atomic within Execution Service scope. Portfolio updates are eventual via transactional outbox.

**Transaction 1: Execution Service (Atomic)**
```sql
-- Scope: execution schema only
BEGIN;

-- 1. Record fill (with deduplication)
INSERT INTO execution.fills (id, order_id, exchange_fill_id, price, quantity, fee, timestamp, source)
VALUES (?, ?, ?, ?, ?, ?, ?, 'WEBSOCKET')
ON CONFLICT (exchange_fill_id) DO NOTHING;  -- Idempotent

-- 2. Record fill event
INSERT INTO execution.order_events (order_id, event_type, data, sequence_number, timestamp)
VALUES (?, 'PARTIAL_FILL', ?::jsonb, ?, NOW());

-- 3. Update order state
UPDATE execution.orders
SET status = 'PARTIALLY_FILLED',
    filled_quantity = filled_quantity + ?,
    avg_fill_price = (avg_fill_price * filled_quantity + ? * ?) / (filled_quantity + ?),
    updated_at = NOW()
WHERE id = ?;

-- 4. Enqueue Portfolio Service notification (transactional outbox)
INSERT INTO execution.portfolio_events_outbox (event_type, user_id, symbol, order_id, fill_id, data, created_at)
VALUES ('FILL_PROCESSED', ?, ?, ?, ?, ?::jsonb, NOW());

COMMIT;
```

**Transaction 2: Portfolio Service Worker (Eventual)**
```typescript
// Background worker polls outbox every 500ms
// Runs in separate transaction scope
const pendingEvents = await executionDb.query(`
  SELECT * FROM execution.portfolio_events_outbox
  WHERE processed_at IS NULL
  ORDER BY created_at ASC
  LIMIT 100
`);

for (const event of pendingEvents) {
  await portfolioDb.transaction(async (trx) => {
    // Update position (portfolio schema)
    await trx.query(`
      UPDATE portfolio.positions
      SET quantity = quantity + ?,
          version = version + 1,
          updated_at = NOW()
      WHERE user_id = ? AND symbol = ?
    `, [event.data.quantity, event.user_id, event.symbol]);

    // Mark outbox event as processed (execution schema - separate connection)
    await executionDb.query(`
      UPDATE execution.portfolio_events_outbox
      SET processed_at = NOW()
      WHERE id = ?
    `, [event.id]);
  });
}
```

**Rollback Handling**
- If any step fails: Full rollback, no partial state
- Fill processing retried via normal event pipeline
- Duplicate fills rejected by `ON CONFLICT` (idempotent)
- Max retries: 3 with exponential backoff (1s, 2s, 4s)
- After 3 failures: Move to dead letter queue (see DLQ section below)

**Portfolio Service Notification**
- Background worker polls `portfolio_events_outbox` every 500ms
- Processes events in order (per user_id)
- Marks processed: `UPDATE ... SET processed_at = NOW()`
- If worker fails: Events reprocessed on next poll (idempotent)
- Fallback: Reconciliation every 60s catches missed events

**Consistency Guarantees (Q2: Maximum Gaps)**
- **p95**: Fill → Position update < 1 second
- **p99**: Fill → Position update < 3 seconds
- **Maximum**: Fill → Position update < 60 seconds (reconciliation fallback)
- **Alert threshold**: If gap > 5 seconds, log warning
- **Kill switch threshold**: If gap > 60 seconds, activate automatic kill switch

**Batch Processing Limits (Q4: Many Missed Fills)**
If reconciliation discovers > 50 missed fills:
- Process first 50 immediately (high priority)
- Queue remaining fills with rate limit: 10 fills/second
- Log warning: "Large fill gap detected: {count} fills"
- Notify user via email: "Position updates in progress due to connection recovery"
- Maximum batch size: 500 fills (if exceeded, trigger manual review alert)

**Recovery After Crash**
- Uncommitted transactions automatically rolled back by Postgres
- Unprocessed outbox events picked up by worker on restart
- Order reconciliation detects any missed fills from exchange

---

### Rate Limit Queue - Crash Recovery

**Problem**
If Execution Service crashes with 100 queued orders, restarting and re-submitting all immediately violates rate limits.

**Solution: Gradual Re-Submission**

**Recovery Procedure (On Startup)**
```typescript
async function recoverQueuedOrders() {
  const queuedOrders = await db.query(`
    SELECT * FROM execution.orders
    WHERE queued_at IS NOT NULL
      AND queued_at > NOW() - INTERVAL '5 minutes'
    ORDER BY queued_at ASC
  `);

  logger.info(`Recovering ${queuedOrders.length} queued orders`);

  for (const order of queuedOrders) {
    // Use existing rate limiter (token bucket)
    await rateLimiter.enqueue(async () => {
      await submitOrderToExchange(order);
      await db.query(`UPDATE orders SET queued_at = NULL WHERE id = ?`, [order.id]);
    });

    // Artificial delay: 200ms between enqueues
    // Ensures max 5 orders/second re-submission rate
    await sleep(200);
  }

  logger.info('Queue recovery complete');
}
```

**Re-Submission Rate**
- 5 orders per second (matches token bucket refill rate)
- Recovery time: `queuedOrderCount / 5` seconds
- Example: 100 orders = 20 seconds recovery time

**Stale Order Timeout - Race Condition Handling (Risk #7)**
Orders queued > 5 minutes marked REJECTED:
```sql
-- Run every 60 seconds
UPDATE execution.orders
SET status = 'REJECTED',
    queued_at = NULL,
    rejection_reason = 'QUEUE_TIMEOUT'
WHERE queued_at < NOW() - INTERVAL '5 minutes'
  AND status = 'SUBMITTED';  -- Only reject if still in submitted state
```

**Race Condition Mitigation**
- If order submitted to exchange at 4:59 (just before 5-minute timeout):
  - Order state changes to `OPEN` on exchange acknowledgment
  - Timeout job checks `status = 'SUBMITTED'` → Order already OPEN → Not rejected
- If timeout job runs before exchange acknowledgment:
  - Order marked REJECTED in DB
  - Exchange acknowledgment arrives → Reconciliation detects discrepancy
  - Reconciliation rule: Exchange state (OPEN) overrides DB (REJECTED)
  - Order updated to OPEN, user notified of recovery
- **Worst case**: Order executed on exchange but marked REJECTED for up to 60 seconds (reconciliation window)
- User notification: "Order {id} was delayed in queue but successfully placed"

**Guarantees**
- No order truly lost (reconciliation recovers)
- Worst-case user confusion: 60 seconds (acceptable for MVP)
- Exchange reality always wins after reconciliation

**Guarantees**
- No rate limit violations during recovery
- FIFO order preserved (queued_at ASC)
- Predictable recovery duration
- User notified via email if their orders were queued during crash

---

### 4. Risk Service
**Responsibilities**
- Pre-trade validation
- Position size limits
- Max exposure per symbol
- Max daily loss
- Emergency stop conditions

**Notes**
- Hard-fail on violations
- Can block execution globally or per strategy

---

### Risk Service Integration and Caching

**Pre-Trade Validation Flow**
Every order submission must pass Risk Service validation before being sent to exchange.

**Normal Flow (Risk Service Available)**
1. Execution Service receives order request
2. Query current position for symbol (from Portfolio Service)
3. Call Risk Service: `POST /risk/validate`
   ```json
   {
     "user_id": "uuid",
     "symbol": "BTCUSDT",
     "side": "BUY",
     "quantity": 0.01,
     "current_position": 0.05
   }
   ```
4. Risk Service responds:
   - `200 OK` → Proceed with order
   - `403 Forbidden` → Reject order, return error to user
5. If approved: Submit order to exchange

**Caching Strategy (Reduces Risk Service Load)**

**Cache Key**
```
risk:approval:{user_id}:{symbol}:{side}:{quantity}:{position_snapshot}
```

**Key Properties**
- `position_snapshot`: Current position size at validation time (e.g., "0.05")
- Cache becomes invalid if position changes (different cache key)

**Cache Value**
```json
{
  "approved": true,
  "validated_at": "2026-01-22T10:00:00.123Z",
  "limits_snapshot": {
    "max_position_size": 0.1,
    "max_exposure_usd": 10000,
    "max_daily_loss_usd": 1000
  }
}
```

**Cache TTL**
- 10 seconds (fixed)
- Rationale: Identical repeat orders within 10s are safe (same position, same quantity)

**Cache Usage Logic**
1. Receive order request
2. Get current position: `position = await PortfolioService.getPosition(userId, symbol)`
3. Build cache key including `position`
4. Check cache:
   - **Cache hit**: Return cached approval, skip Risk Service call
   - **Cache miss**: Call Risk Service, cache result
5. Proceed with order or reject based on approval

**Version-Based Cache Invalidation**

**Problem**
Cache key based on position value can become stale during concurrent updates.

**Solution: Version-Based Cache Keys**

**Cache Key Format (Updated)**
```
risk:approval:{user_id}:{symbol}:{side}:{quantity}:{position_version}
```

Example:
```
risk:approval:user123:BTCUSDT:BUY:0.01:42
```

**Position Query (Execution Service)**
```typescript
const position = await portfolioService.getPosition(userId, symbol);
// Returns: { quantity: 0.05, version: 42 }

const cacheKey = `risk:approval:${userId}:${symbol}:${side}:${quantity}:${position.version}`;
```

**Automatic Cache Invalidation**
- Position update increments version: `version = version + 1`
- Old cache key: `...0.01:42` (version 42)
- New cache key: `...0.01:43` (version 43)
- Cache miss on new version → Fresh risk validation required
- No manual invalidation needed (different key)

**Version Mismatch Handling**
Risk Service validates version hasn't changed:
```typescript
async validateRisk(request: RiskValidationRequest) {
  // Re-query current position
  const currentPosition = await portfolioService.getPosition(request.user_id, request.symbol);

  if (currentPosition.version !== request.position_version) {
    // Position changed during validation
    return {
      status: 409,
      error: 'POSITION_CHANGED',
      message: 'Position changed during validation, retry required',
      current_version: currentPosition.version
    };
  }

  // Version matches, proceed with validation
  // ...
}
```

**Execution Service Retry Logic**
```typescript
let retries = 0;
while (retries < 3) {
  const position = await getPosition(userId, symbol);
  const approval = await riskService.validate({
    position_version: position.version,
    // ... other params
  });

  if (approval.status === 409) {
    // Position changed, retry with fresh data
    retries++;
    await sleep(50);
    continue;
  }

  return approval;
}

throw new Error('POSITION_TOO_VOLATILE');
```

**Guarantees**
- Zero stale cache approvals (version mismatch detected)
- Automatic cache invalidation (version in key)
- Rare retries (< 1% under normal load)
- Performance impact: +5ms for version check (acceptable)

**Manual Cache Invalidation (Admin) - Q7: In-Flight Order Handling**
- Endpoint: `POST /admin/risk-cache/clear`
- Use cases:
  - Risk limits changed by admin
  - Debugging suspected cache issues
- Clears all cache entries (global flush)
- **Impact on in-flight orders**:
  - Orders already approved by Risk Service: Continue to exchange (validation already passed)
  - Orders in Execution Service queue (not yet risk-checked): Will undergo fresh validation
  - Orders submitted to exchange: Unaffected (already past risk gate)
- **Safe window**: Cache clear does NOT retroactively cancel approved orders
- **Admin warning**: "Cache clear forces fresh validation for new orders only. Existing orders unaffected."

**Fail-Closed Behavior**
If Risk Service is unreachable:
1. Check cache
2. If cache hit: Use cached approval (safe, recent validation)
3. If cache miss: **Reject order** (fail-closed)
   - Return `HTTP 503 Service Unavailable`
   - Message: "Risk Service temporarily unavailable. Order rejected for safety."

**Risk Service Timeout and Retry (Q6: Maximum Staleness)**
- Risk Service call timeout: 2 seconds per request
- Retry logic: 3 attempts with 100ms backoff
- Total maximum wait: 2s + 2s + 2s = **6 seconds**
- After 3 failures: Order rejected with `RISK_SERVICE_UNAVAILABLE`
- Position data staleness acceptable for risk check: **< 5 seconds**
- If Portfolio Service returns `is_stale: true` (> 5s old):
  - Execution Service waits up to 1 second for fresh data
  - If still stale after 1s: Reject order with `POSITION_DATA_STALE`

**Automatic Kill Switch (Risk Service Down)**
- If Risk Service unreachable for > 30 seconds continuously:
  - Trigger automatic kill switch
  - Stop all active strategies
  - Notify all users
- Manual intervention required to restart

**Monitoring**
Emit metrics every 10 seconds:
- `risk.cache.hit_rate` (percentage)
- `risk.cache.size` (number of entries)
- `risk.approval.latency.p95` (milliseconds)
- `risk.service.availability` (uptime percentage)

Alert if:
- `risk.cache.hit_rate < 10%` (expected ~30%, indicates cache not working)
- `risk.approval.latency.p95 > 200ms` (Risk Service slow)
- `risk.service.availability < 99%` (Risk Service down too often)

**Guarantees**
- Cache never returns approval for outdated position
- Cache hit rate ~30% (reduces Risk Service load by 30%)
- Risk Service downtime < 30s has minimal user impact (cache covers gaps)
- Risk Service downtime > 30s triggers kill switch (safe)

**Trade-offs**
- Identical repeat orders within 10s bypass fresh limit check (accepted risk for performance)
- Position must be queried from Portfolio Service (adds latency ~20ms)
- Cache storage overhead: ~100 bytes per entry, ~1000 entries max = 100KB (negligible)

---

### Risk Service Position Consistency (Version-Based Optimistic Locking)

**Problem**
Position can change between Portfolio query and Risk validation, leading to stale risk checks.

**Solution**
Portfolio Service returns position with monotonic version number.
Risk Service validation requires matching version.

**Portfolio Service API Response**
```json
GET /portfolio/positions/BTCUSDT

{
  "symbol": "BTCUSDT",
  "quantity": 0.05,
  "version": 42,
  "updated_at": "2026-01-22T10:00:00Z"
}
```

**Version Counter Rules**
- Incremented on every position change (fill, manual adjustment)
- Stored in `positions.version` column (BIGINT, default 1)
- Never decremented or reused

**Risk Service Validation Request**
```json
POST /risk/validate

{
  "user_id": "uuid",
  "symbol": "BTCUSDT",
  "side": "BUY",
  "quantity": 0.01,
  "current_position": 0.05,
  "position_version": 42
}
```

**Risk Service Validation Logic**
1. Query Portfolio Service for latest position
2. Compare `position_version` from request vs. current version
3. If versions differ:
   - Return `HTTP 409 Conflict`
   - Response: `{"error": "POSITION_CHANGED", "message": "Position changed during validation, retry required", "current_version": 43}`
4. If versions match: Proceed with risk limit checks

**Execution Service Retry Logic**
When receiving `409 Conflict`:
1. Re-query Portfolio Service for fresh position
2. Rebuild risk validation request with new version
3. Retry validation (max 3 attempts with 50ms delay)
4. If 3 retries exhausted: Reject order with `POSITION_TOO_VOLATILE`

**Cache Key (Updated)**
```
risk:approval:{user_id}:{symbol}:{side}:{quantity}:{position_version}
```
- Version change automatically invalidates cache (different key)
- No manual cache invalidation needed

**Guarantees**
- Risk validation uses current position data (no stale reads)
- Version mismatch detected before order submission
- Automatic retry resolves transient conflicts

**Performance Impact**
- Version check adds ~5ms to validation (single DB query)
- Retry rate expected < 1% under normal load
- Acceptable trade-off for correctness

---

### 5. Portfolio Service (Updated)

**Responsibilities**
- Positions
- Balances
- Realized / Unrealized PnL
- Historical snapshots

**Data Source**
- Derived from execution events (`order_events`, `fills`)
- Enriched with current market prices

**Consistency Model**
- **Eventual consistency** with < 1 second lag (p95)
- Real-time event stream triggers recalculation
- Guaranteed consistent after any execution event fully processed

**Recalculation Triggers**
- New fill event → Update position and realized PnL
- Order state change → Update open order exposure
- Price update (every 5s) → Update unrealized PnL
- User query → Check if recalculation needed, run if stale

**Staleness Handling**
- If last update > 1 second ago: Force recalculation before response
- UI shows "as of <timestamp>" for all PnL data
- Websocket pushes updates to connected clients

**Read-Heavy Optimization**
- Materialized views for current positions
- Cached PnL calculations (invalidated on events)
- Historical snapshots stored hourly for performance

**Guarantees**
- PnL never shows fills that didn't happen
- Eventual consistency window: < 1 second
- Queries during heavy trading may show slight lag (acceptable)

---

### Portfolio Service Recalculation Priority Queue

**Problem**
During high load, all recalculations queued equally → user queries timeout waiting for background work.

**Solution**
Two-tier priority queue: high-priority (user-facing) and low-priority (background).

**Queue Implementation (Redis-Based)**

**Queue Names**
- `portfolio:high_priority` — User queries, fill events
- `portfolio:low_priority` — Price updates, scheduled reconciliation

**High-Priority Events**
- User API queries: `GET /portfolio/*` (synchronous recalculation needed)
- Fill events: Position changed (immediate recalculation required)
- Reconciliation-sourced fills: Position correction needed

**Low-Priority Events**
- Periodic price updates (every 5 seconds)
- Full portfolio snapshots (hourly)
- Historical PnL calculations (daily)

**Worker Behavior**
```typescript
while (true) {
  // Always check high-priority first
  let event = await redis.rpoplpush('portfolio:high_priority', 'portfolio:processing')

  if (!event) {
    // Only process low-priority when high-priority empty
    event = await redis.rpoplpush('portfolio:low_priority', 'portfolio:processing')
  }

  if (event) {
    await processEvent(event)
    await redis.lrem('portfolio:processing', 1, event)
  } else {
    await sleep(100)  // No work available
  }
}
```

**Backlog Handling**

**High-Priority Backlog**
- Target: Queue length < 50
- If backlog > 100:
  - Log warning: `High-priority portfolio queue backlog: {length}`
  - Alert ops team (consider scaling workers)
  - Continue processing (no shedding)

**Low-Priority Backlog**
- Target: Queue length < 500
- If backlog > 1000:
  - Log: `Shedding low-priority portfolio work`
  - Drop oldest low-priority events (keep queue at 500)
  - Price updates can be skipped (next update in 5s anyway)

**Synchronous Recalculation (User Query Path)**
When user queries portfolio:
1. Check `data_as_of_timestamp` in cache
2. If stale (> 1 second):
   - Enqueue high-priority recalculation event
   - Wait up to 500ms for completion
   - If timeout: Return cached data with `is_stale: true`
3. If fresh: Return cached data with `is_stale: false`

**Guarantees**
- User queries answered within 500ms (p95) under normal load
- Fill events processed within 1 second (p95)
- Background work delayed (not dropped) unless extreme backlog
- Risk Service position queries use fresh data (high-priority path)

**Performance Impact**
- Redis latency: ~1-5ms per enqueue/dequeue (negligible)
- Worker processes 100-200 events/second (sufficient for MVP)

**Monitoring**
- Emit metrics:
  - `portfolio.queue.high_priority.length`
  - `portfolio.queue.low_priority.length`
  - `portfolio.recalc.duration.p95`
- Alert if:
  - High-priority length > 100 (backlog)
  - Recalc duration p95 > 300ms (slow processing)

---

### Portfolio Service Consistency Guarantees (Detailed)

**Consistency Model**
- **Target**: < 1 second lag (p95) under normal load
- **Actual**: Eventual consistency with transparency

**Event Processing**
- All events (fills, order state changes) include sequence number
- Events processed in order per `order_id`
- Processing time target: < 100ms per event
- If backlog > 200 events: Log warning (monitoring alert)

**Staleness Handling**
- All `/portfolio/*` responses include:
  - `data_as_of_timestamp`: ISO 8601 timestamp of last update
  - `is_stale`: boolean (true if `now - data_as_of_timestamp > 5 seconds`)
- If query arrives and `data_as_of_timestamp > 5 seconds ago`:
  - Trigger synchronous recalculation (max 500ms timeout)
  - If timeout exceeded: Return last known value with `is_stale: true`

**During Reconciliation**
- Reconciliation events queued with normal priority (no reordering)
- Reconciliation-sourced fills processed same as websocket fills
- No special handling (event deduplication prevents double-counting)

**API Response Format**
```json
{
  "balance": 10500.00,
  "equity": 10720.00,
  "unrealized_pnl": 220.00,
  "data_as_of_timestamp": "2026-01-22T10:15:23.445Z",
  "is_stale": false
}
```

**UI Requirements**
- Display "Portfolio as of [HH:MM:SS]" next to all PnL values
- If `is_stale: true`: Show warning icon with tooltip "Data may be delayed"

**Guarantees**
- No lost fills (event sourcing ensures all events persisted)
- No double-counted positions (deduplication by `exchange_fill_id`)
- Staleness always visible to user
- Under normal load (< 100 concurrent strategies): p95 lag < 1 second
- Under heavy load: Lag may increase but never hidden

---

### Portfolio Events Outbox - Failure Handling

**Retry Policy**
- Max retries: 3 attempts per event
- Backoff: Exponential (1s, 2s, 4s)
- Retry triggers: Database errors, network timeouts, validation failures

**Dead Letter Queue (DLQ)**
After 3 failed retries:
```sql
INSERT INTO execution.portfolio_events_dead_letter (
  original_event_id,
  event_type,
  payload,
  failure_reason,
  retry_count,
  moved_to_dlq_at
)
SELECT id, event_type, ROW_TO_JSON(outbox.*), last_error, 3, NOW()
FROM execution.portfolio_events_outbox
WHERE id = ?;

DELETE FROM execution.portfolio_events_outbox WHERE id = ?;
```

**DLQ Monitoring**
- Alert if `COUNT(*) > 0` in DLQ table (critical, requires ops intervention)
- Dashboard shows DLQ size and event types
- Weekly manual review of DLQ events (operational procedure)

**Manual Replay Procedure**
1. Ops team investigates failure reason
2. Fix root cause (e.g., invalid data, schema mismatch)
3. Replay events via admin endpoint:
   ```
   POST /admin/portfolio-events/replay
   {
     "event_ids": ["uuid1", "uuid2"]
   }
   ```
4. Events reprocessed through normal pipeline
5. If successful: Remove from DLQ
6. If failed again: Escalate to engineering team

**Dead Letter Queue (DLQ) - Poison Message Handling**

**DLQ Schema**
```sql
CREATE TABLE execution.portfolio_events_dead_letter (
  id UUID PRIMARY KEY,
  original_event_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_payload JSONB NOT NULL,
  failure_reason TEXT NOT NULL,
  retry_count INTEGER NOT NULL,
  moved_to_dlq_at TIMESTAMPTZ DEFAULT NOW()
);
```

**DLQ Trigger Conditions**
- Event processing fails 3 consecutive times
- Failure types: JSON parse error, schema validation error, database constraint violation
- Each retry attempt logged with error details

**DLQ Processing**
```sql
-- After 3rd failure, move to DLQ
INSERT INTO execution.portfolio_events_dead_letter (
  id, original_event_id, event_type, event_payload, failure_reason, retry_count, moved_to_dlq_at
)
SELECT gen_random_uuid(), id, event_type, ROW_TO_JSON(outbox.*), last_error, 3, NOW()
FROM execution.portfolio_events_outbox
WHERE id = ?;

-- Remove from outbox (prevents blocking queue)
DELETE FROM execution.portfolio_events_outbox WHERE id = ?;
```

**DLQ Monitoring**
- Alert if `COUNT(*) > 0` in DLQ table (critical severity)
- Dashboard shows DLQ size, event types, and failure reasons
- Ops team notified immediately via PagerDuty/email

**Manual Replay Procedure**
1. Ops team investigates `failure_reason` in DLQ
2. Fix root cause (schema migration, data cleanup, code fix)
3. Replay via admin endpoint: `POST /admin/portfolio-events/replay`
4. Events reprocessed through normal pipeline
5. If successful: Remove from DLQ
6. If failed again: Escalate to engineering

**Fallback Mechanism**
- Reconciliation (every 60s) detects position inconsistencies
- Reconciliation emits corrective events (bypasses outbox)
- Ensures positions eventually consistent even if outbox fails
- Max staleness: 60 seconds (reconciliation interval)

**Guarantees**
- No silent event loss (all failures logged to DLQ)
- Poison messages isolated (don't block healthy events)
- Positions eventually consistent via reconciliation fallback
- Manual intervention required for systematic failures (acceptable for MVP)

---

### Fill Event Deduplication

**Problem**
Fills can arrive from multiple sources:
- Binance websocket (real-time)
- REST API reconciliation (every 60s)
- Crash recovery reconciliation (on restart)

**Solution**
Binance provides unique `tradeId` for each fill. Use this as deduplication key.

**Implementation**

**Database Schema**
```sql
CREATE TABLE fills (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  exchange_fill_id VARCHAR(255) NOT NULL,  -- Binance tradeId
  price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  fee DECIMAL(20, 8) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  source VARCHAR(50) NOT NULL,  -- 'WEBSOCKET' | 'RECONCILIATION' | 'RECOVERY'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (exchange_fill_id)  -- Prevents duplicates
);
```

**Processing Logic**
1. Receive fill event from any source (websocket, REST, recovery)
2. Attempt to INSERT into `fills` table
3. If insert succeeds: Event is new, process normally
4. If insert fails with unique constraint violation:
   - Fill already processed
   - Log: `Duplicate fill detected: exchange_fill_id={id}, source={source}, discarded`
   - Return success (idempotent operation)

**Deduplication Window**
- Infinite (constraint is permanent)
- Old fills can be archived after reconciliation window (24 hours) but constraint remains

**Race Condition Handling**
- Multiple workers can attempt to insert same fill concurrently
- Database serializes inserts via unique constraint
- Only first insert succeeds, others fail gracefully
- No application-level locking needed

**Guarantees**
- Each `exchange_fill_id` processed exactly once
- Safe to retry fill processing
- No double-counted positions or PnL
- Works across crashes and restarts

---

### 6. Backtest Service
**Responsibilities**
- Candle-based simulation
- Deterministic execution
- Strategy performance metrics

**Notes**
- No async execution in MVP
- Backtests are immutable once started

---

## Clock Synchronization (NFR - Q15)

**Requirement**
All servers must use NTP time synchronization with < 100ms drift.

**Why Critical**
- Event sequence ordering depends on timestamps
- Reconciliation compares DB timestamps with exchange timestamps
- Portfolio calculations use time-windowed data
- Stale data detection relies on accurate clocks

**Monitoring**
- Health check queries system time vs. NTP server every 60 seconds
- Endpoint: `GET /health` includes `{"clock_drift_ms": 23}`
- If drift > 100ms: Log warning, increment metric
- If drift > 500ms: **Activate kill switch** (event ordering unreliable)

**Implementation**
- Docker containers use host NTP (configured at infrastructure level)
- Kubernetes pods inherit node NTP configuration
- All timestamps stored in UTC (PostgreSQL `TIMESTAMPTZ` type)

**Acceptance Criteria**
- All server instances within 100ms of NTP server (p99)
- Kill switch activates if any instance drifts > 500ms
- Monitoring dashboard shows drift across all instances

---

## Data Architecture

### PostgreSQL + TimescaleDB (Single Cluster)

**Schemas**
- `auth`
- `strategy`
- `execution`
- `portfolio`
- `backtest`
- `analytics`

**Core Tables**
- `orders`
- `order_events`
- `fills`
- `positions`
- `balances`
- `candles` (Timescale hypertable)
- `backtest_runs`
- `backtest_results`

**Design Rules**
- All state transitions recorded as events
- No silent updates
- Soft deletes only where required

---

### Redis
**Usage**
- Job queue (BullMQ)
- Short-lived cache
- Rate limiting counters

**Non-Usage**
- Not a source of truth
- No long-term state

---

## Idempotency & Consistency

- All write APIs accept `Idempotency-Key`
- Repeated requests must:
  - return the same result
  - not duplicate side effects
- Execution service enforces idempotency at DB level

---

## Exchange Integration

### Exchange Adapter
- Abstracts Binance API
- Handles:
  - REST + WebSocket
  - Rate limits
  - Error normalization

**Design Rule**
> No other service talks directly to the exchange.

---

### Exchange Rate Limit Handling

**Binance Rate Limits (Spot)**
- Order placement: 50 orders per 10 seconds per API key
- Order queries: 160 requests per minute
- Account queries: 5 requests per second

**Strategy**
Implement **global rate limiter** in Exchange Adapter to prevent hitting limits.

**Implementation**

**Order Submission Rate Limiter**
- Algorithm: Token bucket
- Capacity: 50 tokens
- Refill rate: 5 tokens per second (50 per 10 seconds)
- Behavior:
  - Each order consumes 1 token
  - If tokens available: Submit immediately
  - If no tokens: Queue order, wait for token refill

**Queuing Behavior**
- Queue: In-memory FIFO queue per Execution Service instance
- Max queue size: 100 orders
- Max wait time: 30 seconds
- If queue full: Return `HTTP 429 Too Many Requests` to caller
- If wait time exceeded: Return `HTTP 504 Gateway Timeout`

**Retry Logic (Execution Service)**
When Exchange Adapter returns 429:
1. Extract `retry_after_ms` from response
2. Wait for `retry_after_ms` (or exponential backoff if not provided)
3. Retry order submission (max 3 attempts)
4. If all retries exhausted: Mark order as `REJECTED` with reason `RATE_LIMITED`

**Exponential Backoff**
- Attempt 1: Wait 1 second
- Attempt 2: Wait 2 seconds
- Attempt 3: Wait 4 seconds
- After 3 failures: Give up, return error to user

**User Notification**
If order rejected due to rate limiting:
- API response:
  ```json
  {
    "error": "RATE_LIMITED",
    "message": "Order submission rate limit exceeded. Please reduce trading frequency.",
    "retry_after_seconds": 4
  }
  ```
- Strategy receives event: `ORDER_REJECTED` with reason `RATE_LIMITED`
- Strategy behavior: Strategy-specific (DCA/Grid may retry, Swing may skip)

**429 Response Format (Exchange Adapter → Execution Service)**
```json
{
  "status": 429,
  "error": "RATE_LIMITED",
  "message": "Binance rate limit approached. Order queued.",
  "retry_after_ms": 2000,
  "queue_depth": 15
}
```

**Monitoring**
Emit metrics every 10 seconds:
- `exchange.rate_limit.tokens_available` (current token count)
- `exchange.rate_limit.queue_depth` (orders waiting)
- `exchange.rate_limit.rejections` (count of 429 responses to users)
- `exchange.order.latency.queued` (time spent in queue)

Alert if:
- `queue_depth > 50` (approaching queue limit)
- `rejections > 10 per minute` (users being rejected)
- `latency.queued.p95 > 5000ms` (orders waiting too long)

**Guarantees**
- Binance rate limits never exceeded (token bucket prevents)
- Orders queued fairly (FIFO)
- Users informed when rate limited (explicit error)

**Limitations (MVP)**
- Single Execution Service instance only (queue not distributed)
- Post-MVP: Distributed rate limiter (Redis-based) for multi-instance deployment

**Alternatives Considered**
- Reject immediately without queuing: Too harsh for users
- Unlimited queue: Risk of memory overflow
- Per-strategy rate limits: Too complex for MVP

---

### Exchange Rate Limiter: Queue Persistence

**Problem**
In-memory queue lost on Execution Service restart → orders stuck in SUBMITTED state.

**Solution**
Persist queue state to database. Recover on restart.

**Database Schema Addition**
```sql
ALTER TABLE orders ADD COLUMN queued_at TIMESTAMPTZ NULL;
```

**Queue Workflow (Updated)**
1. Order arrives, rate limit tokens unavailable
2. Database update: `UPDATE orders SET queued_at = NOW() WHERE id = ?`
3. Add to in-memory FIFO queue
4. When token available:
   - Submit to exchange
   - Database update: `UPDATE orders SET queued_at = NULL WHERE id = ?`

**Crash Recovery Procedure**
On Execution Service restart:

1. Query queued orders:
   ```sql
   SELECT * FROM orders
   WHERE queued_at IS NOT NULL
     AND queued_at > NOW() - INTERVAL '5 minutes'
   ORDER BY queued_at ASC;
   ```

2. For each order:
   - Check if exists on exchange (via reconciliation)
   - If on exchange: Update state normally, clear `queued_at`
   - If not on exchange: Re-add to in-memory queue

3. Stale queued orders (> 5 minutes):
   ```sql
   UPDATE orders
   SET status = 'REJECTED',
       queued_at = NULL,
       rejection_reason = 'QUEUE_TIMEOUT'
   WHERE queued_at < NOW() - INTERVAL '5 minutes';
   ```

**Guarantees**
- No silent order loss on crash
- Queued orders resume after restart (< 30s delay)
- Stale orders (> 5 min) explicitly rejected with reason

**Performance Impact**
- 2 extra database writes per queued order (queued_at set/clear)
- Acceptable for MVP scale (< 50 orders/10s)
- Post-MVP: Redis-based distributed queue

---

### Exchange WebSocket Connection Management

**Purpose**
Binance WebSocket streams provide real-time updates for:
- Order execution (fills, state changes)
- Account balance updates

**Connection Lifecycle**

**Initial Connection**
1. Subscribe to user data stream (requires REST API call to get listenKey)
2. Open WebSocket connection to `wss://stream.binance.com:9443/ws/{listenKey}`
3. Set connection timeout: 30 seconds
4. If connection succeeds: Log "WebSocket connected"
5. If connection fails: Retry with exponential backoff

**Keepalive**
- Send `listenKey` refresh request every 30 minutes (Binance requirement)
- If refresh fails: Close connection, reconnect

**Disconnect Detection**
- WebSocket ping/pong timeout: 10 seconds
- If no pong received: Assume connection dead
- Log: "WebSocket disconnected, reason={reason}"
- Emit metric: `exchange.websocket.disconnect`

**Automatic Reconnection**

**Reconnection Strategy**
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (max)
- Max reconnection attempts: Unlimited (keep trying)
- On each attempt:
  1. Get new listenKey via REST API
  2. Open new WebSocket connection
  3. If success: Proceed to event gap recovery
  4. If failure: Wait for next backoff interval

**Event Gap Recovery (On Reconnect)**
After WebSocket reconnects, we may have missed events during downtime.

**Recovery Procedure**
1. Log: "WebSocket reconnected, recovering missed events"
2. Query REST API for all non-final orders:
   - `GET /api/v3/openOrders` (returns all OPEN orders)
   - `GET /api/v3/allOrders?orderId={id}` for each previously-tracked order
3. For each order returned:
   - Compare exchange state vs. last known state in database
   - If state changed: Emit state change event
   - If new fills detected: Emit fill events
4. Log: "Event gap recovery complete, events_recovered={count}"
5. Resume normal WebSocket message processing

**Event Processing During Disconnection**
- WebSocket messages not received during disconnect
- Reconciliation (runs every 60s) will catch missed events as fallback
- Gap recovery on reconnect reduces delay (typically < 10s instead of up to 60s)

**User Impact**
- During disconnect: Portfolio updates delayed until reconnect or reconciliation
- Portfolio Service shows `is_stale: true` if last update > 5s ago
- Users see warning: "Connection issue, data may be delayed"
- Strategies continue running (use cached position data until updated)

**Monitoring**

**Metrics**
- `exchange.websocket.status` (1=connected, 0=disconnected)
- `exchange.websocket.reconnect_count` (counter)
- `exchange.websocket.disconnect_duration_ms` (histogram)
- `exchange.websocket.gap_recovery_events` (count of recovered events per reconnect)

**Alerts**
- Disconnect duration > 30 seconds: Warning
- Disconnect duration > 2 minutes: Critical (trigger manual investigation)
- Reconnection failures > 5 consecutive: Critical (API key issue or exchange down)

**Graceful Degradation**
If WebSocket repeatedly fails to reconnect (> 5 minutes):
1. Log critical error: "WebSocket connection permanently lost"
2. Continue operating on REST API polling only (reconciliation every 60s)
3. No kill switch triggered (system still functional, just slower updates)
4. Notify users: "Real-time updates unavailable, using delayed polling"

**Guarantees**
- Automatic reconnection (no manual intervention)
- Missed events recovered on reconnect (< 10s delay typically)
- Reconciliation as fallback (< 60s delay worst case)
- No lost fills (all events eventually captured)

**Non-Guarantees**
- Event delivery during disconnect window (WebSocket messages lost, recovered from REST)
- Real-time updates during disconnect (delay until reconnect or reconciliation)

---

### Exchange API Circuit Breaker

**Problem**
Exchange API failures (rate limits, outages, timeouts) can cascade and exhaust resources.

**Solution**
Circuit breaker pattern with three states: CLOSED → OPEN → HALF_OPEN.

**Circuit Breaker States**

**CLOSED (Normal Operation)**
- All requests pass through
- Track failure rate over sliding window (60 seconds)
- If failure rate > 50% over 10+ requests: Transition to OPEN

**OPEN (Fail-Fast)**
- All requests immediately rejected
- Return `HTTP 503 Service Unavailable`
- Error: `{"error": "EXCHANGE_UNAVAILABLE", "message": "Exchange API circuit breaker open, retry after 30s"}`
- After 30 seconds: Transition to HALF_OPEN

**HALF_OPEN (Testing Recovery)**
- Allow 3 test requests through
- If all 3 succeed: Transition to CLOSED
- If any fails: Transition back to OPEN (wait another 30s)

**Failure Criteria**
Count as failure:
- HTTP 5xx responses from exchange
- Network timeout (> 10s)
- Connection refused
- TLS/SSL errors

Do NOT count as failure:
- HTTP 4xx (client errors, rate limits handled separately)
- Successful responses (2xx)

**Implementation (Per Exchange Adapter Instance)**
```typescript
class CircuitBreaker {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  failures: number
  requests: number
  lastFailureTime: Date

  async execute(fn: () => Promise<any>) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > 30000) {
        this.state = 'HALF_OPEN'
        this.testRequests = 0
      } else {
        throw new Error('EXCHANGE_UNAVAILABLE')
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
}
```

**Monitoring**
- Emit metric: `exchange.circuit_breaker.state` (0=CLOSED, 1=OPEN, 2=HALF_OPEN)
- Alert if state transitions to OPEN (critical)
- Dashboard showing failure rate and state transitions

**User Impact**
- Orders rejected with explicit error during OPEN state
- UI shows: "Exchange temporarily unavailable, retry in 30s"
- Automatic retry when circuit CLOSED (no user action needed)

**Guarantees**
- Fail-fast during exchange outages (< 100ms response vs. 10s timeout)
- Automatic recovery testing every 30s
- Resource exhaustion prevented (no timeout accumulation)

**Post-MVP Enhancement**
- Per-endpoint circuit breakers (order submission vs. queries)
- Adaptive timeout based on recent latency

---

## Failure Handling

### Expected Failures
- Network issues
- Exchange rate limits
- Partial fills
- Delayed confirmations

### Handling Strategy
- Retry with backoff
- Reconcile via exchange state
- Never assume success without confirmation

---

## Security

- Exchange API keys encrypted at rest
- Decryption only inside Execution Service
- No key exposure to UI or Strategy Service
- Audit log for all trading actions

---

## Observability (MVP)

- Structured logs
- Order lifecycle tracing
- Metrics:
  - order success/failure
  - execution latency
  - reconciliation errors

---

## Scalability Considerations (Post-MVP)

- Horizontal scaling of stateless services
- Separate execution workers
- Multi-exchange adapters
- Dedicated low-latency execution path (future)

---

### Kill Switch Execution Flow (Detailed)

**Trigger Sources**
- Manual: User clicks "Emergency Stop" button
- Automatic: Risk Service down > 30s, time drift > 5s

**Phase 1: Immediate Actions (< 1 second)**
1. Set global flag: `UPDATE system_config SET kill_switch_active = true`
2. Stop all strategies: `UPDATE strategies SET status = 'STOPPED' WHERE status LIKE 'ACTIVE_%'`
3. Reject new order submissions (API Gateway returns `HTTP 503`)
4. Log: `Kill switch activated, reason={reason}, user={user_id}`
5. Return success to caller (don't wait for cancellations)

**Phase 2: Grace Period for SUBMITTED Orders (10 seconds)**
Handle orders not yet acknowledged by exchange:

1. Query: `SELECT * FROM orders WHERE status = 'SUBMITTED'`
2. For each order, wait up to 10 seconds for state transition:
   - Poll order status every 500ms
   - If transitions to `OPEN`: Add to cancellation list (Phase 3)
   - If transitions to `REJECTED`: No action needed
   - If still `SUBMITTED` after 10s: Mark as `POTENTIALLY_EXECUTED` (see below)

**POTENTIALLY_EXECUTED State**
New order state for race condition scenario:

- Order submitted to exchange but acknowledgment not received
- Order may execute on exchange (cannot determine without exchange response)
- Reconciliation (within 60s) will determine actual final state
- User explicitly warned via notification

**Database Update**
```sql
UPDATE orders
SET status = 'POTENTIALLY_EXECUTED',
    notes = 'Kill switch activated before exchange acknowledgment'
WHERE status = 'SUBMITTED'
  AND updated_at < NOW() - INTERVAL '10 seconds';
```

**Phase 3: Order Cancellation (Best-Effort, up to 2 minutes)**
Cancel all acknowledged orders:

1. Query:
   ```sql
   SELECT * FROM orders
   WHERE status IN ('OPEN', 'PARTIALLY_FILLED')
   ORDER BY created_at DESC;  -- Newest first
   ```

2. For each order:
   - Send `DELETE /api/v3/order` to Binance
   - Update: `SET status = 'CANCELING'`
   - Wait up to 10 seconds for acknowledgment
   - If success: Normal event flow → `CANCELED`
   - If timeout/failure: Log error, continue to next order

3. Total cancellation budget: 2 minutes

**Phase 4: User Notification (Immediate, don't wait for Phase 3)**

**Email (sent after Phase 1 completes)**
```
Subject: Emergency Stop Activated - AI Trader Platform

The emergency stop was activated at [timestamp].

Reason: [manual / risk_service_down / time_drift]
Triggered by: [user email / system]

Actions taken:
✓ All strategies stopped immediately
✓ New orders blocked
⏳ [X] open orders being cancelled (up to 2 min)
⚠️  [N] orders pending exchange confirmation (may execute)

IMPORTANT:
- [N] orders marked POTENTIALLY_EXECUTED may still fill
- Check order history in 60 seconds: [link]
- Reconciliation will confirm final states
- Manual restart required after issue resolved

Next steps:
1. Review positions: [link]
2. Check order history: [link]
3. Wait for reconciliation (automatic within 60s)
4. Do NOT restart until you verify system state

Questions? Contact support.
```

**WebSocket Event**
```json
{
  "type": "KILL_SWITCH_ACTIVATED",
  "timestamp": "2026-01-22T10:15:00Z",
  "reason": "manual",
  "stopped_strategy_count": 5,
  "cancellation_status": "in_progress",
  "potentially_executed_count": 2,
  "message": "Emergency stop active. Some orders may execute pending confirmation."
}
```

**Guarantees**
- Strategies stopped within 1 second
- New orders rejected immediately
- All OPEN orders cancelled (best-effort, 2-minute window)
- SUBMITTED orders tracked and reconciled within 60s
- User explicitly warned about potentially executing orders

**Non-Guarantees (Explicit)**
- SUBMITTED orders may execute (race condition accepted)
- OPEN orders may partially fill during cancellation window
- Kill switch is "emergency brake" not "atomic rollback"
- Acceptable for non-HFT system (candle-based strategies)

**Total Kill Switch Duration**
- Phase 1: < 1 second
- Phase 2: 10 seconds
- Phase 3: up to 2 minutes
- Total worst-case: ~2 minutes 11 seconds

**Recovery Procedure**
Manual only (no automatic restart):

1. Admin investigates root cause
2. Admin resolves issue (restore Risk Service, fix time sync, etc.)
3. Admin runs health check: `GET /admin/health/detailed`
4. Admin runs reconciliation: `POST /admin/reconcile/force`
5. Admin clears kill switch: `POST /admin/kill-switch/clear`
6. Users receive notification: "Kill switch cleared. Review positions before restarting strategies."
7. Users manually restart strategies if desired

**Scope**
- **MVP**: Global kill switch only (affects all users, all strategies)
- **Post-MVP**: Per-user and per-strategy kill switches

---

## Explicit Non-Goals (Architecture)

- Tick-level HFT execution
- Kernel/network tuning
- Custom user code sandboxing
- Mobile-specific optimizations

---

## Definition of Done (Architecture)

- Services have clear ownership boundaries
- Order lifecycle is fully deterministic
- System recovers cleanly after restart
- Architecture supports adding:
  - new strategies
  - new exchanges
  - new execution modes

---
```

## Order Reconciliation

**Purpose**
Ensure DB state matches exchange reality, especially after crashes or network failures.

**Frequency**
- Every 60 seconds for all non-final orders (SUBMITTED, OPEN, PARTIALLY_FILLED, CANCELING)
- Automatically on Execution Service restart
- On-demand via admin endpoint (for debugging)

**Reconciliation Window**
- Last 24 hours of orders
- Older orders assumed final and not re-checked

**Procedure**
1. Query exchange for order status (via REST API)
2. Compare exchange state with DB state
3. Apply conflict resolution rules (see below)
4. Log all reconciliation actions to audit table

**Conflict Resolution Rules (Priority Order - Risk #6)**

1. **User-initiated actions take priority over reconciliation**
   - If DB shows `CANCELING` (user requested cancel):
     - Ignore exchange OPEN state (user intent is authoritative)
     - Re-submit cancel request to exchange
     - Wait 10 seconds for confirmation
     - If still OPEN after 10s: Mark as `CANCELING_FAILED`, alert user
   - Rationale: User actions must be respected, not silently overwritten

2. **Exchange final states are authoritative (FILLED, CANCELED, REJECTED)**
   - Exchange shows FILLED but DB shows OPEN → Update DB to FILLED
   - Exchange shows CANCELED but DB shows CANCELING → Update DB to CANCELED (user action succeeded)
   - Exchange shows REJECTED → Update DB to REJECTED
   - Emit all missing fill events for FILLED orders

3. **Order in DB but NOT on exchange**
   - If order age < 5 minutes → **Resubmit** (likely network timeout during submission)
   - If order age > 5 minutes → Mark as REJECTED (reason: 'SUBMISSION_LOST')
   - Log critical alert (should be rare if idempotency works)

4. **Order in SUBMITTED state for > 60 seconds**
   - Query exchange by clientOrderId
   - If found: Update to correct state (OPEN/FILLED/CANCELED)
   - If not found: Mark as REJECTED (reason: 'SUBMISSION_TIMEOUT')

5. **Partial fill differences**
   - Exchange shows more fills than DB → Emit missing fill events (normal gap recovery)
   - DB shows more fills than exchange → **Critical error** (should never happen due to deduplication)
     - Log critical alert
     - Trigger manual review
     - Do NOT auto-correct (data integrity issue)

**Guarantees**
- Eventual consistency within 60 seconds
- No phantom orders
- No lost fills
- User cancel requests always respected (never silently overwritten)

## Crash Recovery Procedure (Updated)

**Trigger**
- Execution Service restarts after crash, deployment, or infrastructure failure

**Recovery Sequence**
1. **Mark service as RECOVERING**
   - Health check returns `503 Service Unavailable`
   - No new orders accepted
   - Log: "Execution Service entering recovery mode"

2. **Load in-flight orders from database**
   - Query all orders with non-final states: `SUBMITTED`, `OPEN`, `PARTIALLY_FILLED`, `CANCELING`
   - Filter: Last 24 hours only (older orders assumed final)
   - Store count for notification

3. **Run full reconciliation**
   - For each in-flight order:
     - Query Binance REST API for current order status
     - Query Binance REST API for all fills (trades) for this order
     - Compare exchange state vs. database state
     - Emit events for any discrepancies (fills, state changes)
   - Log all reconciliation actions to `order_reconciliation_log` table

4. **Update order states**
   - Process emitted events through normal event pipeline
   - Transition orders to final states where possible
   - Update positions and balances via Portfolio Service

5. **Mark service as HEALTHY**
   - Health check returns `200 OK`
   - Accept new order submissions
   - Log: "Execution Service recovery complete, duration={duration_ms}ms"

6. **Notify affected users**
   - Query: All strategies that were `ACTIVE_LIVE` or `ACTIVE_PAPER` before crash
   - Send notifications (see below)

**User Notification (Multi-Channel)**

**1. Email Notification**
- **To**: All users with strategies stopped due to recovery
- **Subject**: "Trading Platform Recovered - Action Required"
- **Body**:
  ```
  The AI Trader platform has recovered from a restart.

  Recovery details:
  - Recovery completed at: [timestamp]
  - Duration: [duration in seconds]
  - Orders reconciled: [count]

  Strategies stopped:
  [List of strategy names with IDs]

  Action required:
  1. Review your order history: [link]
  2. Verify your positions match expectations: [link]
  3. Manually restart strategies if desired

  Important:
  - All strategies remain STOPPED until you manually restart them
  - This is a safety measure to prevent unintended trading
  - Do NOT restart strategies until you verify system state

  Questions? Contact support.
  ```
- **Sent**: Within 30 seconds of recovery completion

**2. UI Banner (Persistent)**
- **Trigger**: User logs in or refreshes page after recovery
- **Message**: "⚠️ System recovered from restart at [HH:MM]. [N] strategies were stopped. [Review] [Dismiss]"
- **Behavior**:
  - Displayed at top of all pages
  - Yellow background (warning, not error)
  - "Review" button → Opens modal with:
    - List of stopped strategies
    - Link to order history
    - Link to positions
    - "I understand, dismiss" button
  - Banner persists until user clicks "Dismiss"
  - Re-appears on every page load until dismissed

**3. WebSocket Push (Real-Time)**
- **Event**: Sent to all connected WebSocket clients
- **Payload**:
  ```json
  {
    "type": "SYSTEM_RECOVERY_COMPLETE",
    "timestamp": "2026-01-22T10:15:30Z",
    "recovery_duration_ms": 15432,
    "stopped_strategies": [
      {"id": "uuid1", "name": "RSI Swing", "mode": "LIVE"},
      {"id": "uuid2", "name": "Grid BTC", "mode": "PAPER"}
    ],
    "reconciled_order_count": 12,
    "message": "System recovered. Review positions before restarting strategies."
  }
  ```
- **Client Behavior**:
  - Display toast notification (auto-dismiss after 10 seconds)
  - Refresh strategy list UI (show all as STOPPED)
  - Show persistent banner (as described above)

**Strategy Behavior After Recovery**
- All strategies transition to `STOPPED` state (even if they were `ACTIVE_LIVE` before crash)
- No automatic restart (prevents runaway trading if crash was due to strategy bug)
- User must manually review and restart each strategy
- Strategy configuration remains unchanged (only state changes)

**Recovery Timeout**
- **Target**: < 30 seconds (typical)
- **Maximum**: 2 minutes (worst case with 100+ in-flight orders)
- **If exceeded**: Log critical error, continue accepting new orders anyway (fail-open for availability)

**Guarantees**
- All in-flight orders reconciled before accepting new orders
- All users with stopped strategies notified via email
- UI shows recovery status on next login
- No duplicate order submissions during recovery
- Recovery completes deterministically (same inputs → same outputs)

**Non-Guarantees**
- Recovery time may vary based on exchange API latency
- Email delivery may be delayed by email provider
- WebSocket clients that were disconnected during crash won't receive push (they'll see banner on reconnect)
---

## Time Synchronization and Drift Recovery

**Requirement**
System time must stay synchronized with Binance server time for correct candle alignment and order timing.

**Drift Detection**
- Query Binance server time on service startup
- Re-query every 60 seconds during normal operation
- Calculate drift: `drift_seconds = |local_time - binance_time|`

**Drift Thresholds**

**Threshold 1: 1-5 seconds (WARNING)**
- Log warning: `Time drift detected: {drift_seconds}s`
- Emit metric: `time_drift_seconds = {value}`
- Continue normal operation
- Alert ops team (Slack/PagerDuty)

**Threshold 2: > 5 seconds (CRITICAL)**
- Log critical error: `Dangerous time drift: {drift_seconds}s, activating kill switch`
- Trigger automatic kill switch (stop all strategies)
- Block new order submissions (API returns `HTTP 503`)
- Emit metric: `time_drift_critical = 1`
- Send notification to all users (see below)

**Automatic Recovery**

**Recovery Conditions**
System auto-recovers when drift corrects:
1. Drift < 1 second for 3 consecutive checks (3 minutes total)
2. No other active kill switch reasons

**Recovery Procedure**
```
Check 1 (60s): drift = 0.8s → Log "Time drift improving"
Check 2 (120s): drift = 0.7s → Log "Time drift stable"
Check 3 (180s): drift = 0.6s → Trigger recovery
```

On third consecutive check with drift < 1s:
1. Clear kill switch: `UPDATE system_config SET kill_switch_active = false`
2. Log: `Time drift resolved, system resuming normal operation`
3. Emit metric: `time_drift_critical = 0`
4. Run full reconciliation: `POST /internal/reconcile/force`
5. Send notification to users: "System time synchronized, trading may resume"

**Manual Recovery (If Drift Persists)**
If drift > 5s for > 15 minutes:
1. Ops team investigates NTP configuration
2. Manual server time correction
3. Manual kill switch clear: `POST /admin/kill-switch/clear`
4. Manual reconciliation: `POST /admin/reconcile/force`

**In-Flight Orders During Drift Detection**
- Orders submitted before drift exceeded 5s: Allowed to complete normally
- Orders in rate limit queue when drift detected:
  ```sql
  UPDATE orders
  SET status = 'REJECTED',
      rejection_reason = 'TIME_DRIFT_DETECTED',
      queued_at = NULL
  WHERE queued_at IS NOT NULL;
  ```

**User Notification**

**Email (sent when drift > 5s)**
```
Subject: Trading Stopped - System Time Issue

The trading platform detected significant time drift ([X] seconds difference from exchange server).

All trading has been stopped for safety.

Actions taken:
- All strategies stopped immediately
- New orders blocked
- Existing orders being cancelled

Expected resolution:
- Automatic: If time synchronizes within 3 minutes
- Manual: Ops team investigating (if drift persists > 15 min)

You will be notified when trading resumes.

Do NOT restart strategies until you receive confirmation.
```

**UI Banner**
```
⚠️ Time Synchronization Issue: Trading stopped due to time drift ([X]s). Automatic recovery in progress.
```

**Candle Timestamp Handling**
- Use exchange-provided timestamps for candle data
- Never generate timestamps locally
- Store all timestamps in UTC

**Guarantees**
- No trading during dangerous time drift (> 5s)
- Automatic recovery when drift corrects (< 3 min downtime for transient issues)
- Manual intervention available for persistent issues
- User always notified of time drift events

**Non-Guarantees**
- Cannot prevent drift from occurring (infrastructure issue)
- Brief unavailability (< 3 min) acceptable for correctness

**Monitoring**
- Alert if drift 1-5s (warning, investigate NTP)
- Alert if drift > 5s (critical, kill switch activated)
- Dashboard showing drift history (24h window)
---

## Backtest Determinism

**Guarantee**
Identical input → identical output for any backtest run.

**Enforcement Mechanisms**

**1. Candle Data Versioning**
- Each backtest records `candle_data_version` (hash of data set)
- Re-run must use same data version
- Data updates create new version

**2. Computation Parameters**
- All parameters stored in `backtest_runs` table:
  - Strategy configuration (JSON snapshot)
  - Initial balance
  - Date range
  - Timeframe
  - Fee model
- Parameters immutable after backtest starts

**3. Floating-Point Consistency**
- All calculations use IEEE 754 double precision
- No random rounding modes
- Intermediate results not truncated

**4. Random Seed Control**
- If strategy uses randomness (future feature): seed stored and reused
- MVP: No randomness in strategies

**5. Timezone Handling**
- All timestamps stored in UTC
- Candle alignment uses exchange timezone
- No local timezone dependencies

**Validation**
- Re-running backtest with same ID checks:
  - Candle data version matches
  - Parameters match
  - If mismatch: Reject with error

**Non-Determinism Sources (Explicitly Avoided)**
- ❌ Live exchange API calls during backtest
- ❌ System time dependencies
- ❌ Unversioned data
- ❌ Non-deterministic random generators
---
