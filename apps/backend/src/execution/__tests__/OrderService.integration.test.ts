/**
 * Order Service Integration Tests
 * Tests database persistence, transactions, and event ordering
 *
 * These tests require a running PostgreSQL database with migrations applied.
 * Set TEST_DATABASE_URL environment variable to run integration tests.
 */

import { Pool } from 'pg';
import { OrderService } from '../services/OrderService';
import { OrderRepository } from '../repositories/OrderRepository';
import { OrderEventRepository } from '../repositories/OrderEventRepository';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const describeIf = TEST_DATABASE_URL ? describe : describe.skip;

describeIf('OrderService Integration Tests', () => {
  let pool: Pool;
  let service: OrderService;
  let orderRepo: OrderRepository;
  let eventRepo: OrderEventRepository;

  beforeAll(() => {
    if (!TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL not set');
    }

    pool = new Pool({
      connectionString: TEST_DATABASE_URL,
      max: 5,
    });

    service = new OrderService(pool);
    orderRepo = new OrderRepository(pool);
    eventRepo = new OrderEventRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await pool.query('DELETE FROM execution.order_events');
    await pool.query('DELETE FROM execution.fills');
    await pool.query('DELETE FROM execution.portfolio_events_outbox');
    await pool.query('DELETE FROM execution.orders');
  });

  describe('Order Creation with Events', () => {
    it('should create order and CREATED event atomically', async () => {
      const request = {
        userId: 'test-user-1',
        symbol: 'BTCUSDT',
        side: 'BUY' as const,
        type: 'LIMIT' as const,
        quantity: 0.1,
        price: 50000,
      };

      const order = await service.createOrder(request);

      // Verify order was created
      expect(order.id).toBeDefined();
      expect(order.status).toBe('NEW');
      expect(order.userId).toBe('test-user-1');
      expect(order.symbol).toBe('BTCUSDT');
      expect(order.quantity).toBe(0.1);
      expect(order.price).toBe(50000);

      // Verify order exists in database
      const dbOrder = await orderRepo.findById(order.id);
      expect(dbOrder).not.toBeNull();
      expect(dbOrder?.status).toBe('NEW');

      // Verify CREATED event was persisted
      const events = await eventRepo.findByOrderId(order.id);
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('CREATED');
      expect(events[0].sequenceNumber).toBe(1);
      expect(events[0].data).toMatchObject({
        userId: 'test-user-1',
        symbol: 'BTCUSDT',
      });
    });

    it('should create multiple orders independently', async () => {
      const order1 = await service.createOrder({
        userId: 'test-user-1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.1,
      });

      const order2 = await service.createOrder({
        userId: 'test-user-1',
        symbol: 'ETHUSDT',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 1.0,
        price: 3000,
      });

      expect(order1.id).not.toBe(order2.id);
      expect(order1.symbol).toBe('BTCUSDT');
      expect(order2.symbol).toBe('ETHUSDT');

      const events1 = await eventRepo.findByOrderId(order1.id);
      const events2 = await eventRepo.findByOrderId(order2.id);

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });
  });

  describe('State Transitions with Events', () => {
    let orderId: string;

    beforeEach(async () => {
      const order = await service.createOrder({
        userId: 'test-user-1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 0.1,
        price: 50000,
      });
      orderId = order.id;
    });

    it('should transition NEW → SUBMITTED with event', async () => {
      const updated = await service.transitionOrder({
        orderId,
        newStatus: 'SUBMITTED',
        exchangeOrderId: 'exchange-123',
      });

      expect(updated.status).toBe('SUBMITTED');
      expect(updated.exchangeOrderId).toBe('exchange-123');

      // Verify events sequence
      const events = await eventRepo.findByOrderId(orderId);
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('CREATED');
      expect(events[0].sequenceNumber).toBe(1);
      expect(events[1].eventType).toBe('SUBMITTED');
      expect(events[1].sequenceNumber).toBe(2);
    });

    it('should transition through full lifecycle with events', async () => {
      // NEW → SUBMITTED
      await service.transitionOrder({
        orderId,
        newStatus: 'SUBMITTED',
        exchangeOrderId: 'exchange-123',
      });

      // SUBMITTED → OPEN
      await service.transitionOrder({
        orderId,
        newStatus: 'OPEN',
      });

      // OPEN → PARTIALLY_FILLED
      await service.transitionOrder({
        orderId,
        newStatus: 'PARTIALLY_FILLED',
        metadata: { fillQuantity: 0.05 },
      });

      // PARTIALLY_FILLED → FILLED
      const final = await service.transitionOrder({
        orderId,
        newStatus: 'FILLED',
        metadata: { fillQuantity: 0.05 },
      });

      expect(final.status).toBe('FILLED');

      // Verify complete event history
      const events = await eventRepo.findByOrderId(orderId);
      expect(events).toHaveLength(5); // CREATED + 4 transitions
      expect(events.map((e) => e.eventType)).toEqual([
        'CREATED',
        'SUBMITTED',
        'OPENED',
        'PARTIAL_FILL',
        'FILLED',
      ]);
      expect(events.map((e) => e.sequenceNumber)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should transition to CANCELED with event', async () => {
      await service.transitionOrder({
        orderId,
        newStatus: 'SUBMITTED',
      });

      await service.transitionOrder({
        orderId,
        newStatus: 'OPEN',
      });

      const canceled = await service.transitionOrder({
        orderId,
        newStatus: 'CANCELED',
        metadata: { reason: 'User requested' },
      });

      expect(canceled.status).toBe('CANCELED');

      const events = await eventRepo.findByOrderId(orderId);
      const cancelEvent = events.find((e) => e.eventType === 'CANCELED');
      expect(cancelEvent).toBeDefined();
      expect(cancelEvent?.data).toMatchObject({ reason: 'User requested' });
    });
  });

  describe('Transaction Rollback', () => {
    it('should rollback order and event on constraint violation', async () => {
      const request = {
        userId: 'test-user-1',
        symbol: 'BTCUSDT',
        side: 'BUY' as const,
        type: 'LIMIT' as const,
        quantity: 0.1,
        price: -100, // Invalid: price cannot be negative (would fail check constraint)
      };

      // This should fail due to database constraints
      // Note: Our validation prevents this, but testing transaction rollback
      await expect(
        pool.query(
          `
          BEGIN;
          INSERT INTO execution.orders (user_id, symbol, side, type, quantity, price, status, filled_quantity)
          VALUES ($1, $2, $3, $4, $5, $6, 'NEW', 0);
          COMMIT;
        `,
          [
            request.userId,
            request.symbol,
            request.side,
            request.type,
            request.quantity,
            request.price,
          ]
        )
      ).rejects.toThrow();

      // Verify no orders were created
      const orders = await orderRepo.findByUserId('test-user-1');
      expect(orders).toHaveLength(0);
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Create test orders
      await service.createOrder({
        userId: 'test-user-1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.1,
      });

      await service.createOrder({
        userId: 'test-user-1',
        symbol: 'ETHUSDT',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 1.0,
        price: 3000,
      });

      await service.createOrder({
        userId: 'test-user-2',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.2,
      });
    });

    it('should get orders by user ID', async () => {
      const user1Orders = await service.getUserOrders('test-user-1');
      const user2Orders = await service.getUserOrders('test-user-2');

      expect(user1Orders).toHaveLength(2);
      expect(user2Orders).toHaveLength(1);

      expect(user1Orders.every((o) => o.userId === 'test-user-1')).toBe(true);
      expect(user2Orders.every((o) => o.userId === 'test-user-2')).toBe(true);
    });

    it('should paginate user orders', async () => {
      const page1 = await service.getUserOrders('test-user-1', 1, 0);
      const page2 = await service.getUserOrders('test-user-1', 1, 1);

      expect(page1).toHaveLength(1);
      expect(page2).toHaveLength(1);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });
});
