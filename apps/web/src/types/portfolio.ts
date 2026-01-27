// Portfolio types - extends shared domain types with API-specific fields

import type { Position, PnLSnapshot } from '@ai-trader/shared';

export type { Position, PnLSnapshot };

// API response types
export interface PortfolioOverview {
  balance: number;
  equity: number;
  unrealized_pnl: number;
  data_as_of_timestamp: string; // ISO 8601
  is_stale: boolean;
}

export interface PortfolioPositionsResponse {
  positions: Position[];
  data_as_of_timestamp: string;
  is_stale: boolean;
}
