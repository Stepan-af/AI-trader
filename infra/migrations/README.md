# Database Migrations

This directory contains PostgreSQL database migrations for the AI Trader platform.

## Schema Ownership

Per ARCHITECTURE.md:

- **execution** schema: Execution Service (orders, fills, order_events, portfolio_events_outbox)
- **portfolio** schema: Portfolio Service (positions, balances, pnl_snapshots)
- **strategy** schema: Strategy Service (strategies)
- **candles** schema: Exchange Adapter writes, all services read (candles)

## Migration Tool

Using `node-pg-migrate` for migration management.

## Running Migrations

```bash
# Run all pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Create new migration
npm run migrate:create -- <migration-name>
```

## Environment Variables

Required environment variables (set in `.env`):

```
DATABASE_URL=postgresql://user:password@localhost:5432/ai_trader
```

## TimescaleDB

The candles table is designed as a TimescaleDB hypertable but requires the extension to be enabled first:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable('candles.candles', 'timestamp', chunk_time_interval => INTERVAL '1 day');
```

This will be added in a future migration after PostgreSQL + TimescaleDB setup.
