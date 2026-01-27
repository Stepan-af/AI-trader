// Backtest types - extends shared domain types with API-specific fields

import type { BacktestRun, BacktestResult, BacktestStatus } from '@ai-trader/shared';

export type { BacktestRun, BacktestResult, BacktestStatus };

// API request/response types
export interface CreateBacktestRequest {
  strategyId: string;
  from: string; // ISO 8601 datetime
  to: string; // ISO 8601 datetime
  initialBalance: number;
}

export interface BacktestResponse {
  id: string;
  strategyId: string;
  from: string;
  to: string;
  initialBalance: number;
  status: BacktestStatus;
  createdAt: string;
  completedAt: string | null;
  metrics?: {
    totalReturn: number;
    maxDrawdown: number;
    sharpe: number;
  };
}

export interface BacktestFormData {
  strategyId: string;
  fromDate: string;
  toDate: string;
  initialBalance: string;
}
