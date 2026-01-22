/**
 * API Types
 * Request/Response types for REST API.
 * Based on API.md specifications.
 */

import type {
  BacktestResult,
  BacktestRun,
  Balance,
  Order,
  PnLSnapshot,
  Position,
  Strategy,
  StrategyConfig,
  TradingMode,
} from './domain';

// ============================================================================
// Common API Structures
// ============================================================================

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface ApiError {
  error: string;
  message: string;
  retry_after_seconds?: number;
  kill_switch_reason?: string;
  activated_at?: string;
  failed_checks?: string[];
}

// ============================================================================
// Authentication
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
}

// ============================================================================
// Strategy API
// ============================================================================

export interface CreateStrategyRequest {
  config: StrategyConfig;
}

export interface CreateStrategyResponse {
  id: string;
  userId: string;
  config: StrategyConfig;
  status: string;
  createdAt: string;
}

export interface UpdateStrategyRequest {
  config: StrategyConfig;
}

export interface UpdateStrategyResponse {
  id: string;
  config: StrategyConfig;
  updatedAt: string;
}

export interface StartStrategyRequest {
  mode: TradingMode;
}

export interface StartStrategyResponse {
  id: string;
  status: string;
  mode: TradingMode;
}

export interface StopStrategyResponse {
  id: string;
  status: string;
}

export type ListStrategiesResponse = PaginatedResponse<Strategy>;

// ============================================================================
// Order API
// ============================================================================

export interface CreateOrderRequest {
  strategyId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
  quantity: number;
  price?: number;
}

export interface CreateOrderResponse {
  id: string;
  status: string;
  createdAt: string;
}

export interface CancelOrderResponse {
  id: string;
  status: string;
  canceledAt: string;
}

export type ListOrdersResponse = PaginatedResponse<Order>;

// ============================================================================
// Portfolio API
// ============================================================================

export interface GetPositionResponse {
  position: Position;
  dataAsOfTimestamp: string;
  isStale: boolean;
}

export interface ListPositionsResponse extends PaginatedResponse<Position> {
  dataAsOfTimestamp: string;
  isStale: boolean;
}

export interface GetBalanceResponse {
  balance: Balance;
  dataAsOfTimestamp: string;
  isStale: boolean;
}

export interface ListBalancesResponse extends PaginatedResponse<Balance> {
  dataAsOfTimestamp: string;
  isStale: boolean;
}

export interface GetPnLResponse {
  pnl: PnLSnapshot;
  dataAsOfTimestamp: string;
  isStale: boolean;
}

// ============================================================================
// Backtest API
// ============================================================================

export interface CreateBacktestRequest {
  strategyConfig: StrategyConfig;
  symbol: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  initialBalance: number;
}

export interface CreateBacktestResponse {
  id: string;
  status: string;
  createdAt: string;
}

export interface GetBacktestResponse {
  run: BacktestRun;
  result: BacktestResult | null;
}

export type ListBacktestsResponse = PaginatedResponse<BacktestRun>;

// ============================================================================
// Risk API (Internal)
// ============================================================================

export interface RiskValidationRequest {
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  currentPosition: number;
  positionVersion: number;
}

export interface RiskValidationResponse {
  approved: boolean;
  validatedAt: string;
  limitsSnapshot: {
    maxPositionSize: number;
    maxExposureUsd: number;
    maxDailyLossUsd: number;
  };
}

export interface RiskValidationErrorResponse extends ApiError {
  error: 'POSITION_CHANGED' | 'RISK_LIMIT_EXCEEDED';
  currentVersion?: number;
}

// ============================================================================
// Health Check
// ============================================================================

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
