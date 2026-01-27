// Monitoring API client

import api from '../api';

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
    exchange: 'up' | 'down';
    risk: 'up' | 'down';
    portfolio: 'up' | 'down';
  };
  killSwitch: {
    active: boolean;
    reason?: string;
    activatedAt?: string;
  };
}

export const monitoringApi = {
  /**
   * Get system health status including kill switch state
   * GET /health
   */
  getHealth: async (): Promise<HealthCheckResponse> => {
    const response = await api.get<HealthCheckResponse>('/health');
    return response.data;
  },
};
