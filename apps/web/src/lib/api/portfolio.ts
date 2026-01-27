// Portfolio API client

import api from '../api';
import type { PortfolioOverview, PortfolioPositionsResponse } from '@/types/portfolio';

export const portfolioApi = {
  /**
   * Get portfolio overview (balance, equity, unrealized PnL)
   * GET /portfolio
   */
  getOverview: async (): Promise<PortfolioOverview> => {
    const response = await api.get<PortfolioOverview>('/portfolio');
    return response.data;
  },

  /**
   * Get all positions
   * GET /portfolio/positions
   */
  getPositions: async (): Promise<PortfolioPositionsResponse> => {
    const response = await api.get<PortfolioPositionsResponse>('/portfolio/positions');
    return response.data;
  },
};
