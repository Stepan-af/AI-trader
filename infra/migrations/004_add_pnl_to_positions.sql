-- Migration: Add PnL tracking to positions table
-- Purpose: Track realized PnL and fees directly in positions for simpler atomic updates
-- Per ARCHITECTURE.md Commit 12: Add PnL calculation

-- Add realized PnL and fees columns to positions
ALTER TABLE portfolio.positions
ADD COLUMN realized_pnl DECIMAL(20, 8) NOT NULL DEFAULT 0,
ADD COLUMN total_fees DECIMAL(20, 8) NOT NULL DEFAULT 0 CHECK (total_fees >= 0);

-- Add index for PnL queries
CREATE INDEX idx_positions_realized_pnl ON portfolio.positions(realized_pnl);

-- Add data_as_of_timestamp for staleness tracking
ALTER TABLE portfolio.positions
ADD COLUMN data_as_of_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX idx_positions_data_as_of ON portfolio.positions(data_as_of_timestamp DESC);
