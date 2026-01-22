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

**Fill Event Deduplication**
- Каждый fill имеет уникальный `exchange_fill_id` от Binance
- Система гарантирует, что каждый `exchange_fill_id` обрабатывается ровно один раз
- Дублирующие события (от websocket + reconciliation) автоматически отбрасываются

**Implementation Guarantee**
- Database UNIQUE constraint на `fills.exchange_fill_id`
- Попытки дублирования завершаются gracefully (логируются, но не повторяются)
- Безопасно повторять обработку событий

**User-Visible Guarantees**
- Нет двойного учёта fills
- Нет завышенного PnL из-за дубликатов
- Все fills отражаются в портфеле корректно

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

**Data Freshness**
- Все portfolio API responses включают:
  - `data_as_of_timestamp`: Временная метка последнего обновления
  - `is_stale`: boolean флаг (true если данные устарели > 5 секунд)
- UI отображает "Portfolio as of [HH:MM:SS]" рядом со всеми PnL значениями
- Если `is_stale: true`: UI показывает предупреждающую иконку с tooltip "Data may be delayed"

**Consistency Guarantee**
- Eventual consistency с целевой задержкой < 1 секунда (p95)
- При высокой нагрузке задержка может увеличиваться, но всегда видна пользователю
- Staleness никогда не скрывается от пользователя

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

### FR-8: Kill Switch (Updated)

**Description**
System provides manual and automatic emergency stop mechanism.

**Types**
- Manual: User-triggered via UI button
- Automatic: Triggered by system conditions (Risk Service down, time drift, critical alert)

**Acceptance Criteria (Updated)**
- All active strategies stopped within 1 second
- New order submissions rejected immediately (HTTP 503)
- All OPEN and PARTIALLY_FILLED orders cancellation attempted within 2 minutes
- **Cancellation Success Rate**: At least 90% successfully cancelled
- Orders in SUBMITTED state:
  - Wait 10 seconds for exchange acknowledgment
  - If acknowledged: Cancel normally
  - If still SUBMITTED: Mark as POTENTIALLY_EXECUTED, reconcile within 60s
- User notified via email + UI banner + WebSocket
- User receives explicit warning about potentially executing orders

**Cancellation Success Rate (Best-Effort Definition)**
- Target: 90% of OPEN/PARTIALLY_FILLED orders successfully cancelled within 2 minutes
- Measurement: `(successfully_cancelled / total_open_orders) × 100`
- Success = Exchange confirms cancellation (REST response or WebSocket event)
- Failure = Timeout (> 10s per order) or exchange error

**If Success Rate < 90%**
- Log critical alert: "Kill switch cancellation below target: X% (Y/Z orders)"
- Notify ops team via monitoring system
- Continue with reconciliation for remaining orders

**User Notification Format**
Email and UI must show exact counts:
```
Emergency Stop Complete

✓ Successfully cancelled: X orders
⏳ Pending confirmation: Y orders (will be reconciled within 60s)
⚠️  May have executed: Z orders (exchange timeout)

Total orders affected: X+Y+Z
```

**User Expectations (Explicit)**
- Kill switch is emergency brake, NOT atomic transaction rollback
- Some orders may execute during stop window (rare, < 5% of cases)
- SUBMITTED orders may execute on exchange (race condition accepted)
- System prevents NEW trading immediately, stops ACTIVE trading best-effort
- Full reconciliation completes within 60 seconds

**POTENTIALLY_EXECUTED State**
- New order state for SUBMITTED orders during kill switch
- Indicates: Order may execute on exchange, pending confirmation
- User notification includes count and warning
- Reconciliation determines final state (FILLED / CANCELED / REJECTED)

**Recovery (Q10: Kill Switch Clear Preconditions)**
- Manual only (no automatic restart)
- Admin endpoint: `POST /admin/kill-switch/clear`

**Clearing Preconditions (Enforced by API)**
1. All reconciliation cycles completed (no jobs in queue)
2. **Zero orders in POTENTIALLY_EXECUTED state** (all resolved)
3. Risk Service healthy (last 5 health checks passed)
4. WebSocket connection established and receiving events
5. No active alerts of severity CRITICAL
6. Time drift < 1 second (clock synchronized)

**Clear Request**
```json
{
  "confirmed": true,
  "admin_notes": "All systems verified healthy after incident resolution"
}
```

**Response (Preconditions Not Met)**
```json
HTTP 409 Conflict
{
  "error": "PRECONDITIONS_NOT_MET",
  "message": "Cannot clear kill switch: system not ready",
  "failed_checks": [
    "reconciliation_in_progress",
    "potentially_executed_orders_exist: 3"
  ]
}
```

**User Action After Clear**
- Users manually restart strategies after verifying system health
- No automatic strategy restarts (explicit user action required)

**User Notification for Kill Switch (Q8, Q9: POTENTIALLY_EXECUTED Handling)**

**Email Template (Sent Immediately)**
```
Subject: Emergency Stop Activated - All Trading Stopped

All trading has been stopped due to: {reason}

--- Orders Affected ---

✓ Successfully cancelled: X orders
⏳ Pending confirmation: Y orders (will be confirmed within 60s)
⚠️  May have executed: Z orders (exchange timeout - see below)

Total: X+Y+Z orders

--- What To Do Now ---

1. DO NOT restart strategies yet
2. Wait 2 minutes for reconciliation to complete
3. Check your portfolio: [Portfolio Link]
4. Review positions - some orders may have filled
5. You will receive follow-up email when reconciliation complete

--- About "May Have Executed" Orders (Z orders) ---

These orders were submitted to exchange but timed out during emergency stop.

What happens next (automatic):
- System queries exchange every 60 seconds
- Updates order status based on exchange reality
- Updates your positions if any orders filled
- Sends follow-up email with final status

Expected time: < 60 seconds

--- IMPORTANT ---
Do NOT restart trading until you receive "Reconciliation Complete" email.
```

**Follow-Up Email (Q8: After Reconciliation Complete)**
```
Subject: Emergency Stop Reconciliation Complete

Reconciliation finished for {count} potentially executed orders.

Final Status:
- {filled_count} orders FILLED on exchange
- {cancelled_count} orders successfully CANCELLED
- {rejected_count} orders REJECTED by exchange

Your portfolio has been updated with any filled orders.

Current Portfolio Summary:
- Balance: ${balance}
- Open Positions: {position_count}
- Unrealized P&L: ${unrealized_pnl}

Review Details: [Portfolio Link]

--- Next Steps (Q9: User Actions) ---

1. Review your current positions carefully
2. Verify all positions match your expectations
3. If positions are unexpected:
   - Contact support before resuming trading
   - Provide this email and your portfolio screenshot
4. If everything looks correct:
   - You may resume trading by manually starting strategies
   - Admin has cleared the emergency stop

--- Why This Happened ---
Reason: {kill_switch_reason}
Duration: {duration_minutes} minutes

System Status: All services now healthy ✓
```

---

### FR-9: System Health & Notifications

**Description**
Пользователь получает уведомления о состоянии системы и изменениях статуса торговли.

**Notification Events**
- Crash recovery complete (система восстановилась после сбоя)
- Kill switch activated (экстренная остановка активирована)
- Strategy stopped (стратегия остановлена вручную или автоматически)
- Risk limit exceeded (превышен лимит риска)
- Time drift detected (обнаружено расхождение времени)
- Exchange connectivity lost (потеряно соединение с биржей)

**Channels**
- Email (все критические события)
- UI banner (постоянный баннер до подтверждения пользователем)
- WebSocket push (real-time для подключенных клиентов)

**Acceptance Criteria**
- Email доставлен в течение 30 секунд после события
- UI banner виден при следующей загрузке страницы
- WebSocket push доставлен всем подключенным сессиям
- Пользователь может настроить предпочтения уведомлений (email вкл/выкл для каждого типа события)

**Email Template Requirements**
- Subject: Чёткое описание события
- Body:
  - Временная метка события
  - Описание причины
  - Список затронутых стратегий/ордеров
  - Требуемые действия пользователя
  - Ссылки на релевантные разделы (портфель, история ордеров)

**UI Banner Requirements**
- Цвет фона зависит от серьёзности (yellow=warning, red=critical)
- Кнопки действий (Review, Dismiss)
- Персистентность до явного подтверждения пользователем
- Не блокирует использование интерфейса

---

## Non-Functional Requirements

### NFR-1: Reliability
- No lost or duplicated orders
- Recovery after restart without data loss

### NFR-2: Performance
- p95 internal processing latency < 150 ms (normal load)
- Backtests complete within reasonable time for candle data

**Normal Load (< 100 concurrent strategies)**
- p95 internal processing latency < 150 ms ✓
- Portfolio query response time: < 500ms (p95) ✓
- Portfolio data staleness: < 1 second (p95) ✓

**High Load (100-500 concurrent strategies)**
- Portfolio data staleness: < 5 seconds (p95)
- Portfolio queries may return `is_stale: true`
- System continues operating (eventual consistency maintained)

**Extreme Load (> 500 concurrent strategies or flash crash conditions)**
- Portfolio data staleness: < 30 seconds (p95)
- All portfolio queries return `is_stale: true`
- **User Warning**: UI shows prominent banner:
  ```
  ⚠️ High system load. Portfolio data delayed up to 30 seconds.
  Trading continues normally. Refresh for latest data.
  ```

**Graceful Degradation**
- System never blocks on portfolio updates
- Risk Service uses last known position + version validation
- If version mismatch: Order rejected (fail-safe behavior)
- Users see explicit staleness indicator (never hidden)

**Out of Scope (MVP)**
- Sub-second portfolio updates during extreme load
- Guaranteed response time during black swan events
- Horizontal scaling (post-MVP enhancement)

**Acceptance Criteria**
- System continues accepting orders during high load ✓
- Staleness never hidden from users ✓
- No silent failures or data loss ✓
- Risk Service fails closed if data too stale (version mismatch) ✓

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

## Strategy State Machine (FR-1 Extended)

**States**
- `DRAFT`: Being edited, not running
- `STARTING`: Transition state (initialization in progress)
- `ACTIVE_PAPER`: Running in paper trading mode
- `ACTIVE_LIVE`: Running in live trading mode
- `STOPPING`: Transition state (shutdown in progress)
- `STOPPED`: Not running, can be edited
- `ERROR`: Failed to start or stop (requires manual intervention)

**State Transitions**

```
DRAFT ──(user starts)──> STARTING
                            │
                            ├──(success)──> ACTIVE_PAPER / ACTIVE_LIVE
                            └──(failure)──> ERROR

ACTIVE_* ──(user stops)──> STOPPING
                              │
                              ├──(all orders closed)──> STOPPED
                              └──(timeout 5 min)────────> ERROR

ERROR ──(user resets)──> STOPPED
```

**Transition Durations (Q11: STOPPING Timeout Behavior)**
- STARTING: 5-30 seconds typical, 5 minutes max
  - Validates strategy configuration
  - Initializes market data subscriptions
  - Places initial orders (if strategy requires)
  - If timeout: Transition to ERROR
- STOPPING: 10 seconds - 2 minutes typical, 5 minutes max
  - Cancels all open orders (best-effort)
  - Unsubscribes from market data
  - **If timeout (> 5 minutes)**: Transition to ERROR
  - **ERROR reason**: "Failed to stop gracefully: {count} orders still open"
  - **Open orders behavior**: Left as-is (NOT force-cancelled)
  - **User notification**: Email sent listing open orders requiring manual action

**Modification Rules (Q12: Deletion Rules)**

| State | Can Edit? | Can Delete? | Can Start? | Can Stop? |
|-------|-----------|-------------|------------|-----------||
| DRAFT | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| STARTING | ❌ No | ❌ No | ❌ No | ✅ Yes (abort) |
| ACTIVE_* | ❌ No | ❌ No | ❌ No | ✅ Yes |
| STOPPING | ❌ No | ❌ No | ❌ No | ❌ No |
| STOPPED | ✅ Yes | ✅ Yes* | ✅ Yes | ❌ No |
| ERROR | ❌ No | ✅ Yes* | ❌ No | ❌ No |

**Deletion Preconditions (marked with * above) - Q12 Answer**

Strategies in STOPPED or ERROR states can be deleted ONLY if:
1. **No open orders** exist:
   ```sql
   COUNT(*) = 0 WHERE strategy_id = ?
     AND status IN ('OPEN', 'PARTIALLY_FILLED', 'SUBMITTED')
   ```
2. **No non-zero positions** exist:
   ```sql
   COUNT(*) = 0 WHERE strategy_id = ?
     AND ABS(quantity) > 0
   ```

**Rationale**
- Prevents accidental deletion of strategies with active market exposure
- Forces user to explicitly close positions (deliberate action)
- Protects against financial loss from forgotten positions

**API Enforcement**
```
DELETE /strategies/{id}

If open_orders > 0 OR positions > 0:
  Return 409 Conflict
  {
    "error": "STRATEGY_HAS_EXPOSURE",
    "message": "Cannot delete: strategy has open orders or positions",
    "open_orders_count": 2,
    "positions": [{"symbol": "BTCUSDT", "quantity": 0.05}],
    "action_required": "Close positions and cancel orders before deleting"
  }
```

**API Enforcement**
```
PUT /strategies/{id}
DELETE /strategies/{id}

If strategy.status IN ('STARTING', 'STOPPING', 'ACTIVE_PAPER', 'ACTIVE_LIVE'):
  Return 409 Conflict
  {
    "error": "STRATEGY_NOT_EDITABLE",
    "message": "Strategy must be in DRAFT or STOPPED state to modify",
    "current_status": "ACTIVE_LIVE"
  }
```

**UI Behavior**
- STARTING: Show spinner "Starting strategy..." with cancel button
- STOPPING: Show spinner "Stopping strategy... (X/Y orders cancelled)"
- ERROR: Show error message with "Reset to STOPPED" button
- Edit/Delete buttons disabled for non-editable states (greyed out)

---
