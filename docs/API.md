


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


/api/v1

```

### Headers
```

Authorization: Bearer <JWT>
Idempotency-Key: <uuid>   // required for POST/PUT
Content-Type: application/json

````

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
````

---

### Error Format

```json
{
  "error": "ORDER_REJECTED",
  "message": "Insufficient balance"
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

* Backtest configuration is immutable after start
* Same input → same output

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

* `mode`: `PAPER` | `LIVE`
* Idempotency-Key required

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
  "balance": 10500,
  "equity": 10720
}
```

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

* Authenticated: 100 req/min
* Trading endpoints: 20 req/min
* Backtests: 5 per hour

---

## Security Notes

* No API key exposure via API
* All sensitive operations audited
* Execution failures always return explicit errors

---

## Explicit Non-Goals (API)

* WebSockets for market data (future)
* Strategy code upload
* Tick-level trading APIs

---

## Definition of Done (API)

* All write endpoints are idempotent
* Domain entities are unambiguous
* Error cases are explicit and testable
* API matches architecture and PRD

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

**Conflict Resolution Rules**
- Exchange state is authoritative for order status and fills
- DB state is authoritative for intent (idempotency, original parameters)
- Never re-submit orders that exist on exchange
- If order missing from exchange and from DB → no action (outside window)

**Guarantees**
- Eventual consistency within 60 seconds
- No phantom orders
- No lost fills
