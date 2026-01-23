/**
 * Domain Types
 * Source of truth for all domain entities across services.
 * Based on ARCHITECTURE.md and API.md specifications.
 */

// ============================================================================
// Order Domain
// ============================================================================

export type OrderSide = 'BUY' | 'SELL';

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';

export type OrderStatus =
  | 'NEW'
  | 'SUBMITTED'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'EXPIRED';

export interface Order {
  id: string;
  userId: string;
  strategyId: string | null;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number | null;
  status: OrderStatus;
  filledQuantity: number;
  avgFillPrice: number | null;
  exchangeOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
  queuedAt: Date | null;
}

// ============================================================================
// Fill Domain
// ============================================================================

export type FillSource = 'WEBSOCKET' | 'RECONCILIATION';

export interface Fill {
  id: string;
  orderId: string;
  exchangeFillId: string; // Unique per exchange, ensures deduplication
  price: number;
  quantity: number;
  fee: number;
  feeAsset: string;
  timestamp: Date;
  source: FillSource;
}

// ============================================================================
// Order Event Domain (Audit Trail)
// ============================================================================

export type OrderEventType =
  | 'CREATED'
  | 'SUBMITTED'
  | 'OPENED'
  | 'PARTIAL_FILL'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'RECONCILED';

export interface OrderEvent {
  id: string;
  orderId: string;
  eventType: OrderEventType;
  data: Record<string, unknown>;
  sequenceNumber: number;
  timestamp: Date;
}

// ============================================================================
// Position Domain
// ============================================================================

export interface Position {
  id: string;
  userId: string;
  symbol: string;
  quantity: number; // Can be negative for short positions (future)
  avgEntryPrice: number;
  version: number; // For optimistic locking
  updatedAt: Date;
}

// ============================================================================
// Balance Domain
// ============================================================================

export interface Balance {
  id: string;
  userId: string;
  asset: string;
  total: number;
  available: number;
  locked: number; // Locked in open orders
  updatedAt: Date;
}

// ============================================================================
// PnL Domain
// ============================================================================

export interface PnLSnapshot {
  id: string;
  userId: string;
  symbol: string | null; // null = total portfolio
  realizedPnl: number;
  unrealizedPnl: number;
  fees: number;
  timestamp: Date;
}

// ============================================================================
// Strategy Domain
// ============================================================================

export type StrategyType = 'DCA' | 'GRID' | 'SWING';

export type StrategyStatus = 'DRAFT' | 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR';

export type TradingMode = 'PAPER' | 'LIVE';

export type Timeframe = '1s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface StrategyConfig {
  // Base config
  name: string;
  type: StrategyType;
  symbol: string;
  timeframe: Timeframe;

  // DCA specific
  dca?: {
    intervalSeconds: number;
    amountPerOrder: number;
  };

  // Grid specific
  grid?: {
    lowerBound: number;
    upperBound: number;
    gridLevels: number;
  };

  // Swing specific (DSL)
  swing?: {
    entryRule: string; // e.g., "RSI < 30 AND CLOSE > SMA(200)"
    exitRule: string; // e.g., "RSI > 60"
  };

  // Risk limits
  risk: {
    maxPositionSize: number;
    maxExposureUsd?: number;
    maxDailyLossUsd?: number;
  };
}

export interface Strategy {
  id: string;
  userId: string;
  config: StrategyConfig;
  status: StrategyStatus;
  mode: TradingMode | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Candle Domain
// ============================================================================

export interface Candle {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ============================================================================
// Backtest Domain
// ============================================================================

export type BacktestStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface BacktestRun {
  id: string;
  userId: string;
  strategyConfig: StrategyConfig;
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  status: BacktestStatus;
  createdAt: Date;
  completedAt: Date | null;
}

export interface BacktestResult {
  id: string;
  backtestRunId: string;
  finalBalance: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  maxDrawdown: number;
  sharpeRatio: number;
  completedAt: Date;
}

// ============================================================================
// Portfolio Event Outbox (Execution → Portfolio communication)
// ============================================================================

export type PortfolioEventType = 'FILL_PROCESSED' | 'ORDER_CANCELED';

export interface PortfolioEventOutbox {
  id: string;
  eventType: PortfolioEventType;
  userId: string;
  symbol: string;
  orderId: string;
  fillId: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
  processedAt: Date | null;
}

// ============================================================================
// Risk Domain
// ============================================================================

export interface RiskLimits {
  id: string;
  userId: string;
  symbol: string | null; // null = global user limit
  maxPositionSize: number;
  maxExposureUsd: number;
  maxDailyLossUsd: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SystemConfig {
  id: string;
  killSwitchActive: boolean;
  killSwitchReason: string | null;
  killSwitchActivatedAt: Date | null;
  updatedAt: Date;
}
