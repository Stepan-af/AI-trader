# Infrastructure

This directory contains infrastructure-related configuration and setup files.

## Contents

- `migrations/` - PostgreSQL database migrations
- `database-config.json` - node-pg-migrate configuration

## Database Setup

### Prerequisites

- PostgreSQL 15+
- TimescaleDB extension (optional, for production candle storage)

### Local Development Setup

1. Install PostgreSQL:

   ```bash
   # macOS
   brew install postgresql@15
   brew services start postgresql@15
   ```

2. Create database:

   ```bash
   createdb ai_trader
   ```

3. Copy environment file:

   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. Run migrations:
   ```bash
   npm run migrate:up
   ```

### Production Setup

For production, enable TimescaleDB extension before running migrations:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

Then run migrations as usual.

## Schema Structure

See [ARCHITECTURE.md](../docs/ARCHITECTURE.md) for detailed schema ownership and cross-schema transaction rules.

- **execution** - Execution Service domain
- **portfolio** - Portfolio Service domain
- **strategy** - Strategy Service domain
- **candles** - Shared candle data (Exchange Adapter writes)
