/**
 * Idempotency Middleware Tests
 * Tests critical idempotency logic for money-safety
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import type { Request, Response, NextFunction } from 'express';
import { requireIdempotency } from '../idempotency';

// Mock Redis
let mockRedisData: Map<string, string>;

jest.mock('@ai-trader/shared', () => ({
  getRedisClient: jest.fn(() => ({
    get: jest.fn((key: string) => Promise.resolve(mockRedisData.get(key) || null)),
    setex: jest.fn((key: string, _ttl: number, value: string) => {
      mockRedisData.set(key, value);
      return Promise.resolve('OK');
    }),
  })),
}));

describe('Idempotency Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRedisData = new Map();

    mockRequest = {
      method: 'POST',
      headers: {},
      user: {
        userId: 'test-user-123',
        email: 'test@example.com',
      },
    };

    const jsonMock = jest.fn();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jsonMock,
      setHeader: jest.fn(),
      getHeader: jest.fn(() => 'application/json'),
      statusCode: 200,
    };

    mockNext = jest.fn();
  });

  describe('Idempotency-Key validation', () => {
    it('should require Idempotency-Key for POST requests', () => {
      requireIdempotency(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required for POST/PUT requests',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should require Idempotency-Key for PUT requests', () => {
      mockRequest.method = 'PUT';

      requireIdempotency(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should skip idempotency check for GET requests', () => {
      mockRequest.method = 'GET';

      requireIdempotency(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject invalid UUID format', () => {
      mockRequest.headers = {
        'idempotency-key': 'not-a-uuid',
      };

      requireIdempotency(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be a valid UUID v4',
      });
    });

    it('should accept valid UUID v4', async () => {
      mockRequest.headers = {
        'idempotency-key': '550e8400-e29b-41d4-a716-446655440000',
      };

      requireIdempotency(mockRequest as Request, mockResponse as Response, mockNext);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require authentication for idempotent requests', () => {
      mockRequest.headers = {
        'idempotency-key': '550e8400-e29b-41d4-a716-446655440000',
      };
      mockRequest.user = undefined;

      requireIdempotency(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Authentication required for write operations',
      });
    });
  });

  describe('Idempotency behavior - money-safety', () => {
    it('should return cached response for duplicate request', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      // Simulate existing cached response
      const cachedResponse = {
        status: 201,
        headers: { 'content-type': 'application/json' },
        body: { id: 'order-123', status: 'CREATED' },
        timestamp: new Date().toISOString(),
      };
      mockRedisData.set(
        `idempotency:test-user-123:${idempotencyKey}`,
        JSON.stringify(cachedResponse)
      );

      requireIdempotency(mockRequest as Request, mockResponse as Response, mockNext);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should return cached response, not call next
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(cachedResponse.body);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should process new request and cache response', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      requireIdempotency(mockRequest as Request, mockResponse as Response, mockNext);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should proceed with request
      expect(mockNext).toHaveBeenCalled();

      // In-progress marker should be set
      const redisKey = `idempotency:test-user-123:${idempotencyKey}`;
      const stored = mockRedisData.get(redisKey);
      expect(stored).toBeDefined();

      const record = JSON.parse(stored!);
      expect(record.status).toBe(0); // 0 = in-progress
    });
  });
});
