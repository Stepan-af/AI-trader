// Strategy types - extends shared domain types with API-specific fields

import type {
  Strategy,
  StrategyConfig,
  StrategyType,
  StrategyStatus,
  TradingMode,
  Timeframe,
} from '@ai-trader/shared';

export type {
  Strategy,
  StrategyConfig,
  StrategyType,
  StrategyStatus,
  TradingMode,
  Timeframe,
};

// API request/response types
export interface CreateStrategyRequest {
  name: string;
  type: StrategyType;
  symbol: string;
  timeframe: Timeframe;
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
  entryRule: string;
  exitRule: string;
  maxPositionSize: string;
}
