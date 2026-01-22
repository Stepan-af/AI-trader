/**
 * Fill Processing Integration Tests
 * Tests fill deduplication, partial fills, and avg price calculation with database
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { CreateFillParams } from '../repositories/FillRepository';
import type { CreateOrderRequest } from '../services/OrderService';
import { OrderService } from '../services/OrderService';

describe('Fill Processing Integration', () => {
  let pool: Pool;
  let orderService: OrderService;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: Number(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DB || 'ai_trader_test',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
    });

    orderService = new OrderService(pool);

    // Skip tests if database is not available
    try {
      await pool.query('SELECT 1');
    } catch (error) {
      console.warn('Database not available, skipping integration tests');
      await pool.end();
      // Skip all tests in this suite
      return;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('processFill', () => {
    let userId: string;
    let orderId: string;

    beforeEach(async () => {
      // Create unique user for each test
      userId = `user-${randomUUID()}`;

      // Create order for testing
      const request: CreateOrderRequest = {
        userId,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10.0,
        price: 100.0,
      };

      const order = await orderService.createOrder(request);
      orderId = order.id;

      // Transition to OPEN status so it can be filled
      await orderService.transitionOrder({
        orderId,
        newStatus: 'SUBMITTED',
        exchangeOrderId: `exchange-${randomUUID()}`,
      });

      await orderService.transitionOrder({
        orderId,
        newStatus: 'OPEN',
      });
    });

    it('should process first fill and update order to PARTIALLY_FILLED', async () => {
      const fillParams: CreateFillParams = {
        orderId,
        exchangeFillId: `exchange-fill-${randomUUID()}`,
        price: 100.0,
        quantity: 5.0,
        fee: 0.5,
        feeAsset: 'USDT',
        timestamp: new Date(),
        source: 'WEBSOCKET',
      };

      const fill = await orderService.processFill(fillParams);

      expect(fill).not.toBeNull();
      expect(fill?.price).toBe(100.0);
      expect(fill?.quantity).toBe(5.0);

      // Verify order is updated
      const order = await orderService.getOrder(orderId);
      expect(order?.status).toBe('PARTIALLY_FILLED');
      expect(order?.filledQuantity).toBe(5.0);
      expect(order?.avgFillPrice).toBe(100.0);
    });

    it('should return null for duplicate fill (idempotent)', async () => {
      const exchangeFillId = `exchange-fill-${randomUUID()}`;

      const fillParams: CreateFillParams = {
        orderId,
        exchangeFillId,
        price: 100.0,
        quantity: 5.0,
        fee: 0.5,
        feeAsset: 'USDT',
        timestamp: new Date(),
        source: 'WEBSOCKET',
      };

      // First fill should succeed
      const fill1 = await orderService.processFill(fillParams);
      expect(fill1).not.toBeNull();

      // Duplicate fill should return null
      const fill2 = await orderService.processFill(fillParams);
      expect(fill2).toBeNull();

      // Order should still be at 5.0 filled
      const order = await orderService.getOrder(orderId);
      expect(order?.filledQuantity).toBe(5.0);
    });

    it('should calculate average fill price correctly for multiple fills', async () => {
      // First fill at 95.0
      await orderService.processFill({
        orderId,
        exchangeFillId: `exchange-fill-${randomUUID()}`,
        price: 95.0,
        quantity: 3.0,
        fee: 0.3,
        feeAsset: 'USDT',
        timestamp: new Date(),
        source: 'WEBSOCKET',
      });

      // Second fill at 105.0
      await orderService.processFill({
        orderId,
        exchangeFillId: `exchange-fill-${randomUUID()}`,
        price: 105.0,
        quantity: 2.0,
        fee: 0.2,
        feeAsset: 'USDT',
        timestamp: new Date(),
        source: 'WEBSOCKET',
      });

      // Expected avg: (95 * 3 + 105 * 2) / (3 + 2) = 495 / 5 = 99.0
      const order = await orderService.getOrder(orderId);
      expect(order?.filledQuantity).toBe(5.0);
      expect(order?.avgFillPrice).toBeCloseTo(99.0, 2);
    });

    it('should transition to FILLED when order is completely filled', async () => {
      // First partial fill
      await orderService.processFill({
        orderId,
        exchangeFillId: `exchange-fill-${randomUUID()}`,
        price: 100.0,
        quantity: 5.0,
        fee: 0.5,
        feeAsset: 'USDT',
        timestamp: new Date(),
        source: 'WEBSOCKET',
      });

      let order = await orderService.getOrder(orderId);
      expect(order?.status).toBe('PARTIALLY_FILLED');

      // Final fill completes the order
      await orderService.processFill({
        orderId,
        exchangeFillId: `exchange-fill-${randomUUID()}`,
        price: 102.0,
        quantity: 5.0,
        fee: 0.5,
        feeAsset: 'USDT',
        timestamp: new Date(),
        source: 'WEBSOCKET',
      });

      order = await orderService.getOrder(orderId);
      expect(order?.status).toBe('FILLED');
      expect(order?.filledQuantity).toBe(10.0);
      expect(order?.avgFillPrice).toBeCloseTo(101.0, 2); // (100*5 + 102*5)/10
    });

    it('should reject fill that exceeds order quantity', async () => {
      await expect(
        orderService.processFill({
          orderId,
          exchangeFillId: `exchange-fill-${randomUUID()}`,
          price: 100.0,
          quantity: 15.0, // Exceeds order quantity of 10.0
          fee: 0.5,
          feeAsset: 'USDT',
          timestamp: new Date(),
          source: 'WEBSOCKET',
        })
      ).rejects.toThrow('Fill quantity 15 exceeds remaining order quantity');

      // Order should remain OPEN with 0 filled
      const order = await orderService.getOrder(orderId);
      expect(order?.status).toBe('OPEN');
      expect(order?.filledQuantity).toBe(0);
    });

    it('should reject fill for order not in fillable state', async () => {
      // Cancel the order
      await orderService.transitionOrder({
        orderId,
        newStatus: 'CANCELED',
      });

      await expect(
        orderService.processFill({
          orderId,
          exchangeFillId: `exchange-fill-${randomUUID()}`,
          price: 100.0,
          quantity: 5.0,
          fee: 0.5,
          feeAsset: 'USDT',
          timestamp: new Date(),
          source: 'WEBSOCKET',
        })
      ).rejects.toThrow('Cannot fill order in CANCELED status');
    });

    it('should create portfolio event in outbox', async () => {
      const fillParams: CreateFillParams = {
        orderId,
        exchangeFillId: `exchange-fill-${randomUUID()}`,
        price: 100.0,
        quantity: 5.0,
        fee: 0.5,
        feeAsset: 'USDT',
        timestamp: new Date(),
        source: 'WEBSOCKET',
      };

      await orderService.processFill(fillParams);

      // Query outbox table to verify event was created
      const result = await pool.query(
        `SELECT * FROM execution.portfolio_events_outbox WHERE order_id = $1`,
        [orderId]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].event_type).toBe('FILL_PROCESSED');
      expect(result.rows[0].user_id).toBe(userId);
      expect(result.rows[0].symbol).toBe('BTCUSDT');
      expect(result.rows[0].processed_at).toBeNull(); // Not processed yet
    });
  });
});
