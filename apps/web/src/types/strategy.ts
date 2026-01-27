// Strategy types - extends shared domain types with API-specific fields

import type {
  Strategy,
  StrategyConfig,
  StrategyStatus,
  StrategyType,
  Timeframe,
  TradingMode,
} from '@ai-trader/shared';

export type { Strategy, StrategyConfig, StrategyStatus, StrategyType, Timeframe, TradingMode };

// API request/response types
export interface CreateStrategyRequest {
  name: string;
  type: StrategyType;
  symbol: string;
  timeframe: Timeframe;
  dca?: {
    intervalSeconds: number;
    amountPerOrder: number;
  };
  grid?: {
    lowerBound: number;
    upperBound: number;
    gridLevels: number;
  };
  swing?: {
    entryRule: string;
    exitRule: string;
  };
  risk: {
    maxPositionSize: number;
  };
}

export interface UpdateStrategyRequest extends CreateStrategyRequest {}

export interface StrategyFormData {
  name: string;
  type: StrategyType;
  symbol: string;
  timeframe: Timeframe;
  // DCA fields
  intervalSeconds: string;
  amountPerOrder: string;
  // GRID fields
  lowerBound: string;
  upperBound: string;
  gridLevels: string;
  // SWING fields
  entryRule: string;
  exitRule: string;
  // Risk fields
  maxPositionSize: string;
}
