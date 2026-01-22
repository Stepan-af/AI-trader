/**
 * Job Queue Configuration
 * BullMQ-based job queues with priority support
 */

import { Queue, QueueOptions, Worker, WorkerOptions, Job } from 'bullmq';

/**
 * Queue Names
 * Per ARCHITECTURE.md and service requirements
 */
export const QueueName = {
  // Portfolio Service queues (two-tier priority)
  PORTFOLIO_HIGH_PRIORITY: 'portfolio:high_priority',
  PORTFOLIO_LOW_PRIORITY: 'portfolio:low_priority',

  // Execution Service queues
  ORDER_SUBMISSION: 'execution:order_submission',
  ORDER_RECONCILIATION: 'execution:reconciliation',

  // Strategy Service queues
  STRATEGY_SIGNALS: 'strategy:signals',
  BACKTEST_JOBS: 'backtest:jobs',

  // Exchange Adapter queues
  CANDLE_INGESTION: 'exchange:candle_ingestion',
} as const;

export type QueueNameType = (typeof QueueName)[keyof typeof QueueName];

/**
 * Queue Priority Levels
 */
export enum QueuePriority {
  CRITICAL = 1, // User-facing operations
  HIGH = 5, // Fill processing, position updates
  NORMAL = 10, // Background reconciliation
  LOW = 15, // Price updates, snapshots
}

/**
 * Get Redis connection config
 */
function getRedisConnection(): { host: string; port: number } {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
  };
}

/**
 * Default Queue Options
 */
const defaultQueueOptions: Partial<QueueOptions> = {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 3600, // Keep for 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
    },
  },
};

/**
 * Queue-specific configurations
 */
const queueConfigs: Record<QueueNameType, Partial<QueueOptions>> = {
  [QueueName.PORTFOLIO_HIGH_PRIORITY]: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      priority: QueuePriority.HIGH,
    },
  },
  [QueueName.PORTFOLIO_LOW_PRIORITY]: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      priority: QueuePriority.LOW,
    },
  },
  [QueueName.ORDER_SUBMISSION]: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      priority: QueuePriority.CRITICAL,
      attempts: 5, // More retries for order submission
    },
  },
  [QueueName.ORDER_RECONCILIATION]: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      priority: QueuePriority.NORMAL,
    },
  },
  [QueueName.STRATEGY_SIGNALS]: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      priority: QueuePriority.HIGH,
    },
  },
  [QueueName.BACKTEST_JOBS]: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      priority: QueuePriority.LOW,
      attempts: 1, // Don't retry backtests
    },
  },
  [QueueName.CANDLE_INGESTION]: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      priority: QueuePriority.NORMAL,
    },
  },
};

/**
 * Queue Registry
 */
const queues = new Map<QueueNameType, Queue>();

/**
 * Create or get queue instance
 */
export function getQueue(name: QueueNameType): Queue {
  if (!queues.has(name)) {
    const config = queueConfigs[name];
    const queue = new Queue(name, config as QueueOptions);
    queues.set(name, queue);
  }
  return queues.get(name)!;
}

/**
 * Worker Registry
 */
const workers = new Map<string, Worker>();

/**
 * Default Worker Options
 */
const defaultWorkerOptions: Partial<WorkerOptions> = {
  connection: getRedisConnection(),
  concurrency: 10,
  autorun: true,
};

/**
 * Worker-specific configurations
 */
const workerConfigs: Record<QueueNameType, Partial<WorkerOptions>> = {
  [QueueName.PORTFOLIO_HIGH_PRIORITY]: {
    ...defaultWorkerOptions,
    concurrency: 20, // Higher concurrency for user-facing operations
  },
  [QueueName.PORTFOLIO_LOW_PRIORITY]: {
    ...defaultWorkerOptions,
    concurrency: 5, // Lower concurrency for background work
  },
  [QueueName.ORDER_SUBMISSION]: {
    ...defaultWorkerOptions,
    concurrency: 5, // Rate-limited by token bucket
  },
  [QueueName.ORDER_RECONCILIATION]: {
    ...defaultWorkerOptions,
    concurrency: 3,
  },
  [QueueName.STRATEGY_SIGNALS]: {
    ...defaultWorkerOptions,
    concurrency: 10,
  },
  [QueueName.BACKTEST_JOBS]: {
    ...defaultWorkerOptions,
    concurrency: 2, // CPU-intensive, limit concurrency
  },
  [QueueName.CANDLE_INGESTION]: {
    ...defaultWorkerOptions,
    concurrency: 10,
  },
};

/**
 * Job Processor Function Type
 */
export type JobProcessor<T = unknown> = (job: Job<T>) => Promise<void>;

/**
 * Create worker for queue
 */
export function createWorker<T = unknown>(name: QueueNameType, processor: JobProcessor<T>): Worker {
  const workerId = `${name}:worker`;

  if (workers.has(workerId)) {
    throw new Error(`Worker already exists for queue: ${name}`);
  }

  const config = workerConfigs[name];
  const worker = new Worker(name, processor as JobProcessor, config as WorkerOptions);

  worker.on('completed', (job) => {
    // Job completed in queue
    void job;
    void name;
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed in queue ${name}:`, err);
  });

  worker.on('error', (err) => {
    console.error(`Worker error in queue ${name}:`, err);
  });

  workers.set(workerId, worker);
  return worker;
}

/**
 * Close all queues and workers
 */
export async function closeQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const worker of workers.values()) {
    closePromises.push(worker.close());
  }

  for (const queue of queues.values()) {
    closePromises.push(queue.close());
  }

  await Promise.all(closePromises);

  workers.clear();
  queues.clear();
}

/**
 * Queue Health Check
 */
export interface QueueHealth {
  name: QueueNameType;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export async function getQueueHealth(name: QueueNameType): Promise<QueueHealth> {
  const queue = getQueue(name);
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    name,
    waiting,
    active,
    completed,
    failed,
    delayed,
  };
}

/**
 * Get health for all queues
 */
export async function getAllQueuesHealth(): Promise<QueueHealth[]> {
  const queueNames = Object.values(QueueName);
  return Promise.all(queueNames.map((name) => getQueueHealth(name)));
}
