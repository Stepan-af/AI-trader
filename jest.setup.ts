/**
 * Jest Setup
 * Mock Redis for tests
 */

// Mock Redis globally for all tests
jest.mock('@ai-trader/shared', () => {
  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
  };

  return {
    getRedisClient: jest.fn(() => mockRedis),
    closeRedis: jest.fn(),
    QueueName: {},
    getQueue: jest.fn(),
    createWorker: jest.fn(),
    getQueueHealth: jest.fn(),
    getAllQueuesHealth: jest.fn(),
  };
});
