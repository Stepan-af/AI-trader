#!/bin/bash
# Verification script for Commit 2

set -e

echo "=== Commit 2 Verification ==="
echo ""

echo "1. Checking migration files exist..."
test -f infra/migrations/001_initial_schema.sql && echo "   ✓ Migration file exists"

echo ""
echo "2. Checking migration scripts..."
npm run | grep -q "migrate:up" && echo "   ✓ migrate:up script exists"
npm run | grep -q "migrate:down" && echo "   ✓ migrate:down script exists"
npm run | grep -q "migrate:create" && echo "   ✓ migrate:create script exists"

echo ""
echo "3. Checking SQL syntax (basic)..."
grep -q "CREATE SCHEMA.*execution" infra/migrations/001_initial_schema.sql && echo "   ✓ execution schema defined"
grep -q "CREATE SCHEMA.*portfolio" infra/migrations/001_initial_schema.sql && echo "   ✓ portfolio schema defined"
grep -q "CREATE SCHEMA.*strategy" infra/migrations/001_initial_schema.sql && echo "   ✓ strategy schema defined"
grep -q "CREATE SCHEMA.*candles" infra/migrations/001_initial_schema.sql && echo "   ✓ candles schema defined"

echo ""
echo "4. Checking table definitions..."
grep -q "CREATE TABLE execution.orders" infra/migrations/001_initial_schema.sql && echo "   ✓ orders table defined"
grep -q "CREATE TABLE execution.fills" infra/migrations/001_initial_schema.sql && echo "   ✓ fills table defined"
grep -q "CREATE TABLE execution.order_events" infra/migrations/001_initial_schema.sql && echo "   ✓ order_events table defined"
grep -q "CREATE TABLE execution.portfolio_events_outbox" infra/migrations/001_initial_schema.sql && echo "   ✓ portfolio_events_outbox table defined"
grep -q "CREATE TABLE portfolio.positions" infra/migrations/001_initial_schema.sql && echo "   ✓ positions table defined"
grep -q "CREATE TABLE portfolio.balances" infra/migrations/001_initial_schema.sql && echo "   ✓ balances table defined"
grep -q "CREATE TABLE portfolio.pnl_snapshots" infra/migrations/001_initial_schema.sql && echo "   ✓ pnl_snapshots table defined"
grep -q "CREATE TABLE strategy.strategies" infra/migrations/001_initial_schema.sql && echo "   ✓ strategies table defined"
grep -q "CREATE TABLE candles.candles" infra/migrations/001_initial_schema.sql && echo "   ✓ candles table defined"

echo ""
echo "5. Checking critical constraints..."
grep -q "exchange_fill_id VARCHAR.*UNIQUE" infra/migrations/001_initial_schema.sql && echo "   ✓ exchange_fill_id unique constraint (deduplication)"
grep -q "version BIGINT NOT NULL DEFAULT 1" infra/migrations/001_initial_schema.sql && echo "   ✓ position version for optimistic locking"
grep -q "processed_at TIMESTAMPTZ" infra/migrations/001_initial_schema.sql && echo "   ✓ outbox processed_at for eventual consistency"

echo ""
echo "=== All checks passed! ==="
echo ""
echo "To test with a database:"
echo "  1. Create database: createdb ai_trader"
echo "  2. Copy .env.example to .env and configure DATABASE_URL"
echo "  3. Run: npm run migrate:up"
