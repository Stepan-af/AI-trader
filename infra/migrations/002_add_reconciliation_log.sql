-- Migration: Add reconciliation log table
-- Tracks all reconciliation actions for debugging and compliance

CREATE TABLE execution.order_reconciliation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES execution.orders(id),
  exchange_order_id VARCHAR(100),
  action VARCHAR(50) NOT NULL CHECK (action IN (
    'NO_CHANGE',
    'STATE_UPDATED',
    'FILLS_ADDED',
    'ORDER_RESUBMITTED',
    'CANCEL_RETRIED',
    'MARKED_REJECTED',
    'CRITICAL_DISCREPANCY'
  )),
  db_status VARCHAR(20) NOT NULL,
  exchange_status VARCHAR(20),
  db_filled_qty DECIMAL(20, 8) NOT NULL,
  exchange_filled_qty DECIMAL(20, 8),
  fills_added_count INT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reconciliation_log_order_id ON execution.order_reconciliation_log(order_id);
CREATE INDEX idx_reconciliation_log_timestamp ON execution.order_reconciliation_log(timestamp DESC);
CREATE INDEX idx_reconciliation_log_action ON execution.order_reconciliation_log(action);

COMMENT ON TABLE execution.order_reconciliation_log IS 'Audit trail for reconciliation actions';
COMMENT ON COLUMN execution.order_reconciliation_log.action IS 'Type of reconciliation action taken';
COMMENT ON COLUMN execution.order_reconciliation_log.details IS 'Additional context (e.g., error messages, missing fill IDs)';
