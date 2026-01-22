
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

### 6. Backtest Service
**Responsibilities**
- Candle-based simulation
- Deterministic execution
- Strategy performance metrics

**Notes**
- No async execution in MVP
- Backtests are immutable once started

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
3. For each discrepancy:
   - Exchange shows FILLED but DB shows OPEN → emit FILLED event, update DB
   - Exchange shows CANCELED but DB shows OPEN → emit CANCELED event, update DB
   - Exchange shows PARTIALLY_FILLED → emit fill events for new fills
4. Log all reconciliation actions to audit table

**Conflict Resolution Rules**
- Exchange state is authoritative for order status and fills
- DB state is authoritative for intent (idempotency, original parameters)
- Never re-submit orders that exist on exchange
- If order missing from exchange and from DB → no action (outside window)

**Guarantees**
- Eventual consistency within 60 seconds
- No phantom orders
- No lost fills

## Crash Recovery Procedure

**Trigger**
- Execution Service restarts after crash or deployment

**Recovery Sequence**
1. **Mark service as RECOVERING**
   - Health check returns `503 Service Unavailable`
   - No new orders accepted

2. **Load in-flight orders from DB**
   - Query all orders in non-final states: SUBMITTED, OPEN, PARTIALLY_FILLED, CANCELING
   - Load last 24 hours only

3. **Run full reconciliation**
   - Query exchange for each in-flight order
   - Compare states
   - Emit events for any state changes

4. **Update order states**
   - Apply reconciliation results
   - Transition to final states where possible

5. **Mark service as HEALTHY**
   - Health check returns `200 OK`
   - Accept new orders

6. **Notify users**
   - Emit RECOVERY_COMPLETE event
   - Users must manually restart strategies (no auto-resume)

**Guarantees**
- No duplicate order submissions during recovery
- All order states reflect exchange truth before accepting new traffic
- Recovery completes within 30 seconds (typical) or 2 minutes (worst case)

**Strategy Behavior**
- All strategies remain STOPPED after recovery
- User must review state and manually restart if desired
- Prevents runaway trading after crash
---

## Time Synchronization

**Requirement**
System time must stay synchronized with exchange server time to ensure correct order timing and candle alignment.

**Implementation**
- Query exchange server time on service startup
- Calculate offset: `server_offset = exchange_time - local_time`
- Re-check offset every 60 seconds

**Drift Detection**
- If `|server_offset| > 1 second`: Log warning
- If `|server_offset| > 5 seconds`: Trigger alert, block new orders
- Drift > 5s indicates serious clock or network issue

**Candle Timestamp Handling**
- Use exchange-provided timestamps for candle data
- Never generate timestamps locally
- Store all timestamps in UTC

**Monitoring**
- Emit `time_drift_seconds` metric every 60s
- Alert if drift exceeds threshold

**Mitigation**
- Deploy servers with NTP configured
- Monitor system time drift in infrastructure
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
