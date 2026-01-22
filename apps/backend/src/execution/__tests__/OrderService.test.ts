/**
 * Order Service Unit Tests
 * Tests order state machine logic, validations, and event persistence
 */

/* eslint-disable @typescript-eslint/unbound-method */

import type { Order } from '@ai-trader/shared';
import type { Pool, PoolClient } from 'pg';
import { OrderEventRepository } from '../repositories/OrderEventRepository';
import { OrderRepository } from '../repositories/OrderRepository';
import { OrderService } from '../services/OrderService';

// Mock repositories
jest.mock('../repositories/OrderRepository');
jest.mock('../repositories/OrderEventRepository');

describe('OrderService', () => {
  let service: OrderService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;
  let mockOrderRepo: jest.Mocked<OrderRepository>;
  let mockEventRepo: jest.Mocked<OrderEventRepository>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock pool and client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
    } as unknown as jest.Mocked<Pool>;

    // Setup service
    service = new OrderService(mockPool);

    // Get mocked repository instances
    mockOrderRepo = (OrderRepository as jest.MockedClass<typeof OrderRepository>).mock
      .instances[0] as jest.Mocked<OrderRepository>;
    mockEventRepo = (OrderEventRepository as jest.MockedClass<typeof OrderEventRepository>).mock
      .instances[0] as jest.Mocked<OrderEventRepository>;
  });

  describe('createOrder', () => {
    const validRequest = {
      userId: 'user-123',
      symbol: 'BTCUSDT',
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      quantity: 0.1,
      price: 50000,
    };

    it('should create order in NEW status with CREATED event', async () => {
      const mockOrder: Order = {
        id: 'order-123',
        userId: 'user-123',
        strategyId: null,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 0.1,
        price: 50000,
        status: 'NEW',
        filledQuantity: 0,
        avgFillPrice: null,
        exchangeOrderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        queuedAt: null,
      };

      mockOrderRepo.create.mockResolvedValue(mockOrder);
      mockEventRepo.create.mockResolvedValue({
        id: 'event-123',
        orderId: 'order-123',
        eventType: 'CREATED',
        data: {},
        sequenceNumber: 1,
        timestamp: new Date(),
      });

      const result = await service.createOrder(validRequest);

      expect(result).toEqual(mockOrder);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockOrderRepo.create).toHaveBeenCalledWith(
        {
          userId: 'user-123',
          strategyId: null,
          symbol: 'BTCUSDT',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 0.1,
          price: 50000,
        },
        mockClient
      );
      expect(mockEventRepo.create).toHaveBeenCalledWith(
        {
          orderId: 'order-123',
          eventType: 'CREATED',
          data: expect.objectContaining({
            userId: 'user-123',
            symbol: 'BTCUSDT',
          }) as Record<string, unknown>,
          sequenceNumber: 1,
        },
        mockClient
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on failure', async () => {
      mockOrderRepo.create.mockRejectedValue(new Error('DB error'));

      await expect(service.createOrder(validRequest)).rejects.toThrow('DB error');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should reject invalid userId', async () => {
      await expect(service.createOrder({ ...validRequest, userId: '' })).rejects.toThrow(
        'userId is required'
      );
    });

    it('should reject invalid symbol', async () => {
      await expect(service.createOrder({ ...validRequest, symbol: '' })).rejects.toThrow(
        'symbol is required'
      );
    });

    it('should reject invalid side', async () => {
      await expect(
        service.createOrder({ ...validRequest, side: 'INVALID' as 'BUY' })
      ).rejects.toThrow('side must be BUY or SELL');
    });

    it('should reject invalid quantity', async () => {
      await expect(service.createOrder({ ...validRequest, quantity: 0 })).rejects.toThrow(
        'quantity must be greater than 0'
      );

      await expect(service.createOrder({ ...validRequest, quantity: -1 })).rejects.toThrow(
        'quantity must be greater than 0'
      );
    });

    it('should reject LIMIT order without price', async () => {
      await expect(service.createOrder({ ...validRequest, price: undefined })).rejects.toThrow(
        'price is required for LIMIT orders'
      );
    });

    it('should reject LIMIT order with invalid price', async () => {
      await expect(service.createOrder({ ...validRequest, price: -1 })).rejects.toThrow(
        'price must be greater than 0'
      );
    });

    it('should allow MARKET order without price', async () => {
      const mockOrder: Order = {
        id: 'order-123',
        userId: 'user-123',
        strategyId: null,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.1,
        price: null,
        status: 'NEW',
        filledQuantity: 0,
        avgFillPrice: null,
        exchangeOrderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        queuedAt: null,
      };

      mockOrderRepo.create.mockResolvedValue(mockOrder);
      mockEventRepo.create.mockResolvedValue({
        id: 'event-123',
        orderId: 'order-123',
        eventType: 'CREATED',
        data: {},
        sequenceNumber: 1,
        timestamp: new Date(),
      });

      const result = await service.createOrder({
        ...validRequest,
        type: 'MARKET',
        price: undefined,
      });

      expect(result.type).toBe('MARKET');
      expect(result.price).toBeNull();
    });
  });

  describe('transitionOrder', () => {
    const mockOrder: Order = {
      id: 'order-123',
      userId: 'user-123',
      strategyId: null,
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 0.1,
      price: 50000,
      status: 'NEW',
      filledQuantity: 0,
      avgFillPrice: null,
      exchangeOrderId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      queuedAt: null,
    };

    beforeEach(() => {
      mockOrderRepo.findById.mockResolvedValue(mockOrder);
      mockEventRepo.getNextSequenceNumber.mockResolvedValue(2);
    });

    it('should transition NEW → SUBMITTED', async () => {
      const updatedOrder = { ...mockOrder, status: 'SUBMITTED' as const };
      mockOrderRepo.updateStatus.mockResolvedValue(updatedOrder);
      mockEventRepo.create.mockResolvedValue({
        id: 'event-123',
        orderId: 'order-123',
        eventType: 'SUBMITTED',
        data: {},
        sequenceNumber: 2,
        timestamp: new Date(),
      });

      const result = await service.transitionOrder({
        orderId: 'order-123',
        newStatus: 'SUBMITTED',
        exchangeOrderId: 'exchange-123',
      });

      expect(result.status).toBe('SUBMITTED');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith(
        {
          id: 'order-123',
          status: 'SUBMITTED',
          exchangeOrderId: 'exchange-123',
        },
        mockClient
      );
      expect(mockEventRepo.create).toHaveBeenCalledWith(
        {
          orderId: 'order-123',
          eventType: 'SUBMITTED',
          data: {},
          sequenceNumber: 2,
        },
        mockClient
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should transition SUBMITTED → OPEN', async () => {
      mockOrderRepo.findById.mockResolvedValue({ ...mockOrder, status: 'SUBMITTED' });
      const updatedOrder = { ...mockOrder, status: 'OPEN' as const };
      mockOrderRepo.updateStatus.mockResolvedValue(updatedOrder);

      const result = await service.transitionOrder({
        orderId: 'order-123',
        newStatus: 'OPEN',
      });

      expect(result.status).toBe('OPEN');
    });

    it('should transition OPEN → PARTIALLY_FILLED', async () => {
      mockOrderRepo.findById.mockResolvedValue({ ...mockOrder, status: 'OPEN' });
      const updatedOrder = { ...mockOrder, status: 'PARTIALLY_FILLED' as const };
      mockOrderRepo.updateStatus.mockResolvedValue(updatedOrder);

      const result = await service.transitionOrder({
        orderId: 'order-123',
        newStatus: 'PARTIALLY_FILLED',
      });

      expect(result.status).toBe('PARTIALLY_FILLED');
    });

    it('should transition PARTIALLY_FILLED → FILLED', async () => {
      mockOrderRepo.findById.mockResolvedValue({ ...mockOrder, status: 'PARTIALLY_FILLED' });
      const updatedOrder = { ...mockOrder, status: 'FILLED' as const };
      mockOrderRepo.updateStatus.mockResolvedValue(updatedOrder);

      const result = await service.transitionOrder({
        orderId: 'order-123',
        newStatus: 'FILLED',
      });

      expect(result.status).toBe('FILLED');
    });

    it('should transition OPEN → CANCELED', async () => {
      mockOrderRepo.findById.mockResolvedValue({ ...mockOrder, status: 'OPEN' });
      const updatedOrder = { ...mockOrder, status: 'CANCELED' as const };
      mockOrderRepo.updateStatus.mockResolvedValue(updatedOrder);

      const result = await service.transitionOrder({
        orderId: 'order-123',
        newStatus: 'CANCELED',
      });

      expect(result.status).toBe('CANCELED');
    });

    it('should reject invalid transition FILLED → OPEN', async () => {
      mockOrderRepo.findById.mockResolvedValue({ ...mockOrder, status: 'FILLED' });

      await expect(
        service.transitionOrder({
          orderId: 'order-123',
          newStatus: 'OPEN',
        })
      ).rejects.toThrow('Invalid transition from FILLED to OPEN');
    });

    it('should reject invalid transition CANCELED → OPEN', async () => {
      mockOrderRepo.findById.mockResolvedValue({ ...mockOrder, status: 'CANCELED' });

      await expect(
        service.transitionOrder({
          orderId: 'order-123',
          newStatus: 'OPEN',
        })
      ).rejects.toThrow('Invalid transition from CANCELED to OPEN');
    });

    it('should reject invalid transition NEW → OPEN', async () => {
      await expect(
        service.transitionOrder({
          orderId: 'order-123',
          newStatus: 'OPEN',
        })
      ).rejects.toThrow('Invalid transition from NEW to OPEN');
    });

    it('should throw if order not found', async () => {
      mockOrderRepo.findById.mockResolvedValue(null);

      await expect(
        service.transitionOrder({
          orderId: 'non-existent',
          newStatus: 'SUBMITTED',
        })
      ).rejects.toThrow('Order not found: non-existent');
    });

    it('should rollback on failure', async () => {
      mockOrderRepo.updateStatus.mockRejectedValue(new Error('DB error'));

      await expect(
        service.transitionOrder({
          orderId: 'order-123',
          newStatus: 'SUBMITTED',
        })
      ).rejects.toThrow('DB error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should include metadata in event data', async () => {
      const updatedOrder = { ...mockOrder, status: 'SUBMITTED' as const };
      mockOrderRepo.updateStatus.mockResolvedValue(updatedOrder);
      mockEventRepo.create.mockResolvedValue({
        id: 'event-123',
        orderId: 'order-123',
        eventType: 'SUBMITTED',
        data: { reason: 'test' },
        sequenceNumber: 2,
        timestamp: new Date(),
      });

      await service.transitionOrder({
        orderId: 'order-123',
        newStatus: 'SUBMITTED',
        metadata: { reason: 'test' },
      });

      expect(mockEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { reason: 'test' },
        }),
        mockClient
      );
    });
  });

  describe('getOrder', () => {
    it('should return order by ID', async () => {
      const mockOrder: Order = {
        id: 'order-123',
        userId: 'user-123',
        strategyId: null,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 0.1,
        price: 50000,
        status: 'NEW',
        filledQuantity: 0,
        avgFillPrice: null,
        exchangeOrderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        queuedAt: null,
      };

      mockOrderRepo.findById.mockResolvedValue(mockOrder);

      const result = await service.getOrder('order-123');

      expect(result).toEqual(mockOrder);
      expect(mockOrderRepo.findById).toHaveBeenCalledWith('order-123');
    });

    it('should return null if order not found', async () => {
      mockOrderRepo.findById.mockResolvedValue(null);

      const result = await service.getOrder('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getUserOrders', () => {
    it('should return user orders with pagination', async () => {
      const mockOrders: Order[] = [
        {
          id: 'order-1',
          userId: 'user-123',
          strategyId: null,
          symbol: 'BTCUSDT',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 0.1,
          price: 50000,
          status: 'NEW',
          filledQuantity: 0,
          avgFillPrice: null,
          exchangeOrderId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          queuedAt: null,
        },
      ];

      mockOrderRepo.findByUserId.mockResolvedValue(mockOrders);

      const result = await service.getUserOrders('user-123', 50, 10);

      expect(result).toEqual(mockOrders);
      expect(mockOrderRepo.findByUserId).toHaveBeenCalledWith('user-123', 50, 10);
    });
  });
});
