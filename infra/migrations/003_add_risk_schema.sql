-- Migration: Add risk schema with risk limits and system configuration
-- Creates risk.risk_limits and risk.system_config tables for pre-trade validation

-- ============================================================================
-- RISK SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS risk;

-- Risk limits table: Per-user and per-symbol trading limits
CREATE TABLE risk.risk_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol VARCHAR(20), -- NULL means global limit for user
  max_position_size DECIMAL(20, 8) NOT NULL CHECK (max_position_size > 0),
  max_exposure_usd DECIMAL(20, 8) NOT NULL CHECK (max_exposure_usd > 0),
  max_daily_loss_usd DECIMAL(20, 8) NOT NULL CHECK (max_daily_loss_usd > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT risk_limits_unique_user_symbol UNIQUE (user_id, symbol)
);

CREATE INDEX idx_risk_limits_user_id ON risk.risk_limits(user_id);
CREATE INDEX idx_risk_limits_symbol ON risk.risk_limits(symbol);

-- System configuration table: Global system settings including kill switch
CREATE TABLE risk.system_config (
  id VARCHAR(50) PRIMARY KEY,
  kill_switch_active BOOLEAN NOT NULL DEFAULT FALSE,
  kill_switch_reason VARCHAR(200),
  kill_switch_activated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default global configuration
INSERT INTO risk.system_config (id, kill_switch_active)
VALUES ('global', FALSE);

-- Default risk limits for new users (these can be overridden per user)
COMMENT ON TABLE risk.risk_limits IS 'Trading risk limits per user and symbol. NULL symbol means global user limit.';
COMMENT ON TABLE risk.system_config IS 'Global system configuration including emergency kill switch state.';
