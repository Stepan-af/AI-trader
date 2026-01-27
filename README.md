# AI-trader

Web platform for automated and semi-automated trading with backtesting capabilities.

## MVP Status

⚠️ **This is MVP software** - See production readiness notes below.

## Quick Start (Local Development)

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Git

### 1. Clone and Install

```bash
git clone <repository-url>
cd AI-trader
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

**⚠️ CRITICAL:** Edit `.env` and set a secure JWT_SECRET:

```bash
# Generate a secure secret
openssl rand -hex 32

# Add to .env
JWT_SECRET=<generated-secret>
```

### 3. Start Infrastructure

```bash
# Start PostgreSQL + TimescaleDB + Redis
docker-compose up -d postgres redis

# Wait for services to be healthy (10-15 seconds)
docker-compose ps
```

### 4. Run Migrations

```bash
# Apply database schema
node scripts/run-migrations.js
```

Expected output:

```
✓ Connected to database
Found 5 migration files
▶ Executing 001_initial_schema.sql...
✓ Successfully executed 001_initial_schema.sql
...
✓ Successfully executed 5 migrations
```

### 5. Start Backend

```bash
npm run dev
```

Backend will start on `http://localhost:3000`.

### 6. Start Frontend (Optional)

```bash
cd apps/web
npm run dev
```

Frontend will start on `http://localhost:3001`.

### 7. Verify Health

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-26T...",
  "uptime": 5,
  "services": {
    "database": { "status": "up", "responseTime": 12 },
    "redis": { "status": "up", "responseTime": 3 }
  }
}
```

## Full Stack (Docker Compose)

Run the entire application stack (Backend + Frontend + Infrastructure):

```bash
# Start all services (Postgres, Redis, Backend, Frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Access services:
# - Frontend: http://localhost:3001
# - Backend API: http://localhost:3000
# - PostgreSQL: localhost:5432
# - Redis: localhost:6379

# Stop all services
docker-compose down
```

For production deployment, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Known Limitations (MVP)

### ⚠️ MUST FIX Before Production

The following issues are **documented but not yet implemented**:

1. **M1: Risk Service Integration Missing**
   - Order placement bypasses risk validation
   - **Impact:** No pre-trade risk limits enforced
   - **File:** `apps/backend/src/api/routes/orders.ts:78`

2. **M2: Exchange Adapter Not Connected**
   - Orders created in DB but never submitted to exchange
   - **Impact:** No actual trading occurs
   - **File:** `apps/backend/src/api/routes/orders.ts:78`

3. **M3: Portfolio Event Worker Missing**
   - Fill events not processed, positions never updated
   - **Impact:** Portfolio always stale
   - **File:** `apps/backend/src/api/init.ts`

4. **M4: Reconciliation Service Not Started**
   - DB state never syncs with exchange
   - **Impact:** Orders stuck after restart
   - **File:** `apps/backend/src/api/init.ts`

5. **M9: Risk Service Implementation Incomplete**
   - Risk validation endpoint exists but may lack full logic
   - **Impact:** Partial risk protection
   - **File:** `apps/backend/src/risk/`

### See Full Report

For complete list of issues, reproduction steps, and severity ratings:

```bash
# Production readiness report generated during code review
# See commit message for details
```

## Architecture

- **Backend:** Node.js + TypeScript + Express
- **Database:** PostgreSQL 15 + TimescaleDB
- **Cache/Jobs:** Redis
- **API:** REST + JSON

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## API Documentation

Base URL: `http://localhost:3000/api/v1`

See [docs/API.md](docs/API.md) for endpoint reference.

## Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Watch mode
npm run test:watch
```

## Project Structure

```
apps/
  backend/            # Backend application (Node.js + Express)
    src/
      api/           # HTTP routes and middleware
      execution/     # Order management domain
      portfolio/     # Position tracking domain
      risk/          # Risk validation domain
      strategy/      # Strategy management domain
      backtest/      # Backtesting engine
      monitoring/    # Health checks and metrics
  
  web/               # Frontend application (Next.js + React)
    src/
      app/           # Next.js app directory (routes)
      components/    # React components
      hooks/         # Custom React hooks
      lib/           # API client and utilities
      types/         # TypeScript type definitions

packages/shared/     # Shared types and utilities

infra/
  migrations/        # Database migrations

docs/                # Documentation
  ARCHITECTURE.md    # System architecture
  API.md            # API reference
  DEPLOYMENT.md     # Production deployment guide
```

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** - System design and principles
- **[API Reference](docs/API.md)** - Complete API endpoint documentation
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment instructions
- **[Production Checklist](docs/PRODUCTION_CHECKLIST.md)** - Known limitations and fixes needed

## Contributing

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for architectural principles.

## License

Proprietary
