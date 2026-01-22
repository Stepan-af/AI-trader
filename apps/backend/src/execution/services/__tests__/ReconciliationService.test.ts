/**
 * Reconciliation Service Tests
 * Tests conflict resolution rules, batch processing, and fill deduplication
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */

import type { Order } from '@ai-trader/shared';
import { jest } from '@jest/globals';
import type { Pool } from 'pg';
import type { BinanceAdapter } from '../../adapters/binance/BinanceAdapter';
import type { BinanceOrderQueryResponse, BinanceTrade } from '../../adapters/binance/types';
import { FillRepository } from '../../repositories/FillRepository';
import { OrderRepository } from '../../repositories/OrderRepository';
import { OrderService } from '../OrderService';
import { ReconciliationService } from '../ReconciliationService';

// Mock dependencies
const mockPool = {} as Pool;

const mockBinanceAdapter = {
  queryOrder: jest.fn<(symbol: string, orderId: number) => Promise<BinanceOrderQueryResponse>>(),
  getOrderTrades: jest.fn<(symbol: string, orderId: number) => Promise<BinanceTrade[]>>(),
} as unknown as BinanceAdapter;

const mockOrderService = {
  transitionOrder: jest.fn(),
} as unknown as OrderService;

const mockOrderRepository = {
  findNonFinalOrders: jest.fn<() => Promise<Order[]>>(),
} as unknown as OrderRepository;

const mockFillRepository = {
  create: jest.fn(),
} as unknown as FillRepository;

describe('ReconciliationService', () => {
  let service: ReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ReconciliationService(
      mockPool,
      mockBinanceAdapter,
      mockOrderService,
      mockOrderRepository,
      mockFillRepository
    );

    // @ts-expect-error - Mock for testing
    mockPool.query = jest.fn().mockResolvedValue({ rows: [] });
  });

  describe('reconcile', () => {
    it('should reconcile orders with exchange state', async () => {
      const mockOrder: Order = {
        id: 'order-1',
        userId: 'user-1',
        strategyId: null,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1.0,
        price: 50000,
        status: 'OPEN',
        filledQuantity: 0,
        avgFillPrice: null,
        exchangeOrderId: '12345',
        createdAt: new Date(),
        updatedAt: new Date(),
        queuedAt: null,
      };

      const mockExchangeOrder: BinanceOrderQueryResponse = {
        symbol: 'BTCUSDT',
        orderId: 12345,
        clientOrderId: 'client-1',
        price: '50000',
        origQty: '1.0',
        executedQty: '0.5',
        cummulativeQuoteQty: '25000',
        status: 'PARTIALLY_FILLED',
        timeInForce: 'GTC',
        type: 'LIMIT',
        side: 'BUY',
        stopPrice: '0',
        time: Date.now(),
        updateTime: Date.now(),
        isWorking: true,
      };

      const mockTrades: BinanceTrade[] = [
        {
          symbol: 'BTCUSDT',
          id: 1,
          orderId: 12345,
          price: '50000',
          qty: '0.5',
          commission: '0.001',
          commissionAsset: 'BTC',
          time: Date.now(),
          isBuyer: true,
          isMaker: false,
          isBestMatch: true,
        },
      ];

      // @ts-expect-error - Mock for testing
      (mockOrderRepository.findNonFinalOrders as jest.Mock).mockResolvedValue([mockOrder]);
      // @ts-expect-error - Mock for testing
      (mockBinanceAdapter.queryOrder as jest.Mock).mockResolvedValue(mockExchangeOrder);
      // @ts-expect-error - Mock for testing
      (mockBinanceAdapter.getOrderTrades as jest.Mock).mockResolvedValue(mockTrades);
      // @ts-expect-error - Mock for testing
      (mockFillRepository.create as jest.Mock).mockResolvedValue({ id: 'fill-1' });

      const result = await service.reconcile('MANUAL');

      expect(result.ordersReconciled).toBe(1);
      expect(result.actionsPerformed).toHaveLength(1);
      expect(result.actionsPerformed[0].action).toBe('FILLS_ADDED');
      expect(result.actionsPerformed[0].fillsAddedCount).toBe(1);
      expect(mockFillRepository.create).toHaveBeenCalledTimes(1);
    });

    it('should update order state when exchange shows final state', async () => {
      const mockOrder: Order = {
        id: 'order-2',
        userId: 'user-1',
        strategyId: null,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1.0,
        price: 50000,
        status: 'OPEN',
        filledQuantity: 0,
        avgFillPrice: null,
        exchangeOrderId: '12346',
        createdAt: new Date(),
        updatedAt: new Date(),
        queuedAt: null,
      };

      const mockExchangeOrder: BinanceOrderQueryResponse = {
        symbol: 'BTCUSDT',
        orderId: 12346,
        clientOrderId: 'client-2',
        price: '50000',
        origQty: '1.0',
        executedQty: '1.0',
        cummulativeQuoteQty: '50000',
        status: 'FILLED',
        timeInForce: 'GTC',
        type: 'LIMIT',
        side: 'BUY',
        stopPrice: '0',
        time: Date.now(),
        updateTime: Date.now(),
        isWorking: false,
      };

      const mockTrades: BinanceTrade[] = [
        {
          symbol: 'BTCUSDT',
          id: 2,
          orderId: 12346,
          price: '50000',
          qty: '1.0',
          commission: '0.002',
          commissionAsset: 'BTC',
          time: Date.now(),
          isBuyer: true,
          isMaker: false,
          isBestMatch: true,
        },
      ];

      // @ts-expect-error - Mock for testing
      (mockOrderRepository.findNonFinalOrders as jest.Mock).mockResolvedValue([mockOrder]);
      // @ts-expect-error - Mock for testing
      (mockBinanceAdapter.queryOrder as jest.Mock).mockResolvedValue(mockExchangeOrder);
      // @ts-expect-error - Mock for testing
      (mockBinanceAdapter.getOrderTrades as jest.Mock).mockResolvedValue(mockTrades);
      // @ts-expect-error - Mock for testing
      (mockFillRepository.create as jest.Mock).mockResolvedValue({ id: 'fill-2' });

      const result = await service.reconcile('MANUAL');

      expect(result.ordersReconciled).toBe(1);
      expect(result.actionsPerformed[0].action).toBe('FILLS_ADDED');
      expect(mockOrderService.transitionOrder).toHaveBeenCalledWith({
        orderId: 'order-2',
        newStatus: 'FILLED',
        metadata: { reconciliation: true },
      });
    });

    it('should handle orders without exchange ID', async () => {
      const mockOrder: Order = {
        id: 'order-3',
        userId: 'user-1',
        strategyId: null,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1.0,
        price: 50000,
        status: 'SUBMITTED',
        filledQuantity: 0,
        avgFillPrice: null,
        exchangeOrderId: null,
        createdAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
        updatedAt: new Date(),
        queuedAt: null,
      };

      // @ts-expect-error - Mock for testing
      (mockOrderRepository.findNonFinalOrders as jest.Mock).mockResolvedValue([mockOrder]);

      const result = await service.reconcile('MANUAL');

      expect(result.ordersReconciled).toBe(1);
      expect(result.actionsPerformed[0].action).toBe('MARKED_REJECTED');
      expect(mockOrderService.transitionOrder).toHaveBeenCalledWith({
        orderId: 'order-3',
        newStatus: 'REJECTED',
        metadata: { reason: 'SUBMISSION_TIMEOUT', reconciliation: true },
      });
    });

    it('should detect critical discrepancies (DB > exchange fills)', async () => {
      const mockOrder: Order = {
        id: 'order-4',
        userId: 'user-1',
        strategyId: null,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1.0,
        price: 50000,
        status: 'PARTIALLY_FILLED',
        filledQuantity: 0.8, // DB shows 0.8
        avgFillPrice: 50000,
        exchangeOrderId: '12347',
        createdAt: new Date(),
        updatedAt: new Date(),
        queuedAt: null,
      };

      const mockExchangeOrder: BinanceOrderQueryResponse = {
        symbol: 'BTCUSDT',
        orderId: 12347,
        clientOrderId: 'client-4',
        price: '50000',
        origQty: '1.0',
        executedQty: '0.5', // Exchange shows 0.5
        cummulativeQuoteQty: '25000',
        status: 'PARTIALLY_FILLED',
        timeInForce: 'GTC',
        type: 'LIMIT',
        side: 'BUY',
        stopPrice: '0',
        time: Date.now(),
        updateTime: Date.now(),
        isWorking: true,
      };

      // @ts-expect-error - Mock for testing
      (mockOrderRepository.findNonFinalOrders as jest.Mock).mockResolvedValue([mockOrder]);
      // @ts-expect-error - Mock for testing
      (mockBinanceAdapter.queryOrder as jest.Mock).mockResolvedValue(mockExchangeOrder);
      // @ts-expect-error - Mock for testing
      (mockBinanceAdapter.getOrderTrades as jest.Mock).mockResolvedValue([]);

      const result = await service.reconcile('MANUAL');

      expect(result.ordersReconciled).toBe(1);
      expect(result.actionsPerformed[0].action).toBe('CRITICAL_DISCREPANCY');
      expect(result.actionsPerformed[0].details).toMatchObject({
        error: 'DB_FILLED_QTY_EXCEEDS_EXCHANGE',
        dbFilledQty: 0.8,
        exchangeFilledQty: 0.5,
      });
    });

    it('should handle duplicate fills gracefully', async () => {
      const mockOrder: Order = {
        id: 'order-5',
        userId: 'user-1',
        strategyId: null,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1.0,
        price: 50000,
        status: 'OPEN',
        filledQuantity: 0,
        avgFillPrice: null,
        exchangeOrderId: '12348',
        createdAt: new Date(),
        updatedAt: new Date(),
        queuedAt: null,
      };

      const mockExchangeOrder: BinanceOrderQueryResponse = {
        symbol: 'BTCUSDT',
        orderId: 12348,
        clientOrderId: 'client-5',
        price: '50000',
        origQty: '1.0',
        executedQty: '0.5',
        cummulativeQuoteQty: '25000',
        status: 'PARTIALLY_FILLED',
        timeInForce: 'GTC',
        type: 'LIMIT',
        side: 'BUY',
        stopPrice: '0',
        time: Date.now(),
        updateTime: Date.now(),
        isWorking: true,
      };

      const mockTrades: BinanceTrade[] = [
        {
          symbol: 'BTCUSDT',
          id: 999,
          orderId: 12348,
          price: '50000',
          qty: '0.5',
          commission: '0.001',
          commissionAsset: 'BTC',
          time: Date.now(),
          isBuyer: true,
          isMaker: false,
          isBestMatch: true,
        },
      ];

      // @ts-expect-error - Mock for testing
      (mockOrderRepository.findNonFinalOrders as jest.Mock).mockResolvedValue([mockOrder]);
      // @ts-expect-error - Mock for testing
      (mockBinanceAdapter.queryOrder as jest.Mock).mockResolvedValue(mockExchangeOrder);
      // @ts-expect-error - Mock for testing
      (mockBinanceAdapter.getOrderTrades as jest.Mock).mockResolvedValue(mockTrades);

      // Simulate duplicate fill error
      (mockFillRepository.create as jest.Mock).mockRejectedValueOnce(
        // @ts-expect-error - Mock error for testing
        new Error('duplicate key value violates unique constraint "fills_exchange_fill_id"')
      );

      const result = await service.reconcile('MANUAL');

      // Should not count as added fill since it was duplicate
      expect(result.ordersReconciled).toBe(1);
      expect(result.actionsPerformed[0].fillsAddedCount).toBe(0);
    });

    it('should prevent concurrent reconciliation', async () => {
      // @ts-expect-error - Mock for testing
      (mockOrderRepository.findNonFinalOrders as jest.Mock).mockResolvedValue([]);

      // Start first reconciliation
      const promise1 = service.reconcile('PERIODIC');

      // Try to start second reconciliation
      await expect(service.reconcile('PERIODIC')).rejects.toThrow('Reconciliation already in progress');

      // Wait for first to complete
      await promise1;
    });
  });

  describe('start/stop', () => {
    it('should start and stop periodic reconciliation', () => {
      jest.useFakeTimers();

      service.start();

      // Should not throw
      expect(() => service.stop()).not.toThrow();

      jest.useRealTimers();
    });
  });
});
