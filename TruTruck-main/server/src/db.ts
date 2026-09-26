import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

// Built-in SQLite (Node 22.13+): no native module to compile.
export const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

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
  db.exec(`
    CREATE TABLE IF NOT EXISTS carriers (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      phone        TEXT NOT NULL,
      cvor_number  TEXT NOT NULL,
      cvor_status  TEXT NOT NULL CHECK (cvor_status IN ('active','expired','suspended'))
    );

    CREATE TABLE IF NOT EXISTS truckers (
      id                  TEXT PRIMARY KEY,
      name                TEXT NOT NULL,
      phone               TEXT NOT NULL,
      carrier_id          TEXT NOT NULL REFERENCES carriers(id),
      license_number      TEXT NOT NULL,
      vehicle_plate       TEXT NOT NULL,
      vehicle_description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id                 TEXT PRIMARY KEY,
      reference_code     TEXT NOT NULL UNIQUE,
      what               TEXT NOT NULL,
      origin             TEXT NOT NULL,
      destination        TEXT NOT NULL,
      pickup_date        TEXT NOT NULL,
      pickup_window      TEXT NOT NULL,
      status             TEXT NOT NULL CHECK (status IN
                           ('unassigned','assigned','en_route','at_warehouse','verified','in_transit')),
      carrier_id         TEXT REFERENCES carriers(id),
      trucker_id         TEXT REFERENCES truckers(id),
      verification_code  TEXT,
      code_expires_at    TEXT,
      failed_attempts    INTEGER NOT NULL DEFAULT 0,
      locked             INTEGER NOT NULL DEFAULT 0,
      dock_number        TEXT,
      acknowledged_at    TEXT,
      arrived_at         TEXT,
      verified_at        TEXT,
      released_at        TEXT,
      verification_notes TEXT
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

export interface TruckerRow {
  id: string;
  name: string;
  phone: string;
  carrier_id: string;
  license_number: string;
  vehicle_plate: string;
  vehicle_description: string;
}

export interface ShipmentRow {
  id: string;
  reference_code: string;
  what: string;
  origin: string;
  destination: string;
  pickup_date: string;
  pickup_window: string;
  status: ShipmentStatus;
  carrier_id: string | null;
  trucker_id: string | null;
  verification_code: string | null;
  code_expires_at: string | null;
  failed_attempts: number;
  locked: number;
  dock_number: string | null;
  acknowledged_at: string | null;
  arrived_at: string | null;
  verified_at: string | null;
  released_at: string | null;
  verification_notes: string | null;
}

export type ShipmentStatus =
  | "unassigned"
  | "assigned"
  | "en_route"
  | "at_warehouse"
  | "verified"
  | "in_transit";
