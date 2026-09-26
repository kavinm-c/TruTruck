-- Lets the coordinator revoke (cancel) delivery orders.
-- Run once in Supabase > SQL Editor. Safe to re-run. Also folded into schema.sql.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check CHECK (status IN
  ('unassigned','assigned','en_route','at_warehouse','verified','in_transit','cancelled'));
