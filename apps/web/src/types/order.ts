// Order types - extends shared domain types with API-specific fields

import type { Order, OrderStatus, OrderSide, OrderType, Fill } from '@ai-trader/shared';

export type { Order, OrderStatus, OrderSide, OrderType, Fill };

// API response types
export interface OrderResponse extends Omit<Order, 'createdAt' | 'updatedAt' | 'queuedAt'> {
  createdAt: string;
  updatedAt: string;
  queuedAt: string | null;
}

export interface FillResponse extends Omit<Fill, 'timestamp'> {
  timestamp: string;
}
