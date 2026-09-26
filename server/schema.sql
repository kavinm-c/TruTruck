-- TruTruck schema. Run once in Supabase > SQL Editor (safe to re-run).
-- The API reaches these tables over HTTPS with the service_role key, which bypasses RLS.

CREATE TABLE IF NOT EXISTS carriers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  cvor_number  TEXT NOT NULL,
  cvor_status  TEXT NOT NULL CHECK (cvor_status IN ('active','expired','suspended'))
);

CREATE TABLE IF NOT EXISTS drivers (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL,
  photo               TEXT,
  carrier_id          TEXT NOT NULL REFERENCES carriers(id),
  license_number      TEXT NOT NULL,
  vehicle_plate       TEXT NOT NULL,
  vehicle_description TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drivers_email_key ON drivers (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS drivers_license_number_key ON drivers (lower(license_number));

CREATE TABLE IF NOT EXISTS shipments (
  id                 TEXT PRIMARY KEY,
  reference_code     TEXT NOT NULL UNIQUE,
  cargo              TEXT NOT NULL DEFAULT '',
  pickup_location    TEXT NOT NULL,
  dropoff_location   TEXT NOT NULL,
  pickup_date        TEXT NOT NULL,
  pickup_time        TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN
                       ('unassigned','assigned','en_route','at_warehouse','verified','in_transit','cancelled')),
  -- Constraint names are referenced by the API's joins (supabase-js embedding).
  carrier_id         TEXT CONSTRAINT shipments_carrier_id_fkey REFERENCES carriers(id),
  driver_id          TEXT CONSTRAINT shipments_driver_id_fkey REFERENCES drivers(id),
  totp_secret        TEXT,
  last_totp_step     INTEGER,
  failed_attempts    INTEGER NOT NULL DEFAULT 0,
  locked             BOOLEAN NOT NULL DEFAULT false,
  declined_by        TEXT CONSTRAINT shipments_declined_by_fkey REFERENCES drivers(id),
  dock_number        TEXT,
  accepted_at        TIMESTAMPTZ,
  arrived_at         TIMESTAMPTZ,
  verified_at        TIMESTAMPTZ,
  released_at        TIMESTAMPTZ,
  verification_notes TEXT,
  cancelled_at       TIMESTAMPTZ,
  cancel_reason      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration for databases created before orders could be revoked (safe to re-run).
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check CHECK (status IN
  ('unassigned','assigned','en_route','at_warehouse','verified','in_transit','cancelled'));

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipment_id TEXT REFERENCES shipments(id),
  actor_role  TEXT NOT NULL,
  actor_id    TEXT,
  event       TEXT NOT NULL,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS with no policies: the anon/authenticated keys (which are public) can't read
-- or write anything, so pass secrets stay private. service_role bypasses RLS.
ALTER TABLE carriers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
