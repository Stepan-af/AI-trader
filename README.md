# AI-trader

Web platform for automated and semi-automated trading with backtesting capabilities.

## MVP Status

⚠️ **This is MVP software** - See production readiness notes below.

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+ (monorepo builds require Node 20 and npm 10+)
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

### 5. Start Backend (Development)

For a development run (build then start the backend):

```bash
cd apps/backend
npm run start:dev
```

Note: `start:dev` builds the TypeScript into `dist/` and starts the Node process.
If you want file-watch/auto-restart you may run a separate TypeScript watcher:

```bash
# In one terminal: compile on change
cd apps/backend && npm run dev
# In another terminal: start the built server
cd apps/backend && npm run start:dev
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

**Debug / Development Run**

- Prerequisites: Docker, Docker Compose, Node 20+, npm 10+ installed.
- Recommended: use a clean shell and a fresh clone.

1. Install dependencies (root workspace):

```bash
cd /path/to/AI-trader
npm ci
```

2. Copy env and edit secrets (local dev):

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET (use openssl rand -hex 32)
```

3. Start infra (Postgres + Redis) with Docker Compose:

```bash
docker-compose down -v --remove-orphans
docker-compose up --build -d postgres redis
docker-compose ps
```

4. Run DB migrations from the host (requires `DATABASE_URL` in `.env`):

```bash
npm run migrate
# or
node scripts/run-migrations.js
```

5. Start Backend (development):

```bash
# Option A (recommended): build and run backend Node process
cd apps/backend
npm run start:dev

# Option B (watch compile + run):
# In terminal A: compile on changes
cd apps/backend && npm run dev
# In terminal B: run built server
cd apps/backend && npm run start:dev
```

Backend API: http://localhost:3000 (API base: http://localhost:3000/api/v1)

6. Start Frontend (development):

```bash
cd apps/web
npm run dev
```

Frontend: http://localhost:3001

7. Verify health endpoints and connectivity:

```bash
curl http://localhost:3000/api/v1/health
# Open http://localhost:3001 in browser
```

Useful debug tips:

- View logs: `docker-compose logs -f` and backend logs in terminal.
- If migrations fail, ensure `DATABASE_URL` points to docker Postgres: `postgresql://postgres:postgres@localhost:5432/ai_trader`.
- To reset DB: `docker-compose down -v` then `docker-compose up -d postgres` then rerun migrations.

**User / Demo Run**

This is the simplest way to run the MVP locally for a demo user (no code changes):

1. Start infra and services with Docker Compose (all services):

```bash
docker-compose down -v --remove-orphans
docker-compose up --build -d
```

2. Apply migrations (host or container):

```bash
npm run migrate
# or run inside the backend container:
docker-compose exec backend node scripts/run-migrations.js
```

3. Access the application:

- Frontend UI: http://localhost:3001
- Backend API: http://localhost:3000/api/v1

4. Demo user / accounts:

- The MVP supports local registration via the frontend. Use the UI to register a demo user.
- Alternatively, create a user via API: `POST http://localhost:3000/api/v1/auth/register` with JSON `{ "email": "demo@example.com", "password": "password" }`.

5. Supported demo flows (MVP happy path):

- Login
- Create a strategy (DCA/Grid/Swing) via UI
- Run backtest and view results in UI
- Place PAPER orders or start strategy in PAPER mode
- View orders/fills and portfolio positions/pnl

Limitations and notes:

- LIVE trading adapters are not connected by default — use PAPER mode.
- Some background workers (reconciliation, event processing) may be incomplete in the MVP — see Known Limitations.

Reset local state:

```bash
# Stop everything and remove volumes
docker-compose down -v --remove-orphans
# Start infra and re-run migrations
docker-compose up -d postgres redis
npm run migrate
```

Ports / URLs:

- Backend API: http://localhost:3000
- Frontend: http://localhost:3001
- Postgres: localhost:5432
- Redis: localhost:6379

Security: never commit real secrets. Use `.env.example` and set values in your local `.env`.
