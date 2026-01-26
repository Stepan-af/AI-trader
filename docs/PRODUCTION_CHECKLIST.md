# Production Readiness Checklist

## Pre-Deployment Validation

### ✅ Completed (Safe for Local Dev)

- [x] Environment variable validation on startup
- [x] Database migrations automated
- [x] Docker Compose configuration for local stack
- [x] Health check endpoints functional
- [x] Order ownership verification
- [x] Portfolio balance queries database (not hardcoded)
- [x] Kill switch activation/deactivation via Redis
- [x] Idempotency middleware for write operations
- [x] Fill deduplication via `exchange_fill_id` UNIQUE constraint
- [x] Order state machine enforced
- [x] Audit trail via `order_events` table
- [x] Auth middleware protects all endpoints
- [x] Rate limiting configured

### ❌ Blockers (MUST FIX Before Production)

#### Critical Execution Gaps

- [ ] **M1: Risk Service Integration**
  - File: `apps/backend/src/api/routes/orders.ts:70-80`
  - Status: TODOs present, no actual validation
  - Fix: Implement Risk Service call before order creation
  - ETA: 4-6 hours

- [ ] **M2: Exchange Adapter Integration**
  - File: `apps/backend/src/api/routes/orders.ts:78`
  - Status: TODO, orders not submitted to exchange
  - Fix: Integrate BinanceAdapter into order placement flow
  - ETA: 8-12 hours

- [ ] **M3: Portfolio Event Worker**
  - File: `apps/backend/src/api/init.ts`
  - Status: Service exists, never called
  - Fix: Add background worker polling outbox every 500ms
  - ETA: 2-4 hours

- [ ] **M4: Reconciliation Service Startup**
  - File: `apps/backend/src/api/init.ts`
  - Status: Service exists, not instantiated
  - Fix: Initialize ReconciliationService in init.ts, start() on boot
  - ETA: 1-2 hours

- [ ] **M9: Risk Service Implementation**
  - File: `apps/backend/src/risk/`
  - Status: Endpoint exists, validation logic incomplete
  - Fix: Implement full risk limits checking
  - ETA: 6-8 hours

#### Estimated Total: 21-32 hours development time

### ⚠️ Should Fix (Before Public Release)

- [ ] **S2: Repository Pagination**
  - Impact: Memory issues with large datasets
  - ETA: 1 hour

- [ ] **S4: Unrealized PnL Calculation**
  - Impact: Portfolio shows incomplete data
  - ETA: 4-6 hours (needs market price service)

- [ ] **S5: Structured Logging**
  - Impact: Production debugging difficult
  - ETA: 2-3 hours

- [ ] **S6: Business Metrics**
  - Impact: No observability
  - ETA: 3-4 hours

## Deployment Steps (When Blockers Fixed)

### 1. Pre-Flight

```bash
# Verify all env vars set
node -e "require('./apps/backend/dist/api/validateEnv').validateEnvironment()"

# Run migrations
npm run migrate

# Run health check
curl http://localhost:3000/api/v1/health
```

### 2. Smoke Tests

```bash
# Test order placement (should call Risk Service)
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","side":"BUY","type":"LIMIT","quantity":0.001,"price":40000,"mode":"PAPER"}'

# Verify order appears in DB
psql $DATABASE_URL -c "SELECT id, status FROM execution.orders ORDER BY created_at DESC LIMIT 1;"

# Verify portfolio events processed
psql $DATABASE_URL -c "SELECT COUNT(*) FROM execution.portfolio_events_outbox WHERE processed_at IS NULL;"
# Should be 0 or low number
```

### 3. Load Testing

- [ ] 100 concurrent users
- [ ] 1,000 orders/day
- [ ] p95 latency < 150ms
- [ ] No memory leaks over 24h

### 4. Fail-Over Testing

- [ ] Kill backend mid-order → Reconciliation recovers
- [ ] Kill Redis → Kill switch activated
- [ ] Kill Postgres → Graceful degradation

## Monitoring Setup

### Required Alerts

- [ ] Kill switch activated
- [ ] Database connection lost > 10s
- [ ] Redis connection lost > 10s
- [ ] Portfolio outbox backlog > 100 events
- [ ] Reconciliation duration > 5s
- [ ] Order placement rate > 20/min per user

### Dashboards

- [ ] Order flow (submitted → filled)
- [ ] Portfolio staleness distribution
- [ ] Risk Service approval rate
- [ ] Reconciliation actions per run

## Runbook

### Emergency Stop

```bash
# Activate kill switch (stops all new orders)
redis-cli SET kill_switch:global '{"active":true,"reason":"manual","activatedAt":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","activatedBy":"ops"}'

# Verify all strategies stopped
psql $DATABASE_URL -c "SELECT COUNT(*) FROM strategy.strategies WHERE status = 'RUNNING';"
# Should be 0
```

### Clear Kill Switch

```bash
# Only after verifying:
# 1. Reconciliation complete
# 2. All services healthy
# 3. No critical errors

redis-cli DEL kill_switch:global
```

## Sign-Off

Before production deployment, verify:

- [ ] All M\* issues resolved
- [ ] Integration tests pass
- [ ] Load tests pass
- [ ] Runbook tested
- [ ] Team trained on emergency procedures

**Deployment Approved By:** ******\_\_\_******
**Date:** ******\_\_\_******
