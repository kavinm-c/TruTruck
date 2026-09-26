import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

// Built-in SQLite (Node 22.13+): no native module to compile.
export const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

// Bump when the schema changes. Older demo databases are dropped and re-seeded.
const SCHEMA_VERSION = 2;

/** Run fn inside a transaction; rolls back on error. */
export function transaction(fn: () => void) {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function migrate() {
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (user_version !== SCHEMA_VERSION) {
    db.exec(`
      DROP TABLE IF EXISTS audit_log;
      DROP TABLE IF EXISTS shipments;
      DROP TABLE IF EXISTS drivers;
      DROP TABLE IF EXISTS carriers;
    `);
  }

  db.exec(`
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
      email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
      photo               TEXT,
      carrier_id          TEXT NOT NULL REFERENCES carriers(id),
      license_number      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      vehicle_plate       TEXT NOT NULL,
      vehicle_description TEXT NOT NULL DEFAULT '',
      created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

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
      locked             INTEGER NOT NULL DEFAULT 0,
      declined_by        TEXT REFERENCES drivers(id),
      dock_number        TEXT,
      accepted_at        TEXT,
      arrived_at         TEXT,
      verified_at        TEXT,
      released_at        TEXT,
      verification_notes TEXT,
      created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id TEXT REFERENCES shipments(id),
      actor_role  TEXT NOT NULL,
      actor_id    TEXT,
      event       TEXT NOT NULL,
      detail      TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
}

// Run immediately so modules can prepare statements at import time.
migrate();

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
  created_at: string;
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
  locked: number;
  declined_by: string | null;
  dock_number: string | null;
  accepted_at: string | null;
  arrived_at: string | null;
  verified_at: string | null;
  released_at: string | null;
  verification_notes: string | null;
  created_at: string;
  // Joined for display.
  driver_name: string | null;
  carrier_name: string | null;
  declined_by_name: string | null;
}

/** Shipment columns plus driver/carrier names; append WHERE/ORDER BY. */
export const SHIPMENT_SELECT = `
  SELECT s.*, dr.name AS driver_name, c.name AS carrier_name, dec.name AS declined_by_name
  FROM shipments s
  LEFT JOIN drivers dr ON dr.id = s.driver_id
  LEFT JOIN carriers c ON c.id = s.carrier_id
  LEFT JOIN drivers dec ON dec.id = s.declined_by`;

export type ShipmentStatus =
  | "unassigned"
  | "assigned"
  | "en_route"
  | "at_warehouse"
  | "verified"
  | "in_transit";
