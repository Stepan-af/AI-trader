Backend MVP Roadmap (12–18 Commits)
Phase 1: Foundation & Infrastructure (Commits 1-4)
1feat: initialize monorepo structure and shared types

Create apps/backend, packages/shared structure
Setup TypeScript configs, ESLint, Prettier
Define shared domain types (Order, Fill, Position, etc.)
2feat: setup PostgreSQL schemas and migrations

Create execution, portfolio, strategy, candles schemas
Define tables per ARCHITECTURE.md
Setup migration tooling (node-pg-migrate)
3feat: add Redis and job queue infrastructure

Setup Redis connection
Configure BullMQ for job queues
Define queue names and priorities
4feat: implement API Gateway scaffold

Express app with JWT middleware
Idempotency-Key middleware
Rate limiting middleware
Basic health check endpoint
Phase 2: Execution Service Core (Commits 5-8)
5feat(execution): implement order state machine

Order creation with idempotency
State transitions (NEW → SUBMITTED → FILLED, etc.)
Event persistence in order_events table
6feat(execution): add fill processing with deduplication

Fill ingestion with exchange_fill_id uniqueness
Transactional outbox for portfolio events
Partial fill handling
7feat(execution): implement Binance Spot adapter

REST API client (order placement, cancellation)
WebSocket client (execution reports)
Connection health monitoring
8feat(execution): add reconciliation service

Periodic exchange sync (every 60s)
Detect missed fills
Batch processing with rate limits
Phase 3: Risk & Portfolio Services (Commits 9-12)
9feat(risk): implement risk validation service

Position size limits
Max exposure per symbol
Pre-trade validation endpoint
Version-based optimistic locking
10feat(risk): add risk cache with version-based invalidation

Redis cache for risk approvals
Version-based cache keys
TTL and manual invalidation
11feat(portfolio): implement position tracking

Outbox event consumer
Position updates from fills
Version counter for optimistic locking
12feat(portfolio): add PnL calculation

Realized/unrealized PnL
Balance tracking
Staleness indicators (is_stale, data_as_of_timestamp)
Phase 4: Strategy & Integration (Commits 13-16)
13feat(strategy): implement strategy CRUD

Strategy creation, validation
DCA, Grid, Swing (DSL) configs
Strategy status management
14feat(strategy): add strategy execution engine

Candle-based signal generation
Order placement via Execution Service
Strategy start/stop with health checks
15feat(execution): implement kill switch mechanism

Global kill switch (Redis flag)
Auto-trigger on Risk Service downtime > 30s
Block strategy starts when active
16feat(api): integrate all services in API Gateway

Strategy endpoints with precondition checks
Portfolio endpoints with staleness
Execution endpoints (order history, etc.)
Phase 5: Backtest & Polish (Commits 17-18)
17feat(backtest): implement backtesting engine

Candle-based simulation
Deterministic execution
Results storage
18feat: add monitoring and observability

Prometheus metrics
Health check dashboard
Alert thresholds
