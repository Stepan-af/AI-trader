/**
 * AI Trader Backend - Entry Point
 * Placeholder for future service initialization
 */

import type { Order } from '@ai-trader/shared';

console.log('AI Trader Backend - MVP Foundation');
console.log('Shared types imported successfully');

// Type check to verify shared types work
const exampleOrder: Order = {
  id: 'test-order-1',
  userId: 'user-1',
  strategyId: null,
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: 0.01,
  price: null,
  status: 'NEW',
  filledQuantity: 0,
  avgFillPrice: null,
  exchangeOrderId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  queuedAt: null,
};

console.log('Example order:', exampleOrder.id);
