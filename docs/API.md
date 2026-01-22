# API.md

## Purpose

Описать публичный API **MVP web-платформы автоматизированной торговли**.

API ориентирован на:

- детерминированность,
- идемпотентность,
- чёткое разделение доменных сущностей.

---

## API Principles

1. REST + JSON
2. Explicit domain entities (Order ≠ Fill ≠ Position)
3. Idempotent write operations
4. Immutable historical data
5. Pagination for all collections

---

## Common Conventions

### Base URL

```
/api/v1
```

### Headers

```

Authorization: Bearer <JWT>
Idempotency-Key: <uuid> // required for POST/PUT
Content-Type: application/json

```

---

### Pagination

```json
{
  "items": [],
  "meta": {
    "limit": 50,
    "offset": 0,
    "total": 123
  }
}
```

---

### Error Format

```json
{
  "error": "ORDER_REJECTED",
  "message": "Insufficient balance"
}
```

**Common Error Codes**

- `ORDER_REJECTED`: Order validation failed
- `RATE_LIMITED`: Too many requests, retry after delay
- `RISK_LIMIT_EXCEEDED`: Position or exposure limit violated
- `SERVICE_UNAVAILABLE`: Dependent service (Risk, Exchange) unavailable
- `KILL_SWITCH_ACTIVE`: Emergency stop active, no orders accepted

**Rate Limiting Error**

```json
{
  "error": "RATE_LIMITED",
  "message": "Order submission rate limit exceeded. Please reduce trading frequency.",
  "retry_after_seconds": 4
}
```

---

## Authentication

### Login

```
POST /auth/login
```

### Refresh

```
POST /auth/refresh
```

---

## Strategies

### Create Strategy

```
POST /strategies
```

```json
{
  "name": "RSI Swing",
  "type": "SWING",
  "symbol": "BTCUSDT",
  "timeframe": "1m",
  "rules": {
    "entry": "RSI < 30 AND CLOSE > SMA(200)",
    "exit": "RSI > 60"
  },
  "risk": {
    "maxPositionSize": 0.01
  }
}
```

---

### List Strategies

```
GET /strategies
```

---

### Update Strategy

```
PUT /strategies/{id}
```

---

### Start Strategy

```
POST /strategies/{id}/start
```

**Request**

```json
{
  "mode": "PAPER" | "LIVE"
}
```

**Preconditions (Enforced)**

- Strategy status must be `STOPPED` or `DRAFT`
- Kill switch must NOT be active (system-wide check)
- User API keys must be configured (for LIVE mode)
- **Risk Service health check passed** (last response < 5s ago) - Q5
- **Portfolio Service responsive** (last successful query < 5s ago, data not stale) - Q5
- **Exchange WebSocket connected** (for LIVE mode, not required for PAPER)
- **If Portfolio Service returns is_stale=true**: Block strategy start - Q5
  - Return `HTTP 503` with message: "Portfolio data stale, cannot validate risk limits"

**Response (Success)**

```json
{
  "id": "uuid",
  "status": "STARTING",
  "mode": "LIVE"
}
```

**Response (Kill Switch Active)**

```json
HTTP 503 Service Unavailable

{
  "error": "KILL_SWITCH_ACTIVE",
  "message": "Emergency stop is active. Cannot start strategies until cleared by administrator.",
  "kill_switch_reason": "risk_service_down",
  "activated_at": "2026-01-22T10:15:00Z"
}
```

**Response (Services Unhealthy)**

```json
HTTP 503 Service Unavailable

{
  "error": "SERVICE_UNAVAILABLE",
  "message": "Cannot start strategy: dependent services unhealthy",
  "failed_checks": [
    "risk_service_timeout",
    "portfolio_data_stale"
  ],
  "retry_after_seconds": 10
}
```

**Kill Switch Check (Server-Side)**

```typescript
async function startStrategy(strategyId: string, mode: string) {
  const killSwitchActive = await db.queryOne(`
    SELECT kill_switch_active, kill_switch_reason
    FROM system_config
    WHERE id = 'global'
  `);

  if (killSwitchActive.kill_switch_active) {
    throw new ServiceUnavailableError('KILL_SWITCH_ACTIVE');
  }

  // Proceed with strategy start
  // ...
}
```

**UI Behavior**

- "Start" button disabled globally while kill switch active
- Disabled button shows tooltip: "Emergency stop active - contact administrator"
- Banner at top of page: "⛔ Emergency Stop Active - No trading allowed"

---

### Delete Strategy

```
DELETE /strategies/{id}
```

---

## Backtests

### Start Backtest

```
POST /backtests
```

```json
{
  "strategyId": "uuid",
  "from": "2024-01-01T00:00:00Z",
  "to": "2024-06-01T00:00:00Z",
  "initialBalance": 10000
}
```

**Rules**

- Backtest configuration is immutable after start
- Same input → same output

---

### Get Backtest Result

```
GET /backtests/{id}
```

```json
{
  "status": "COMPLETED",
  "metrics": {
    "totalReturn": 0.23,
    "maxDrawdown": 0.08,
    "sharpe": 1.4
  }
}
```

---

## Orders

### Place Order

```
POST /orders
```

```json
{
  "strategyId": "uuid",
  "symbol": "BTCUSDT",
  "side": "BUY",
  "type": "LIMIT",
  "quantity": 0.01,
  "price": 42000,
  "stopLoss": 40000,
  "takeProfit": 45000,
  "mode": "LIVE"
}
```

**Notes**

- `mode`: `PAPER` | `LIVE`
- Idempotency-Key required

---

### List Orders

```
GET /orders
```

---

### Get Order

```
GET /orders/{id}
```

```json
{
  "id": "uuid",
  "status": "PARTIALLY_FILLED",
  "filledQuantity": 0.005,
  "avgPrice": 42100
}
```

---

### Cancel Order

```
POST /orders/{id}/cancel
```

---

## Fills

### Get Order Fills

```
GET /orders/{id}/fills
```

```json
[
  {
    "id": "uuid",
    "price": 42100,
    "quantity": 0.005,
    "timestamp": "2024-06-01T10:01:02Z"
  }
]
```

---

## Portfolio

### Portfolio Overview

```
GET /portfolio
```

```json
{
  "balance": 10500.0,
  "equity": 10720.0,
  "unrealized_pnl": 220.0,
  "data_as_of_timestamp": "2026-01-22T10:15:23.445Z",
  "is_stale": false
}
```

**Response Fields**

- `data_as_of_timestamp`: ISO 8601 timestamp of last portfolio update
- `is_stale`: Boolean flag (true if data age > 5 seconds)

**Staleness Handling**

- All portfolio endpoints include these fields
- UI must display timestamp to user
- If `is_stale: true`, show warning indicator

---

### Positions

```
GET /portfolio/positions
```

---

### PnL

```
GET /portfolio/pnl
```

---

## Alerts

### Create Alert

```
POST /alerts
```

```json
{
  "type": "ORDER_FILLED",
  "channel": "EMAIL"
}
```

---

### List Alerts

```
GET /alerts
```

---

## Rate Limits (MVP)

- Authenticated: 100 req/min
- Trading endpoints: 20 req/min
- Backtests: 5 per hour

---

## Security Notes

- No API key exposure via API
- All sensitive operations audited
- Execution failures always return explicit errors

---

## Explicit Non-Goals (API)

- WebSockets for market data (future)
- Strategy code upload
- Tick-level trading APIs

---

## Definition of Done (API)

- All write endpoints are idempotent
- Domain entities are unambiguous
- Error cases are explicit and testable
- API matches architecture and PRD

---

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

**Conflict Resolution Rules (Priority Order)**

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

- Exchange is authoritative for facts (what happened)
- Database is authoritative for intent (what was requested)
- User actions (cancels) are respected and retried
- Eventual consistency within 60 seconds
- No phantom orders
- No lost fills

---

## WebSocket Events

### Connection

```
wss://api.example.com/ws?token={jwt}
```

### Event Types

**System Recovery**

```json
{
  "type": "SYSTEM_RECOVERY_COMPLETE",
  "timestamp": "2026-01-22T10:15:30Z",
  "recovery_duration_ms": 15432,
  "stopped_strategies": [
    { "id": "uuid1", "name": "RSI Swing", "mode": "LIVE" },
    { "id": "uuid2", "name": "Grid BTC", "mode": "PAPER" }
  ],
  "reconciled_order_count": 12,
  "message": "System recovered. Review positions before restarting strategies."
}
```

**Kill Switch**

```json
{
  "type": "KILL_SWITCH_ACTIVATED",
  "timestamp": "2026-01-22T10:15:00Z",
  "reason": "manual" | "risk_service_down" | "time_drift" | "alert_triggered",
  "stopped_strategy_count": 5,
  "cancellation_status": "in_progress"
}
```

**Order Fill**

```json
{
  "type": "ORDER_FILLED",
  "order_id": "uuid",
  "fill_id": "uuid",
  "price": 42100.0,
  "quantity": 0.005,
  "timestamp": "2026-01-22T10:01:02Z"
}
```

**Partial Fill**

```json
{
  "type": "ORDER_PARTIALLY_FILLED",
  "order_id": "uuid",
  "fill_id": "uuid",
  "filled_quantity": 0.005,
  "remaining_quantity": 0.005,
  "timestamp": "2026-01-22T10:01:02Z"
}
```

**Portfolio Update**

```json
{
  "type": "PORTFOLIO_UPDATED",
  "balance": 10500.0,
  "unrealized_pnl": 220.0,
  "data_as_of_timestamp": "2026-01-22T10:15:23Z",
  "is_stale": false
}
```

---
