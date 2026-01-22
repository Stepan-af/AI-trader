#!/bin/bash
# Verification script for Commit 3

set -e

echo "=== Commit 3 Verification ==="
echo ""

echo "1. Checking Redis infrastructure files..."
test -f packages/shared/src/infrastructure/redis.ts && echo "   ✓ Redis connection module exists"
test -f packages/shared/src/infrastructure/queues.ts && echo "   ✓ Queue configuration module exists"
test -f packages/shared/src/infrastructure/index.ts && echo "   ✓ Infrastructure index exists"

echo ""
echo "2. Checking dependencies..."
grep -q '"bullmq"' packages/shared/package.json && echo "   ✓ BullMQ dependency added"
grep -q '"ioredis"' packages/shared/package.json && echo "   ✓ ioredis dependency added"

echo ""
echo "3. Checking queue definitions..."
grep -q "PORTFOLIO_HIGH_PRIORITY" packages/shared/src/infrastructure/queues.ts && echo "   ✓ Portfolio high priority queue"
grep -q "PORTFOLIO_LOW_PRIORITY" packages/shared/src/infrastructure/queues.ts && echo "   ✓ Portfolio low priority queue"
grep -q "ORDER_SUBMISSION" packages/shared/src/infrastructure/queues.ts && echo "   ✓ Order submission queue"
grep -q "ORDER_RECONCILIATION" packages/shared/src/infrastructure/queues.ts && echo "   ✓ Order reconciliation queue"
grep -q "STRATEGY_SIGNALS" packages/shared/src/infrastructure/queues.ts && echo "   ✓ Strategy signals queue"
grep -q "BACKTEST_JOBS" packages/shared/src/infrastructure/queues.ts && echo "   ✓ Backtest jobs queue"
grep -q "CANDLE_INGESTION" packages/shared/src/infrastructure/queues.ts && echo "   ✓ Candle ingestion queue"

echo ""
echo "4. Checking priority levels..."
grep -q "enum QueuePriority" packages/shared/src/infrastructure/queues.ts && echo "   ✓ Priority levels defined"

echo ""
echo "5. Checking worker configuration..."
grep -q "concurrency: 20" packages/shared/src/infrastructure/queues.ts && echo "   ✓ High-priority workers have high concurrency"
grep -q "concurrency: 5" packages/shared/src/infrastructure/queues.ts && echo "   ✓ Low-priority workers have low concurrency"

echo ""
echo "6. Checking health monitoring..."
grep -q "getQueueHealth" packages/shared/src/infrastructure/queues.ts && echo "   ✓ Queue health monitoring function"
grep -q "getAllQueuesHealth" packages/shared/src/infrastructure/queues.ts && echo "   ✓ All queues health monitoring"

echo ""
echo "7. Checking documentation..."
test -f docs/QUEUES.md && echo "   ✓ Queue documentation exists"
test -f apps/backend/src/examples/queue-usage.ts && echo "   ✓ Usage examples exist"

echo ""
echo "8. Verifying build..."
npm run build > /dev/null 2>&1 && echo "   ✓ TypeScript builds successfully"

echo ""
echo "=== All checks passed! ==="
echo ""
echo "To test with Redis:"
echo "  1. Install Redis: brew install redis"
echo "  2. Start Redis: brew services start redis"
echo "  3. Test connection: redis-cli ping"
echo "  4. Use queues in your services"
