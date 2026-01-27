// Backtest API client

import api from '../api';
import type { CreateBacktestRequest, BacktestResponse } from '@/types/backtest';

export const backtestApi = {
  /**
   * Start a new backtest
   * POST /backtests
   */
  create: async (data: CreateBacktestRequest): Promise<BacktestResponse> => {
    const response = await api.post<BacktestResponse>('/backtests', data);
    return response.data;
  },

  /**
   * Get backtest result by ID
   * GET /backtests/:id
   */
  getById: async (id: string): Promise<BacktestResponse> => {
    const response = await api.get<BacktestResponse>(`/backtests/${id}`);
    return response.data;
  },
};
