# PRD.md

## Product Name
Web Trading Platform — MVP

## Document Purpose
Определить **продуктовые требования MVP**, критерии приёмки и границы ответственности,
чтобы:
- не раздувать scope,
- избежать опасных допущений,
- обеспечить предсказуемую разработку.

---

## Product Objective
Доставить стабильный web-продукт, позволяющий пользователю:
- настраивать автоматические торговые стратегии,
- проводить воспроизводимые бэктесты,
- безопасно запускать paper и live торговлю,
- контролировать риски и результаты.

---

## Target Audience
- Индивидуальные трейдеры
- Quant-энтузиасты
- Dev-ориентированные пользователи

---

## MVP Feature Set

### FR-1: Strategy Management

**Description**
Пользователь может создавать, редактировать и удалять стратегии.

**Supported Strategy Types**
- DCA
- Grid
- Rule-based Swing (DSL)

**Acceptance Criteria**
- Стратегия валидируется при сохранении
- Невалидная стратегия не может быть активирована
- Изменения стратегии не влияют на уже запущенные execution

---

### FR-2: Backtesting

**Description**
Пользователь может запускать бэктест стратегии на исторических данных.

**Scope**
- Candle-based data
- Single symbol per backtest
- Fixed initial balance

**Acceptance Criteria**
- Backtest детерминирован
- Результаты неизменяемы после завершения
- Повторный запуск с теми же параметрами даёт идентичный результат

---

### FR-3: Paper Trading

**Description**
Стратегия может быть запущена в режиме paper trading.

**Acceptance Criteria**
- Используется тот же execution pipeline, что и live
- Отличие только в exchange adapter
- Результаты отображаются в портфеле

---

### FR-4: Live Trading

**Description**
Пользователь может запустить стратегию в live режиме.

**Preconditions**
- Стратегия была успешно протестирована в paper mode
- Заданы риск-лимиты

**Acceptance Criteria**
- Все ордера проходят через Risk Service
- Все ордера имеют полный жизненный цикл
- Пользователь может остановить торговлю в любой момент

---

### FR-5: Order Execution

**Description**
Система корректно размещает и отслеживает ордера.

**Supported Orders**
- Market
- Limit
- Stop Loss
- Take Profit

**Acceptance Criteria**
- Нет дублирования ордеров
- Partial fills корректно учитываются
- Order state machine полностью отслеживаем

---

## Partial Fill Handling (FR-5 Addendum)

**Definition**
Partial fill occurs when LIMIT order executes only part of requested quantity.

**Behavior**
- Each fill creates an event in `order_events` table
- Order state transitions to `PARTIALLY_FILLED`
- Remaining quantity stays open on exchange

**Strategy Notification**
- Strategy receives partial fill notification via event stream
- Notification latency: < 1 second (p95)
- Strategy can:
  - Wait for full fill
  - Cancel remaining quantity
  - Adjust position based on partial fill

**Risk Service Handling**
- Position size updated immediately after each fill
- Risk limits recalculated using filled quantity
- Subsequent orders use updated position for limit checks

**LIMIT Order Lifecycle**
- Partial fills do not auto-cancel remaining quantity
- Order remains OPEN until:
  - Fully filled
  - User cancels
  - Time-in-force expires (if specified)
- Default: No time-in-force (Good-Till-Cancel)

**Portfolio Impact**
- PnL calculated on filled quantity only
- Unrealized PnL includes filled positions
- Open order value shown separately

**Acceptance Criteria**
- Partial fill processed within 1 second
- No "lost" fills
- Position and risk limits stay consistent
- User sees clear distinction between filled and open quantity
---

### FR-6: Portfolio & PnL

**Description**
Пользователь видит текущее состояние портфеля.

**Metrics**
- Баланс
- Позиции
- Realized PnL
- Unrealized PnL

**Acceptance Criteria**
- Данные согласованы с execution
- PnL пересчитывается корректно при каждом fill

---

### FR-7: Alerts & Notifications

**Description**
Пользователь получает уведомления о ключевых событиях.

**Supported Events**
- Order filled
- Strategy stopped
- Risk limit exceeded

**Channels**
- Web
- Email

---

### FR-8: Kill Switch

**Description**
Система предоставляет механизм экстренной остановки торговли.

**Types**
- Manual (user-triggered)
- Automatic (risk-triggered)

**Acceptance Criteria**
- Все активные стратегии останавливаются
- Новые ордера не отправляются
- Текущие ордера отменяются при возможности

---

## Non-Functional Requirements

### NFR-1: Reliability
- No lost or duplicated orders
- Recovery after restart without data loss

### NFR-2: Performance
- p95 internal processing latency < 150 ms
- Backtests complete within reasonable time for candle data

### NFR-3: Security
- Exchange keys encrypted at rest
- No key exposure outside Execution Service

### NFR-4: Observability
- Full audit trail of trading actions
- Structured logs for execution flow

---

## Out of Scope (MVP)
- Mobile apps
- Multi-exchange
- Futures / margin / options
- ML / RL / sentiment
- Strategy marketplace
- Social / copy trading

---

## Risks & Mitigations

| Risk | Mitigation |
|----|----|
| Exchange API instability | Retry + reconcile |
| User misconfiguration | Validation + paper trading |
| Execution bugs | Idempotency + state machine |
| Financial loss | Risk limits + kill switch |

---

## KPIs (MVP)
- Backtest success rate
- Order execution success rate
- Zero duplicated orders
- User retention (qualitative)

---

## Dependencies
- Stable exchange API
- Reliable historical candle data
- Secure secret management

---

## Definition of Done (MVP)

MVP считается готовым, если:
- Пользователь может пройти путь:
  create strategy → backtest → paper trade → live trade → stop
- Система восстанавливается после рестарта
- Все ордера имеют полный аудит
- Нет критических финансовых багов

---

## Strategy Lifecycle & Modification Rules (FR-1 Addendum)

**Strategy States**
- `DRAFT`: Being edited
- `ACTIVE_PAPER`: Running in paper trading
- `ACTIVE_LIVE`: Running in live trading
- `STOPPED`: Not running

**Modification Rules**

**DRAFT Strategies**
- Can be edited freely
- Can be deleted

**ACTIVE Strategies (PAPER or LIVE)**
- **Cannot be edited** while running
- **Cannot be deleted** while running
- User must STOP strategy first

**Enforcement**
- API returns `HTTP 409 Conflict` if edit/delete attempted on ACTIVE strategy
- Error message: "Strategy must be stopped before modification"

**Configuration Snapshot**
- When strategy starts (paper or live):
  - Full configuration saved as immutable snapshot
  - Snapshot ID stored with strategy execution
  - All orders reference snapshot ID
- Running strategy uses snapshot, not current config
- Ensures deterministic behavior during execution

---
