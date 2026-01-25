/**
 * Portfolio Service Tests
 * Tests position tracking, version increments, and event processing
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */

import type { Position, PortfolioEventOutbox } from '@ai-trader/shared';
import { jest } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';
import type { PositionRepository } from '../../repositories/PositionRepository';
import type { PortfolioEventOutboxRepository } from '../../repositories/PortfolioEventOutboxRepository';
import { PortfolioService } from '../PortfolioService';

// Mock dependencies
const connectMock = jest.fn<() => Promise<PoolClient>>();
const poolQueryMock = jest.fn<() => Promise<{ rows: unknown[] }>>();

const mockPool = {
  connect: connectMock,
  query: poolQueryMock,
} as unknown as Pool;

const clientQueryMock = jest.fn<() => Promise<{ rows: unknown[] }>>();
const clientReleaseMock = jest.fn<() => void>();

const mockClient = {
  query: clientQueryMock,
  release: clientReleaseMock,
} as unknown as PoolClient;

const findByUserAndSymbolMock = jest.fn<() => Promise<Position | null>>();
const createPositionMock = jest.fn<() => Promise<Position>>();
const updatePositionMock = jest.fn<() => Promise<Position>>();

const mockPositionRepository = {
  findByUserAndSymbol: findByUserAndSymbolMock,
  create: createPositionMock,
  update: updatePositionMock,
} as unknown as PositionRepository;

const getUnprocessedEventsMock = jest.fn<() => Promise<PortfolioEventOutbox[]>>();
const markAsProcessedMock = jest.fn<() => Promise<void>>();

const mockOutboxRepository = {
  getUnprocessedEvents: getUnprocessedEventsMock,
  markAsProcessed: markAsProcessedMock,
} as unknown as PortfolioEventOutboxRepository;

describe('PortfolioService', () => {
  let service: PortfolioService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new PortfolioService(mockPool);

    // Replace repositories with mocks
    // @ts-expect-error - Replacing private property for testing
    service['positionRepository'] = mockPositionRepository;
    // @ts-expect-error - Replacing private property for testing
    service['outboxRepository'] = mockOutboxRepository;

    // Setup default pool.connect behavior
    connectMock.mockResolvedValue(mockClient);
    clientQueryMock.mockResolvedValue({ rows: [] });
  });

  describe('processOutboxEvents', () => {
    it('should process all unprocessed events', async () => {
      const events: PortfolioEventOutbox[] = [
        {
          id: 'event-1',
          eventType: 'FILL_PROCESSED',
          userId: 'user-1',
          symbol: 'BTCUSDT',
          orderId: 'order-1',
          fillId: 'fill-1',
          data: { side: 'BUY', quantity: 0.01, price: 50000 },
          createdAt: new Date(),
          processedAt: null,
        },
        {
          id: 'event-2',
          eventType: 'FILL_PROCESSED',
          userId: 'user-1',
          symbol: 'BTCUSDT',
          orderId: 'order-2',
          fillId: 'fill-2',
          data: { side: 'BUY', quantity: 0.02, price: 51000 },
          createdAt: new Date(),
          processedAt: null,
        },
      ];

      getUnprocessedEventsMock.mockResolvedValue(events);
      findByUserAndSymbolMock.mockResolvedValue(null);
      createPositionMock.mockResolvedValue({
        id: 'pos-1',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        quantity: 0.01,
        avgEntryPrice: 50000,
        version: 1,
        updatedAt: new Date(),
      });

      const processed = await service.processOutboxEvents();

      expect(processed).toBe(2);
      expect(getUnprocessedEventsMock).toHaveBeenCalledWith(100);
      expect(markAsProcessedMock).toHaveBeenCalledTimes(2);
      expect(clientQueryMock).toHaveBeenCalledWith('BEGIN');
      expect(clientQueryMock).toHaveBeenCalledWith('COMMIT');
    });

    it('should return 0 when no events to process', async () => {
      getUnprocessedEventsMock.mockResolvedValue([]);

      const processed = await service.processOutboxEvents();

      expect(processed).toBe(0);
      expect(markAsProcessedMock).not.toHaveBeenCalled();
    });
  });

  describe('fill event processing', () => {
    it('should create new position on first BUY fill', async () => {
      const event: PortfolioEventOutbox = {
        id: 'event-1',
        eventType: 'FILL_PROCESSED',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        orderId: 'order-1',
        fillId: 'fill-1',
        data: { side: 'BUY', quantity: 0.01, price: 50000 },
        createdAt: new Date(),
        processedAt: null,
      };

      getUnprocessedEventsMock.mockResolvedValue([event]);
      findByUserAndSymbolMock.mockResolvedValue(null);
      createPositionMock.mockResolvedValue({
        id: 'pos-1',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        quantity: 0.01,
        avgEntryPrice: 50000,
        version: 1,
        updatedAt: new Date(),
      });

      await service.processOutboxEvents();

      expect(createPositionMock).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          symbol: 'BTCUSDT',
          quantity: 0.01,
          avgEntryPrice: 50000,
        },
        mockClient
      );
      expect(updatePositionMock).not.toHaveBeenCalled();
    });

    it('should create negative position on first SELL fill', async () => {
      const event: PortfolioEventOutbox = {
        id: 'event-1',
        eventType: 'FILL_PROCESSED',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        orderId: 'order-1',
        fillId: 'fill-1',
        data: { side: 'SELL', quantity: 0.01, price: 50000 },
        createdAt: new Date(),
        processedAt: null,
      };

      getUnprocessedEventsMock.mockResolvedValue([event]);
      findByUserAndSymbolMock.mockResolvedValue(null);
      createPositionMock.mockResolvedValue({
        id: 'pos-1',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        quantity: -0.01,
        avgEntryPrice: 50000,
        version: 1,
        updatedAt: new Date(),
      });

      await service.processOutboxEvents();

      expect(createPositionMock).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          symbol: 'BTCUSDT',
          quantity: -0.01,
          avgEntryPrice: 50000,
        },
        mockClient
      );
    });

    it('should update position and increment version on BUY fill', async () => {
      const existingPosition: Position = {
        id: 'pos-1',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        quantity: 0.01,
        avgEntryPrice: 50000,
        version: 1,
        updatedAt: new Date(),
      };

      const event: PortfolioEventOutbox = {
        id: 'event-1',
        eventType: 'FILL_PROCESSED',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        orderId: 'order-1',
        fillId: 'fill-1',
        data: { side: 'BUY', quantity: 0.01, price: 51000 },
        createdAt: new Date(),
        processedAt: null,
      };

      getUnprocessedEventsMock.mockResolvedValue([event]);
      findByUserAndSymbolMock.mockResolvedValue(existingPosition);
      updatePositionMock.mockResolvedValue({
        ...existingPosition,
        quantity: 0.02,
        avgEntryPrice: 50500, // (0.01 * 50000 + 0.01 * 51000) / 0.02
        version: 2,
      });

      await service.processOutboxEvents();

      expect(updatePositionMock).toHaveBeenCalledWith(
        {
          id: 'pos-1',
          quantity: 0.02,
          avgEntryPrice: 50500,
          expectedVersion: 1,
        },
        mockClient
      );
      expect(createPositionMock).not.toHaveBeenCalled();
    });

    it('should reduce position on SELL fill without changing avg price', async () => {
      const existingPosition: Position = {
        id: 'pos-1',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        quantity: 0.02,
        avgEntryPrice: 50000,
        version: 1,
        updatedAt: new Date(),
      };

      const event: PortfolioEventOutbox = {
        id: 'event-1',
        eventType: 'FILL_PROCESSED',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        orderId: 'order-1',
        fillId: 'fill-1',
        data: { side: 'SELL', quantity: 0.01, price: 51000 },
        createdAt: new Date(),
        processedAt: null,
      };

      getUnprocessedEventsMock.mockResolvedValue([event]);
      findByUserAndSymbolMock.mockResolvedValue(existingPosition);
      updatePositionMock.mockResolvedValue({
        ...existingPosition,
        quantity: 0.01,
        avgEntryPrice: 50000, // Unchanged on SELL
        version: 2,
      });

      await service.processOutboxEvents();

      expect(updatePositionMock).toHaveBeenCalledWith(
        {
          id: 'pos-1',
          quantity: 0.01,
          avgEntryPrice: 50000, // Should not change on SELL
          expectedVersion: 1,
        },
        mockClient
      );
    });

    it('should handle ORDER_CANCELED events without position updates', async () => {
      const event: PortfolioEventOutbox = {
        id: 'event-1',
        eventType: 'ORDER_CANCELED',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        orderId: 'order-1',
        fillId: null,
        data: {},
        createdAt: new Date(),
        processedAt: null,
      };

      getUnprocessedEventsMock.mockResolvedValue([event]);

      await service.processOutboxEvents();

      expect(findByUserAndSymbolMock).not.toHaveBeenCalled();
      expect(createPositionMock).not.toHaveBeenCalled();
      expect(updatePositionMock).not.toHaveBeenCalled();
      expect(markAsProcessedMock).toHaveBeenCalledWith('event-1', mockClient);
    });

    it('should rollback transaction on error', async () => {
      const event: PortfolioEventOutbox = {
        id: 'event-1',
        eventType: 'FILL_PROCESSED',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        orderId: 'order-1',
        fillId: 'fill-1',
        data: { side: 'BUY', quantity: 0.01, price: 50000 },
        createdAt: new Date(),
        processedAt: null,
      };

      getUnprocessedEventsMock.mockResolvedValue([event]);
      findByUserAndSymbolMock.mockRejectedValue(new Error('Database error'));

      await expect(service.processOutboxEvents()).rejects.toThrow('Database error');

      expect(clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(clientReleaseMock).toHaveBeenCalled();
      expect(markAsProcessedMock).not.toHaveBeenCalled();
    });
  });

  describe('average entry price calculation', () => {
    it('should calculate weighted average on multiple BUY fills', async () => {
      // First fill: BUY 0.01 @ 50000
      const position1: Position = {
        id: 'pos-1',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        quantity: 0.01,
        avgEntryPrice: 50000,
        version: 1,
        updatedAt: new Date(),
      };

      // Second fill: BUY 0.02 @ 51000
      // Expected: (0.01 * 50000 + 0.02 * 51000) / 0.03 = 50666.67
      const event: PortfolioEventOutbox = {
        id: 'event-1',
        eventType: 'FILL_PROCESSED',
        userId: 'user-1',
        symbol: 'BTCUSDT',
        orderId: 'order-1',
        fillId: 'fill-1',
        data: { side: 'BUY', quantity: 0.02, price: 51000 },
        createdAt: new Date(),
        processedAt: null,
      };

      getUnprocessedEventsMock.mockResolvedValue([event]);
      findByUserAndSymbolMock.mockResolvedValue(position1);
      updatePositionMock.mockResolvedValue({
        ...position1,
        quantity: 0.03,
        avgEntryPrice: 50666.666666666664,
        version: 2,
      });

      await service.processOutboxEvents();

      expect(updatePositionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 0.03,
          avgEntryPrice: expect.closeTo(50666.67, 0.01),
        }),
        mockClient
      );
    });
  });
});
