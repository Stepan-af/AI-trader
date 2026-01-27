// Order API client

import api from '../api';
import type { OrderResponse, FillResponse } from '@/types/order';

export const orderApi = {
  /**
   * Get all orders
   * GET /orders
   */
  list: async (): Promise<OrderResponse[]> => {
    const response = await api.get<OrderResponse[]>('/orders');
    return response.data;
  },

  /**
   * Get order by ID
   * GET /orders/:id
   */
  getById: async (id: string): Promise<OrderResponse> => {
    const response = await api.get<OrderResponse>(`/orders/${id}`);
    return response.data;
  },

  /**
   * Cancel an order
   * POST /orders/:id/cancel
   */
  cancel: async (id: string): Promise<void> => {
    await api.post(`/orders/${id}/cancel`);
  },

  /**
   * Get fills for an order
   * GET /orders/:id/fills
   */
  getFills: async (id: string): Promise<FillResponse[]> => {
    const response = await api.get<FillResponse[]>(`/orders/${id}/fills`);
    return response.data;
  },
};
