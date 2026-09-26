import postgres from "postgres";
import { config } from "./config.js";

// Supabase Postgres. The transaction pooler (port 6543) doesn't support prepared statements.
export const sql = postgres(config.databaseUrl, {
  ssl: "require",
  prepare: new URL(config.databaseUrl).port !== "6543",
  onnotice: () => {},
});

/** A pooled connection or an open transaction; both run the same queries. */
export type Sql = postgres.Sql | postgres.TransactionSql;

export async function migrate() {
  await sql.unsafe(`
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
                           ('unassigned','assigned','en_route','at_warehouse','verified','in_transit')),
      carrier_id         TEXT REFERENCES carriers(id),
      driver_id          TEXT REFERENCES drivers(id),
      totp_secret        TEXT,
      last_totp_step     INTEGER,
      failed_attempts    INTEGER NOT NULL DEFAULT 0,
      locked             BOOLEAN NOT NULL DEFAULT false,
      declined_by        TEXT REFERENCES drivers(id),
      dock_number        TEXT,
      accepted_at        TIMESTAMPTZ,
      arrived_at         TIMESTAMPTZ,
      verified_at        TIMESTAMPTZ,
      released_at        TIMESTAMPTZ,
      verification_notes TEXT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      shipment_id TEXT REFERENCES shipments(id),
      actor_role  TEXT NOT NULL,
      actor_id    TEXT,
      event       TEXT NOT NULL,
      detail      JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Only this API talks to the database. RLS with no policies keeps Supabase's
    -- public REST API (anon/authenticated keys) from reading pass secrets.
    ALTER TABLE carriers  ENABLE ROW LEVEL SECURITY;
    ALTER TABLE drivers   ENABLE ROW LEVEL SECURITY;
    ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
  `);
}

export interface CarrierRow {
  id: string;
  name: string;
  phone: string;
  cvor_number: string;
  cvor_status: "active" | "expired" | "suspended";
}

export interface DriverRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  photo: string | null;
  carrier_id: string;
  license_number: string;
  vehicle_plate: string;
  vehicle_description: string;
  created_at: Date;
}

export interface ShipmentRow {
  id: string;
  reference_code: string;
  cargo: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_date: string;
  pickup_time: string;
  status: ShipmentStatus;
  carrier_id: string | null;
  driver_id: string | null;
  totp_secret: string | null;
  last_totp_step: number | null;
  failed_attempts: number;
  locked: boolean;
  declined_by: string | null;
  dock_number: string | null;
  accepted_at: Date | null;
  arrived_at: Date | null;
  verified_at: Date | null;
  released_at: Date | null;
  verification_notes: string | null;
  created_at: Date;
  // Joined for display.
  driver_name: string | null;
  carrier_name: string | null;
  declined_by_name: string | null;
}

/** Shipment columns plus driver/carrier names; append WHERE/ORDER BY. */
export const SHIPMENT_SELECT = sql`
  SELECT s.*, dr.name AS driver_name, c.name AS carrier_name, decl.name AS declined_by_name
  FROM shipments s
  LEFT JOIN drivers dr ON dr.id = s.driver_id
  LEFT JOIN carriers c ON c.id = s.carrier_id
  LEFT JOIN drivers decl ON decl.id = s.declined_by`;

export type ShipmentStatus =
  | "unassigned"
  | "assigned"
  | "en_route"
  | "at_warehouse"
  | "verified"
  | "in_transit";
