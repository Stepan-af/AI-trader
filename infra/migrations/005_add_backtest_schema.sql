-- Migration 005: Add Backtest Schema
-- Implements backtest_runs and backtest_results tables per ARCHITECTURE.md

-- Create backtest schema
CREATE SCHEMA IF NOT EXISTS backtest;

-- backtest_runs table
-- Stores backtest execution metadata and configuration
CREATE TABLE backtest.backtest_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    strategy_config JSONB NOT NULL, -- Immutable snapshot of strategy config
    symbol VARCHAR(20) NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    initial_balance NUMERIC(20, 8) NOT NULL CHECK (initial_balance > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    error_message TEXT NULL, -- If status = FAILED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_backtest_runs_user_id ON backtest.backtest_runs(user_id);
CREATE INDEX idx_backtest_runs_status ON backtest.backtest_runs(status);
CREATE INDEX idx_backtest_runs_created_at ON backtest.backtest_runs(created_at DESC);

-- backtest_results table
-- Stores backtest performance metrics
CREATE TABLE backtest.backtest_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backtest_run_id UUID NOT NULL REFERENCES backtest.backtest_runs(id) ON DELETE CASCADE,
    final_balance NUMERIC(20, 8) NOT NULL,
    total_trades INTEGER NOT NULL DEFAULT 0,
    winning_trades INTEGER NOT NULL DEFAULT 0,
    losing_trades INTEGER NOT NULL DEFAULT 0,
    total_pnl NUMERIC(20, 8) NOT NULL,
    max_drawdown NUMERIC(10, 6) NOT NULL, -- Percentage (e.g., 0.15 = 15%)
    sharpe_ratio NUMERIC(10, 4) NULL, -- Can be NULL if not enough data
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_backtest_run FOREIGN KEY (backtest_run_id) 
        REFERENCES backtest.backtest_runs(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_backtest_results_run_id ON backtest.backtest_results(backtest_run_id);

-- Comments
COMMENT ON TABLE backtest.backtest_runs IS 'Backtest execution metadata with immutable configuration';
COMMENT ON TABLE backtest.backtest_results IS 'Backtest performance metrics and final results';
COMMENT ON COLUMN backtest.backtest_runs.strategy_config IS 'Immutable JSON snapshot of strategy configuration at backtest time';
COMMENT ON COLUMN backtest.backtest_runs.status IS 'Backtest execution status: PENDING, RUNNING, COMPLETED, FAILED';
COMMENT ON COLUMN backtest.backtest_results.max_drawdown IS 'Maximum peak-to-trough decline as decimal (0.15 = 15% drawdown)';
COMMENT ON COLUMN backtest.backtest_results.sharpe_ratio IS 'Risk-adjusted return metric (NULL if insufficient data)';
