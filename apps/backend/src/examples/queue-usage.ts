/**
 * Example: Queue and Worker Usage
 * Demonstrates how to use the job queue infrastructure
 */

/* eslint-disable no-console, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */

import { createWorker, getQueue, QueueName, type JobProcessor } from '@ai-trader/shared';

// ============================================================================
// Example 1: Adding Jobs to Queue
// ============================================================================

async function exampleAddJob(): Promise<void> {
  const queue = getQueue(QueueName.PORTFOLIO_HIGH_PRIORITY);

  await queue.add('recalculate-position', {
    userId: 'user-123',
    symbol: 'BTCUSDT',
    fillId: 'fill-456',
  });

  console.log('Job added to high-priority portfolio queue');
}

// ============================================================================
// Example 2: Creating a Worker
// ============================================================================

interface PositionRecalcJob {
  userId: string;
  symbol: string;
  fillId: string;
}

const processPositionRecalc: JobProcessor<PositionRecalcJob> = async (job) => {
  console.log('Processing position recalculation:', job.data);

  // Simulate async work
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Update position in database
  // await updatePosition(job.data.userId, job.data.symbol);

  console.log('Position recalculation complete');
};

async function exampleCreateWorker(): Promise<void> {
  const worker = createWorker(QueueName.PORTFOLIO_HIGH_PRIORITY, processPositionRecalc);

  // Worker will automatically process jobs until closed
  void worker; // Mark as intentionally unused in example
  console.log('Worker created and listening for jobs');
}

// ============================================================================
// Example 3: Queue Health Monitoring
// ============================================================================

import { getAllQueuesHealth, getQueueHealth } from '@ai-trader/shared';

async function exampleMonitorQueues(): Promise<void> {
  // Get health for specific queue
  const portfolioHealth = await getQueueHealth(QueueName.PORTFOLIO_HIGH_PRIORITY);
  console.log('Portfolio queue health:', portfolioHealth);

  // Get health for all queues
  const allHealth = await getAllQueuesHealth();
  console.log('All queues health:', allHealth);
}

// ============================================================================
// Run examples
// ============================================================================

async function main(): Promise<void> {
  try {
    await exampleAddJob();
    await exampleCreateWorker();
    await exampleMonitorQueues();
  } catch (error) {
    console.error('Example error:', error);
  }
}

// Export main for use in other files
export { main };

// Uncomment to run:
// main().catch(console.error);
