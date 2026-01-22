-- Migration: Initial schema setup for AI Trader MVP
-- Creates execution, portfolio, strategy, and candles schemas with all required tables

-- ============================================================================
-- SCHEMAS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS execution;
CREATE SCHEMA IF NOT EXISTS portfolio;
CREATE SCHEMA IF NOT EXISTS strategy;
CREATE SCHEMA IF NOT EXISTS candles;

-- ============================================================================
-- EXECUTION SCHEMA
-- ============================================================================

-- Orders table: Core order lifecycle tracking
CREATE TABLE execution.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  strategy_id UUID,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  type VARCHAR(20) NOT NULL CHECK (type IN ('MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT')),
  quantity DECIMAL(20, 8) NOT NULL CHECK (quantity > 0),
  price DECIMAL(20, 8),
  status VARCHAR(20) NOT NULL CHECK (status IN ('NEW', 'SUBMITTED', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED')),
  filled_quantity DECIMAL(20, 8) NOT NULL DEFAULT 0 CHECK (filled_quantity >= 0),
  avg_fill_price DECIMAL(20, 8),
  exchange_order_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at TIMESTAMPTZ,
  CONSTRAINT orders_filled_quantity_check CHECK (filled_quantity <= quantity)
);

CREATE INDEX idx_orders_user_id ON execution.orders(user_id);
CREATE INDEX idx_orders_strategy_id ON execution.orders(strategy_id);
CREATE INDEX idx_orders_symbol ON execution.orders(symbol);
CREATE INDEX idx_orders_status ON execution.orders(status);
CREATE INDEX idx_orders_queued_at ON execution.orders(queued_at) WHERE queued_at IS NOT NULL;
CREATE INDEX idx_orders_created_at ON execution.orders(created_at DESC);

-- Fills table: Individual fill records with deduplication
CREATE TABLE execution.fills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES execution.orders(id),
  exchange_fill_id VARCHAR(100) NOT NULL UNIQUE, -- Ensures deduplication
  price DECIMAL(20, 8) NOT NULL CHECK (price > 0),
  quantity DECIMAL(20, 8) NOT NULL CHECK (quantity > 0),
  fee DECIMAL(20, 8) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  fee_asset VARCHAR(10) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('WEBSOCKET', 'RECONCILIATION'))
);

CREATE INDEX idx_fills_order_id ON execution.fills(order_id);
CREATE INDEX idx_fills_timestamp ON execution.fills(timestamp DESC);
CREATE UNIQUE INDEX idx_fills_exchange_fill_id ON execution.fills(exchange_fill_id);

-- Order events table: Complete audit trail
CREATE TABLE execution.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES execution.orders(id),
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('CREATED', 'SUBMITTED', 'OPENED', 'PARTIAL_FILL', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED', 'RECONCILED')),
  data JSONB NOT NULL DEFAULT '{}',
  sequence_number BIGINT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_events_unique_sequence UNIQUE (order_id, sequence_number)
);

CREATE INDEX idx_order_events_order_id ON execution.order_events(order_id, sequence_number);
CREATE INDEX idx_order_events_timestamp ON execution.order_events(timestamp DESC);

-- Portfolio events outbox: Transactional outbox pattern for eventual consistency
CREATE TABLE execution.portfolio_events_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('FILL_PROCESSED', 'ORDER_CANCELED')),
  user_id UUID NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  order_id UUID NOT NULL REFERENCES execution.orders(id),
  fill_id UUID REFERENCES execution.fills(id),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_portfolio_events_outbox_processed ON execution.portfolio_events_outbox(processed_at) WHERE processed_at IS NULL;
CREATE INDEX idx_portfolio_events_outbox_created ON execution.portfolio_events_outbox(created_at ASC);
CREATE INDEX idx_portfolio_events_outbox_user ON execution.portfolio_events_outbox(user_id);

-- ============================================================================
-- PORTFOLIO SCHEMA
-- ============================================================================

-- Positions table: Current position state with optimistic locking
CREATE TABLE portfolio.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL DEFAULT 0,
  avg_entry_price DECIMAL(20, 8) NOT NULL CHECK (avg_entry_price > 0),
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT positions_unique_user_symbol UNIQUE (user_id, symbol)
);

CREATE INDEX idx_positions_user_id ON portfolio.positions(user_id);
CREATE INDEX idx_positions_symbol ON portfolio.positions(symbol);
CREATE INDEX idx_positions_version ON portfolio.positions(version);

-- Balances table: User balances per asset
CREATE TABLE portfolio.balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  asset VARCHAR(10) NOT NULL,
  total DECIMAL(20, 8) NOT NULL DEFAULT 0 CHECK (total >= 0),
  available DECIMAL(20, 8) NOT NULL DEFAULT 0 CHECK (available >= 0),
  locked DECIMAL(20, 8) NOT NULL DEFAULT 0 CHECK (locked >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT balances_unique_user_asset UNIQUE (user_id, asset),
  CONSTRAINT balances_total_check CHECK (total = available + locked)
);

CREATE INDEX idx_balances_user_id ON portfolio.balances(user_id);
CREATE INDEX idx_balances_asset ON portfolio.balances(asset);

-- PnL snapshots table: Point-in-time PnL records
CREATE TABLE portfolio.pnl_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol VARCHAR(20), -- NULL for total portfolio
  realized_pnl DECIMAL(20, 8) NOT NULL DEFAULT 0,
  unrealized_pnl DECIMAL(20, 8) NOT NULL DEFAULT 0,
  fees DECIMAL(20, 8) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pnl_snapshots_user_id ON portfolio.pnl_snapshots(user_id);
CREATE INDEX idx_pnl_snapshots_symbol ON portfolio.pnl_snapshots(symbol);
CREATE INDEX idx_pnl_snapshots_timestamp ON portfolio.pnl_snapshots(timestamp DESC);

-- ============================================================================
-- STRATEGY SCHEMA
-- ============================================================================

-- Strategies table: Strategy configurations and state
CREATE TABLE strategy.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  config JSONB NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'STOPPED', 'STARTING', 'RUNNING', 'STOPPING', 'ERROR')),
  mode VARCHAR(10) CHECK (mode IN ('PAPER', 'LIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_strategies_user_id ON strategy.strategies(user_id);
CREATE INDEX idx_strategies_status ON strategy.strategies(status);
CREATE INDEX idx_strategies_mode ON strategy.strategies(mode);

-- ============================================================================
-- CANDLES SCHEMA (TimescaleDB hypertable)
-- ============================================================================

-- Candles table: OHLCV candle data
CREATE TABLE candles.candles (
  id UUID DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL CHECK (timeframe IN ('1s', '1m', '5m', '15m', '1h', '4h', '1d')),
  timestamp TIMESTAMPTZ NOT NULL,
  open DECIMAL(20, 8) NOT NULL CHECK (open > 0),
  high DECIMAL(20, 8) NOT NULL CHECK (high > 0),
  low DECIMAL(20, 8) NOT NULL CHECK (low > 0),
  close DECIMAL(20, 8) NOT NULL CHECK (close > 0),
  volume DECIMAL(20, 8) NOT NULL CHECK (volume >= 0),
  PRIMARY KEY (symbol, timeframe, timestamp),
  CONSTRAINT candles_ohlc_check CHECK (high >= low AND high >= open AND high >= close AND low <= open AND low <= close)
);

CREATE INDEX idx_candles_symbol_timeframe ON candles.candles(symbol, timeframe, timestamp DESC);

-- Convert to TimescaleDB hypertable (will be applied after TimescaleDB extension is enabled)
-- SELECT create_hypertable('candles.candles', 'timestamp', chunk_time_interval => INTERVAL '1 day');

COMMENT ON SCHEMA execution IS 'Execution Service owns this schema: orders, fills, events, outbox';
COMMENT ON SCHEMA portfolio IS 'Portfolio Service owns this schema: positions, balances, pnl';
COMMENT ON SCHEMA strategy IS 'Strategy Service owns this schema: strategy configs and state';
COMMENT ON SCHEMA candles IS 'Exchange Adapter writes candles, read by all services';
