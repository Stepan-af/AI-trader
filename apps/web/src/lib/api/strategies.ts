// Strategy API client

import type { CreateStrategyRequest, Strategy, UpdateStrategyRequest } from '@/types/strategy';
import api from '../api';

export const strategyApi = {
  /**
   * Fetch all strategies
   * GET /strategies
   */
  list: async (): Promise<Strategy[]> => {
    const response = await api.get<Strategy[]>('/strategies');
    return response.data;
  },

  /**
   * Create a new strategy
   * POST /strategies
   */
  create: async (data: CreateStrategyRequest): Promise<Strategy> => {
    const response = await api.post<Strategy>('/strategies', data);
    return response.data;
  },

  /**
   * Update an existing strategy
   * PUT /strategies/:id
   */
  update: async (id: string, data: UpdateStrategyRequest): Promise<Strategy> => {
    const response = await api.put<Strategy>(`/strategies/${id}`, data);
    return response.data;
  },

  /**
   * Delete a strategy
   * DELETE /strategies/:id
   */
  delete: async (id: string): Promise<void> => {
    await api.delete(`/strategies/${id}`);
  },

  /**
   * Start a strategy
   * POST /strategies/:id/start
   */
  start: async (id: string, mode: 'PAPER' | 'LIVE'): Promise<Strategy> => {
    const response = await api.post<Strategy>(`/strategies/${id}/start`, { mode });
    return response.data;
  },

  /**
   * Stop a strategy
   * POST /strategies/:id/stop
   */
  stop: async (id: string): Promise<Strategy> => {
    const response = await api.post<Strategy>(`/strategies/${id}/stop`, {});
    return response.data;
  },
};
