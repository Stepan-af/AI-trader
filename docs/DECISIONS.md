# DECISIONS.md

## Purpose
Зафиксировать ключевые архитектурные и продуктовые решения для MVP,
их причины и последствия.

Документ используется как **ADR-lite** и обновляется при значимых изменениях.

---

## ADR-001: Web-only MVP

**Decision**
MVP реализуется **только как web-приложение (desktop)**.

**Reasoning**
- Быстрее доставка ценности
- Проще поддержка и тестирование
- Фокус на core-домене (execution, risk, backtest)

**Consequences**
- Нет mobile SDK и mobile UX
- Web UI должен быть адаптивным
- Mobile может быть добавлен позже без изменения backend API

---

## ADR-002: No HFT in MVP

**Decision**
MVP **не является HFT-системой** и не использует tick-level или order-book стратегии.

**Reasoning**
- HFT требует другой инфраструктуры (latency, co-location, runtime)
- Высокий риск финансовых потерь из-за багов
- MVP фокусируется на correctness, а не микрооптимизациях

**Consequences**
- Candle-based стратегии (1s–1h)
- Latency метрики применимы только к внутренней обработке
- Возможность low-latency execution остаётся как future extension

---

## ADR-003: Limited Strategy Set in MVP

**Decision**
В MVP поддерживается **ограниченный набор стратегий**:
- DCA
- Grid
- Rule-based Swing (DSL)

**Reasoning**
- Эти стратегии покрывают разные стили торговли
- Они не требуют сложной микроструктуры рынка
- Позволяют проверить execution, risk и portfolio домены

**Consequences**
- Нет arbitrage, market making, options
- Стратегии расширяются итеративно без изменения execution core

---

## ADR-004: Single Exchange (Binance Spot)

**Decision**
В MVP используется **одна биржа — Binance Spot**.

**Reasoning**
- Минимизация интеграционных рисков
- Самая ликвидная и документированная биржа
- Упрощение reconcile и тестирования

**Consequences**
- Архитектура предусматривает exchange adapters
- Multi-exchange добавляется позже без изменения домена

---

## ADR-005: PostgreSQL + TimescaleDB (Single Cluster)

**Decision**
Используется **один PostgreSQL кластер с TimescaleDB**.

**Reasoning**
- Strong consistency
- Упрощение операций и бэкапов
- Candle и time-series данные ложатся естественно

**Consequences**
- Нет InfluxDB в MVP
- Все критичные состояния хранятся в Postgres

---

## ADR-006: Redis for Jobs and Cache

**Decision**
Redis используется для:
- job queues (BullMQ)
- временного кэша
- rate limiting

**Reasoning**
- Node-native экосистема
- Минимальный operational overhead
- Redis не используется как источник истины

**Consequences**
- Потеря Redis не приводит к потере состояния
- Все важные данные всегда в Postgres

---

## ADR-007: Execution Service Owns Trading Keys

**Decision**
Только **Execution Service** имеет доступ к расшифрованным API-ключам биржи.

**Reasoning**
- Минимизация blast radius
- Чёткая зона ответственности
- Упрощение аудита безопасности

**Consequences**
- Strategy и UI не знают ничего о ключах
- Execution Service — самый защищённый компонент

---

## ADR-008: Idempotent Write Operations

**Decision**
Все write-операции (orders, backtests, rebalances) **идемпотентны**.

**Reasoning**
- Сети и биржи ненадёжны
- Повторы запросов — норма
- Идемпотентность критична для финансовых операций

**Consequences**
- `Idempotency-Key` обязателен
- Повторы не создают побочных эффектов

---

## ADR-009: Event-Based Order Lifecycle

**Decision**
Состояние ордеров хранится как **последовательность событий**.

**Reasoning**
- Полный аудит
- Воспроизводимость
- Упрощение reconcile

**Consequences**
- Таблица `order_events` обязательна
- Никаких “молчаливых” обновлений

---

## ADR-010: Paper Trading Before Live

**Decision**
Любая стратегия должна быть протестирована в **paper mode** перед live.

**Reasoning**
- Снижение риска
- Раннее выявление ошибок
- Обучение пользователя

**Consequences**
- Paper и Live используют один execution pipeline
- Отличие только в exchange adapter

---

## ADR-011: Explicit Kill Switch

**Decision**
В системе присутствует **manual и automatic kill switch**.

**Reasoning**
- Финансовая безопасность
- Быстрое реагирование на аномалии
- Требование production trading систем

**Consequences**
- Любой пользователь может остановить торговлю
- System-wide stop при критических ошибках

---

## ADR-012: Fail-Closed Risk Service

**Status**: ACCEPTED

**Decision**
When Risk Service is unavailable, Execution Service **rejects all new orders** (fail-closed).

**Context**
Risk Service validates every order against position limits, exposure limits, and daily loss limits. If Risk Service is down, we must choose:
- Fail-open: Allow orders (risk of limit violations)
- Fail-closed: Reject orders (risk of missed opportunities)

**Reasoning**
- Financial safety > availability
- Better to miss a trade than violate risk limits
- Risk Service downtime should be rare (< 0.1%)
- Users expect risk controls to be mandatory

**Implementation**
- Execution Service checks Risk Service before every order
- If Risk Service unreachable:
  - Return `HTTP 503 Service Unavailable`
  - Log error
  - Increment downtime counter
- Execution Service maintains 10-second cache of recent risk approvals as soft fallback
  - If order is identical to one approved < 10s ago, use cached result
  - Cache hit rate expected ~30% during normal operation

**Automatic Kill Switch**
- If Risk Service down > 30 seconds continuously:
  - Trigger automatic kill switch
  - Stop all strategies
  - Notify all users
- Manual intervention required to restart

**Consequences**
- Risk Service requires high availability (target: 99.9%)
- Monitoring and alerting critical for Risk Service
- Cached approvals reduce impact of brief network glitches
- Users may experience brief order rejection during Risk Service restarts

**Alternatives Considered**
- Fail-open: Rejected due to financial risk
- Longer cache TTL: Rejected due to stale limit checks
---

## ADR-013: Paper Trading Fill Simulation

**Status**: ACCEPTED

**Decision**
Paper trading uses **candle-based fill simulation** with conservative slippage assumptions.

**Context**
Paper trading must simulate order fills without real exchange execution. Goal is to validate strategy logic, not predict exact live performance.

**Fill Simulation Rules**

**MARKET Orders**
- Fill price: Current candle close price
- Slippage: 0.05% (5 basis points) in unfavorable direction
  - BUY: close × 1.0005
  - SELL: close × 0.9995
- Fill timing: Immediate (next candle)

**LIMIT Orders**
- Fill condition: Candle high/low crosses limit price
  - BUY LIMIT @ $100: Fills if candle low ≤ $100
  - SELL LIMIT @ $100: Fills if candle high ≥ $100
- Fill price: Limit price (no slippage for limit orders)
- Fill timing: During candle when condition met

**STOP Orders**
- Fill condition: Candle high/low crosses stop price
- Converts to market order when triggered
- Slippage: Same as market orders (0.05%)

**Limitations**
- No order book depth simulation
- No partial fills (orders fill completely or not at all)
- Slippage is fixed, not dynamic
- No liquidity constraints

**User Warning**
UI must display prominent notice:
> "Paper trading results are optimistic. Live trading will experience higher slippage, partial fills, and occasional order rejections."

**Reasoning**
- Candle-based is simple and deterministic
- 0.05% slippage is conservative for Binance spot (typical: 0.01-0.03%)
- Users understand this is simulation, not prediction

**Consequences**
- Paper results will be more favorable than live
- Strategy logic can be tested, but not performance optimized
- Future: Add configurable slippage models

**Alternatives Considered**
- Tick-level simulation: Too complex for MVP
- Zero slippage: Too optimistic, creates false confidence
- Order book replay: Requires historical depth data (not available)

---

## ADR-014: Portfolio Service Staleness Transparency

**Status**: ACCEPTED

**Decision**
Portfolio Service responses **always include data freshness timestamp** and **never hide staleness**.

**Context**
Portfolio Service uses eventual consistency with < 1 second target. Under load or during reconciliation, data may lag.

**Implementation**
- All `/portfolio/*` endpoints include:
  - `data_as_of_timestamp`: ISO 8601 timestamp of last update
  - `is_stale`: boolean (true if lag > 5 seconds)
- UI displays: "Portfolio as of [timestamp]" next to all PnL values
- If `is_stale: true`, UI shows warning icon + tooltip "Data may be delayed"

**Reasoning**
- Financial data must never misrepresent accuracy
- Users can make informed decisions with staleness info
- Prevents panic actions based on outdated data
- Builds trust through transparency

**Consequences**
- Slightly more complex UI implementation
- Users become aware of system limitations (good)
- No hidden surprises during production use
- May receive user questions during high load events

**Alternatives Considered**
- Hide staleness: Rejected (dangerous for financial decisions)
- Block requests until fresh data: Rejected (causes cascading delays)
- Show spinner/loading state: Rejected (blocks UI, creates poor UX)

---

## ADR-015: Fail-Fast Event Processing with Dead Letter Queue

**Status**: ACCEPTED

**Decision**
Event processing uses **fail-fast with dead letter queue** for unrecoverable errors.

**Context**
Events (fills, order updates, reconciliation) must be processed reliably. Retries help with transient failures, but poison messages must be isolated to prevent infinite loops.

**Implementation**
- Max retries: 3 attempts with exponential backoff (1s, 2s, 4s)
- After 3 failures: Move event to dead letter queue (DLQ)
- DLQ stored in database table: `event_dead_letter_queue`
- DLQ monitored via alerting (ops team notified)
- Manual replay from DLQ after root cause fixed

**DLQ Schema**
```sql
CREATE TABLE event_dead_letter_queue (
  id UUID PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  event_payload JSONB NOT NULL,
  original_timestamp TIMESTAMPTZ NOT NULL,
  failure_reason TEXT NOT NULL,
  retry_count INTEGER NOT NULL,
  moved_to_dlq_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Reasoning**
- Prevents infinite retry loops that waste resources
- Isolates bad data from healthy event processing
- Allows ops team to investigate failures without blocking system
- Better than silent event loss (all events traceable)

**Consequences**
- Requires DLQ infrastructure (database table + monitoring)
- Manual intervention needed for DLQ events (ops overhead)
- Events in DLQ are delayed until manually replayed
- Better operational visibility into processing failures

**Monitoring**
- Alert if DLQ size > 0 (any event failed 3 times)
- Dashboard showing DLQ count and event types
- Weekly DLQ review process (manual)

**Alternatives Considered**
- Infinite retries: Rejected (can cause resource exhaustion)
- Drop failed events: Rejected (silent data loss unacceptable for financial system)
- Longer retry attempts (> 3): Rejected (delays detection of systematic issues)

---

## ADR-016: Global Rate Limiter for Exchange API

**Status**: ACCEPTED

**Decision**
Implement **global token bucket rate limiter** in Exchange Adapter to prevent hitting Binance API limits.

**Context**
- Binance enforces: 50 orders per 10 seconds per API key
- Multiple strategies submitting orders simultaneously can exceed limits
- Rate limit violations result in order rejections and potential IP bans

**Implementation**
- Algorithm: Token bucket
- Capacity: 50 tokens
- Refill rate: 5 tokens per second
- Queue: In-memory FIFO, max 100 orders, max wait 30 seconds
- If queue full: Return HTTP 429 to caller
- Retry logic: Exponential backoff (1s, 2s, 4s)

**Reasoning**
- Prevents hitting exchange limits (protects API key and IP)
- Queuing is fairer than immediate rejection
- Token bucket is simple and proven
- In-memory queue acceptable for MVP (single instance)

**Consequences**
- Order submission may be delayed during high load (queued)
- Users see explicit rate limit errors when queue full
- Single Execution Service instance limitation (queue not distributed)
- Post-MVP: Needs distributed rate limiter (Redis-based) for multi-instance

**Trade-offs**
- Queueing adds latency (acceptable for MVP, not HFT)
- Queue size limit (100) may be too small for extreme bursts (can tune)
- In-memory queue lost on restart (acceptable, orders persist in DB)

**Alternatives Considered**
- Per-strategy rate limits: Too complex for MVP
- Reject immediately without queue: Too harsh for users
- Unlimited queue: Risk of memory overflow

---

## ADR-018: Position Version-Based Optimistic Locking

**Status**: ACCEPTED

**Date**: 2026-01-22

**Decision**
Portfolio Service assigns monotonic version numbers to positions.
Risk Service validation requires version match to prevent stale position reads.

**Context**
Risk Service cache key includes position snapshot, but position can change between:
1. Execution Service queries position
2. Execution Service calls Risk Service
3. Risk Service validates limits

This race condition can violate risk limits during concurrent trading.

**Reasoning**
- Optimistic locking prevents race condition without distributed locks
- Version mismatch is rare (< 1% of requests under normal load)
- Failed validations auto-retry with fresh data (< 100ms delay)
- No performance bottleneck from lock contention
- Simpler than pessimistic locking or row-level locks

**Implementation**
- `positions.version` column (BIGINT, incremented on every update)
- Risk Service compares request version vs. current version
- `409 Conflict` triggers automatic retry in Execution Service
- Cache key includes version → automatic invalidation

**Consequences**
- Portfolio Service must maintain version counter (simple)
- Risk Service validation includes version check (5ms overhead)
- Execution Service must handle 409 and retry (added complexity)
- Order submission may take 50-150ms longer during retries (acceptable)

**Alternatives Considered**
- Accept eventual consistency: Rejected (financial risk too high)
- Pessimistic locking: Rejected (lock contention bottleneck)
- Longer cache TTL: Rejected (doesn't solve root cause)

---

## ADR-019: Persistent Rate Limit Queue

**Status**: ACCEPTED

**Date**: 2026-01-22

**Decision**
Rate limit queue state persisted to database via `orders.queued_at` timestamp.

**Context**
In-memory queue lost on Execution Service crash/restart.
Orders in queue remain in SUBMITTED state indefinitely → bad UX and unclear state.

**Reasoning**
- Silent order loss is unacceptable for financial system
- Database persistence ensures audit trail
- Recovery logic is simple (query + re-queue)
- Performance impact negligible at MVP scale
- 5-minute timeout prevents infinite queueing

**Implementation**
- `orders.queued_at` column (TIMESTAMPTZ, nullable)
- Set on queue entry, cleared on submission
- Startup queries non-null values and re-queues
- Orders queued > 5 minutes marked REJECTED

**Consequences**
- 2 extra database writes per queued order
- Simpler crash recovery (deterministic)
- Clear audit trail of queue delays
- Explicit timeout prevents stuck orders

**Trade-offs**
- Database writes add latency (~10ms per order)
- Acceptable for MVP (not HFT system)
- Post-MVP: Move to Redis for horizontal scaling

**Alternatives Considered**
- Accept order loss: Rejected (silent failure unacceptable)
- Redis queue: Deferred to post-MVP (added complexity)
- Infinite queueing: Rejected (stuck orders possible)

---

## ADR-020: Exchange API Circuit Breaker

**Status**: ACCEPTED

**Date**: 2026-01-22

**Decision**
Implement circuit breaker pattern for all Exchange API calls.

**Context**
Exchange APIs are unreliable (outages, rate limits, degraded performance).
Without circuit breaker:
- Slow timeouts accumulate (10s each)
- Resource exhaustion (connection pool, memory)
- Cascading failures to dependent services

**Reasoning**
- Circuit breaker fails fast (< 100ms vs. 10s timeout)
- Prevents resource exhaustion during exchange outages
- Automatic recovery testing (every 30s)
- Standard pattern for resilient distributed systems

**Implementation**
- Three states: CLOSED → OPEN → HALF_OPEN
- Failure threshold: 50% over 60-second window (min 10 requests)
- OPEN state duration: 30 seconds
- Recovery test: 3 successful requests to close circuit

**Consequences**
- Orders rejected immediately when exchange down (better UX than timeout)
- User sees explicit "Exchange unavailable" error
- Automatic recovery (no manual intervention)
- Additional code complexity (acceptable, well-known pattern)

**Alternatives Considered**
- No circuit breaker: Rejected (cascading failures risk)
- Manual disable/enable: Rejected (requires ops intervention)
- Longer wait time: Rejected (30s balances fast recovery vs. hammering exchange)

---

## ADR-017: Automatic WebSocket Reconnection with Gap Recovery

**Status**: ACCEPTED

**Decision**
WebSocket connections to Binance **automatically reconnect** with **event gap recovery** on every reconnect.

**Context**
- Binance WebSocket provides real-time order and fill updates
- WebSockets are inherently unreliable (network issues, server restarts)
- Missing events during disconnect can cause position/PnL inconsistencies

**Implementation**

**Reconnection Strategy (Updated with Jitter)**
- Exponential backoff base: 1s, 2s, 4s, 8s, 16s, 32s (max)
- **Jitter**: ±20% random variance added to each interval
  - Formula: `actual_delay = base_delay × (0.8 + random() × 0.4)`
  - Example: 2s base → actual delay 1.6s - 2.4s
- Prevents thundering herd when exchange restarts
- Max reconnection attempts: Unlimited (keep trying)
- Get new listenKey on each reconnect attempt

**Why Jitter?**
- Exchange restarts affect all clients simultaneously
- Without jitter: All clients reconnect at exactly 1s, 2s, 4s, etc.
- With jitter: Reconnections spread over time window
- Reduces load spike on exchange API during mass reconnection
- Standard practice for distributed systems resilience

**Gap Recovery Procedure (On Reconnect)**
1. Query REST API for all non-final orders
2. Compare exchange state vs. database state
3. Emit events for any state changes or new fills
4. Resume normal WebSocket processing

**Reasoning**
- Automatic recovery reduces operational overhead (no manual intervention)
- Gap recovery ensures no missed events (fills always captured)
- Reconciliation (every 60s) provides fallback (defense in depth)
- REST API query on reconnect is faster than waiting for next reconciliation

**Consequences**
- Short delay (< 10s typically) in event updates during disconnect
- Portfolio may show `is_stale: true` during disconnect
- REST API query on reconnect adds latency and API call overhead
- Users see "Connection issue" warning during disconnect

**Graceful Degradation**
- If WebSocket fails to reconnect > 5 minutes:
  - Continue operating on REST polling (60s reconciliation)
  - No kill switch (system still functional)
  - Notify users: "Real-time updates unavailable"

**Monitoring**
- Alert if disconnect duration > 30 seconds (warning)
- Alert if disconnect duration > 2 minutes (critical)
- Alert if reconnection failures > 5 consecutive (critical)

**Alternatives Considered**
- Manual reconnection: Rejected (requires ops intervention)
- No gap recovery: Rejected (risk of missed fills)
- Trigger kill switch on disconnect: Rejected (too aggressive, WebSocket issues are common)

---

## ADR-021: Strict Outbox Pattern for Cross-Schema Events

**Status**: ACCEPTED

**Date**: 2026-01-22

**Decision**
Portfolio updates use **transactional outbox pattern** with separate transaction scopes per service. No cross-schema writes within single transaction.

**Context**
Initial architecture showed single transaction spanning `execution` and `portfolio` schemas, violating stated "no cross-schema transactions" principle. Need to reconcile actual implementation with architectural constraints.

**Reasoning**
- Each service owns its schema exclusively (clear boundaries)
- Outbox pattern is proven for event-driven systems
- Eventual consistency acceptable for portfolio updates (< 1s p95)
- Enables future migration to separate databases without rewrite
- Simpler than distributed transactions (no 2PC complexity)

**Implementation**
- Fill processing writes to `execution.fills` + `execution.portfolio_events_outbox` (atomic)
- Background worker polls outbox every 500ms
- Worker updates `portfolio.positions` in separate transaction
- Worker marks outbox event processed after successful position update

**Consistency Guarantees**
- p95: < 1 second fill → position update
- p99: < 3 seconds
- Maximum: < 60 seconds (reconciliation fallback kicks in)
- Alert if gap > 5 seconds, kill switch if gap > 60 seconds

**Consequences**
- Portfolio data eventually consistent (not immediately)
- Users see staleness indicator when lag > 5 seconds
- Outbox worker is critical path for position updates
- Dead letter queue handles poison messages (prevent queue blocking)

**Alternatives Considered**
- Cross-schema transaction: Rejected (violates service boundaries)
- Synchronous HTTP call: Rejected (coupling, availability issues)
- Message broker (Kafka/RabbitMQ): Deferred to post-MVP (added complexity)

---

## ADR-022: Priority-Based Reconciliation Rules

**Status**: ACCEPTED

**Date**: 2026-01-22

**Decision**
Reconciliation applies **priority order** when resolving conflicts: (1) User intent, (2) Exchange final states, (3) Retry lost submissions.

**Context**
Initial reconciliation logic could overwrite user-initiated cancellations if exchange hadn't processed them yet. Need explicit priority rules to prevent silent overrides.

**Priority Order**
1. **User actions (CANCELING state)**: Re-submit cancel, wait 10s, fail loudly if not honored
2. **Exchange final states (FILLED/CANCELED/REJECTED)**: Always trust exchange for facts
3. **Lost orders (in DB, not on exchange)**: Resubmit if < 5min old, reject if older
4. **Stuck SUBMITTED (> 60s)**: Query exchange, update or reject
5. **Fill differences**: Emit missing events, alert on impossible states

**Reasoning**
- User intent must never be silently ignored (trust violation)
- Exchange is source of truth for what actually happened
- Clear rules prevent ambiguous conflict resolution
- Explicit alerts for data integrity violations (never auto-correct suspicious states)

**Consequences**
- User cancel requests always retried (may add latency)
- Reconciliation logs show priority rule application
- Critical alerts triggered for data inconsistencies (manual review required)

**Alternatives Considered**
- Exchange always wins: Rejected (ignores user intent)
- Last-write-wins: Rejected (no semantic meaning in distributed system)
- Manual conflict resolution: Rejected (not scalable for MVP)

---

## ADR-023: Kill Switch Clearing Preconditions

**Status**: ACCEPTED

**Date**: 2026-01-22

**Decision**
Kill switch can only be cleared when **all preconditions met**: reconciliation complete, zero POTENTIALLY_EXECUTED orders, all services healthy, clock synchronized.

**Context**
Initial spec allowed admin to clear kill switch manually without checks. Risk of resuming trading while system still unstable or orders unreconciled.

**Preconditions (All Required)**
1. All reconciliation cycles completed
2. Zero orders in POTENTIALLY_EXECUTED state
3. Risk Service passing health checks (last 5 consecutive)
4. WebSocket connected and receiving events
5. No CRITICAL severity alerts active
6. Time drift < 1 second

**Reasoning**
- Prevents resuming trading with unresolved order states
- Ensures all dependent services actually healthy (not just "up")
- Time sync critical for correct order timing and candle alignment
- Explicit checks better than implicit assumptions

**Implementation**
- API returns 409 Conflict with specific failed checks
- Admin UI shows real-time precondition status (auto-refresh every 60s)
- Manual override NOT provided (fail-safe design)

**Consequences**
- May delay trading resumption (acceptable for safety)
- Admin cannot bypass checks (could frustrate in false-positive scenarios)
- Increases confidence in system health when cleared

**Alternatives Considered**
- Immediate manual clear: Rejected (too risky)
- Admin override flag: Rejected (defeats purpose of safety checks)
- Automatic clear on health: Considered for future, deferred (want human verification in MVP)

---

## ADR-024: Strategy Deletion Requires Zero Exposure

**Status**: ACCEPTED

**Date**: 2026-01-22

**Decision**
Strategies can only be deleted when they have **zero open orders AND zero positions**.

**Context**
Initial spec allowed deletion of STOPPED/ERROR strategies without checking market exposure. Risk of users accidentally deleting strategies while still holding positions.

**Deletion Preconditions**
- `COUNT(*) = 0 WHERE strategy_id = ? AND status IN ('OPEN', 'PARTIALLY_FILLED')`
- `COUNT(*) = 0 WHERE strategy_id = ? AND ABS(quantity) > 0`

**Reasoning**
- Prevents accidental deletion of strategies with active market exposure
- Forces deliberate position closing (user must explicitly decide to exit)
- Protects against financial loss from forgotten positions
- Aligns with "explicit > implicit" principle

**Implementation**
- API returns 409 Conflict with list of open orders and positions
- UI shows error: "Close positions and cancel orders before deleting"
- No override option (hard constraint)

**Consequences**
- Extra step required before deletion (acceptable safety tax)
- User must manually close positions (deliberate action)
- Cannot quickly delete failed strategies with lingering exposure

**Alternatives Considered**
- Auto-close positions on delete: Rejected (implicit action, could exit profitable position)
- Warning with confirm: Rejected (users click through warnings)
- Admin-only override: Rejected (admin shouldn't bypass user safety)

---

## ADR-025: Maximum Portfolio Update Latency Bounds

**Status**: ACCEPTED

**Date**: 2026-01-22

**Decision**
Portfolio updates guaranteed within **p95: 1s, p99: 3s, max: 60s** with explicit kill switch at 60s threshold.

**Context**
Initial spec stated "< 1 second p95" without defining p99, max, or failure behavior. Need explicit SLOs for monitoring and incident response.

**SLO Definition**
- p50: < 500ms (normal path)
- p95: < 1 second (target)
- p99: < 3 seconds (acceptable degradation)
- Max: < 60 seconds (hard limit, triggers kill switch)

**Breach Handling**
- Gap > 5 seconds: Log warning, emit metric
- Gap > 10 seconds: Alert ops team (investigate outbox worker)
- Gap > 60 seconds: Activate automatic kill switch (data loss risk)

**Reasoning**
- Explicit bounds enable monitoring and alerting
- 60-second kill switch prevents trading with stale position data (risk violation)
- Three tiers (p95/p99/max) allow graceful degradation visibility
- Kill switch at max ensures safety net

**Consequences**
- Outbox worker must be monitored for latency
- Automatic kill switch could trigger during flash crashes (acceptable)
- Users see explicit staleness indicators (transparency)

**Alternatives Considered**
- No maximum bound: Rejected (unbounded latency risk for financial system)
- Synchronous updates: Rejected (violates eventual consistency model)
- Longer max (5 minutes): Rejected (too long for risk data staleness)

---
