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
## ADR Status
- Все ADR в статусе **ACCEPTED**
- Пересмотр возможен только через новый ADR

---
