// Order types - extends shared domain types with API-specific fields

import type { Fill, Order, OrderSide, OrderStatus, OrderType } from '@ai-trader/shared';

export type { Fill, Order, OrderSide, OrderStatus, OrderType };

// API response types
export interface OrderResponse extends Omit<Order, 'createdAt' | 'updatedAt' | 'queuedAt'> {
  createdAt: string;
  updatedAt: string;
  queuedAt: string | null;
}

export interface FillResponse extends Omit<Fill, 'timestamp'> {
  timestamp: string;
}
