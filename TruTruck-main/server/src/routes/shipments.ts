import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import {
  db,
  SHIPMENT_SELECT,
  transaction,
  type CarrierRow,
  type ShipmentRow,
  type ShipmentStatus,
  type TruckerRow,
} from "../db.js";
import { HttpError } from "../errors.js";
import { audit } from "../audit.js";
import { generateSecret, matchTotp, normalizePlate } from "../totp.js";
import { comparePass, parsePass, type DriverPass } from "../pass.js";
import { carrierDto, shipmentDto, truckerDto } from "../dto.js";
import { currentUser, requireAuth, requireRole, type AuthUser } from "../auth.js";

export const shipmentsRouter = Router();
shipmentsRouter.use(requireAuth);

// Slow down code guessing at the dock.
const verifyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Wait a minute and try again." },
});

// ---------- helpers ----------

function getShipment(id: string): ShipmentRow {
  const row = db.prepare(`${SHIPMENT_SELECT} WHERE s.id = ?`).get(id) as unknown as ShipmentRow | undefined;
  if (!row) throw new HttpError(404, "Shipment not found");
  return row;
}

function getTrucker(id: string): TruckerRow {
  const row = db.prepare("SELECT * FROM truckers WHERE id = ?").get(id) as unknown as TruckerRow | undefined;
  if (!row) throw new HttpError(404, "Driver not found");
  return row;
}

function getCarrier(id: string): CarrierRow {
  const row = db.prepare("SELECT * FROM carriers WHERE id = ?").get(id) as unknown as CarrierRow | undefined;
  if (!row) throw new HttpError(404, "Carrier not found");
  return row;
}

function assertStatus(row: ShipmentRow, allowed: ShipmentStatus[]) {
  if (!allowed.includes(row.status)) {
    throw new HttpError(409, `Shipment is '${row.status}'; expected ${allowed.join(" or ")}`);
  }
}

function assertOwnShipment(row: ShipmentRow, user: AuthUser) {
  if (row.trucker_id !== user.truckerId) throw new HttpError(403, "Not your shipment");
}

/** Dispatch is blocked when the driver's carrier registration isn't active. */
function dispatchableDriver(truckerId: string, shipmentId: string | null, user: AuthUser) {
  const trucker = getTrucker(truckerId);
  const carrier = getCarrier(trucker.carrier_id);
  if (carrier.cvor_status !== "active") {
    audit(shipmentId, user, "assign_blocked_carrier", { truckerId, carrierId: carrier.id, cvorStatus: carrier.cvor_status });
    throw new HttpError(422, `${carrier.name}'s CVOR registration is ${carrier.cvor_status}. Cannot dispatch ${trucker.name}.`);
  }
  return { trucker, carrier };
}

function respond(id: string, user: AuthUser) {
  return shipmentDto(getShipment(id), user);
}

const now = () => new Date().toISOString();

// ---------- list ----------

shipmentsRouter.get("/", (req, res) => {
  const user = currentUser(req);
  let rows: ShipmentRow[];
  if (user.role === "trucker") {
    rows = db
      .prepare(`${SHIPMENT_SELECT} WHERE s.trucker_id = ? ORDER BY s.pickup_date, s.pickup_time`)
      .all(user.truckerId ?? "") as unknown as ShipmentRow[];
  } else if (user.role === "clerk") {
    rows = db
      .prepare(
        `${SHIPMENT_SELECT} WHERE s.status IN ('at_warehouse','verified','in_transit')
         ORDER BY COALESCE(s.verified_at, s.arrived_at) DESC`,
      )
      .all() as unknown as ShipmentRow[];
  } else {
    rows = db
      .prepare(`${SHIPMENT_SELECT} ORDER BY s.pickup_date, s.pickup_time, s.reference_code`)
      .all() as unknown as ShipmentRow[];
  }
  res.json(rows.map((r) => shipmentDto(r, user)));
});

// ---------- coordinator ----------

const orderSchema = z.object({
  cargo: z.string().trim().max(200).default(""),
  pickupLocation: z.string().trim().min(3).max(200),
  dropoffLocation: z.string().trim().min(3).max(200),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pickup date must be YYYY-MM-DD"),
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pickup time must be HH:MM"),
  truckerId: z.string().min(1).optional(),
});

function nextReference(): { id: string; ref: string } {
  const { n } = db
    .prepare("SELECT MAX(CAST(substr(reference_code, 5) AS INTEGER)) AS n FROM shipments")
    .get() as unknown as { n: number | null };
  const next = (n ?? 1000) + 1;
  return { id: `shp-${next}`, ref: `TRU-${next}` };
}

/** Create a delivery order. A pass secret is minted as soon as a driver is assigned. */
shipmentsRouter.post("/", requireRole("coordinator"), (req, res) => {
  const user = currentUser(req);
  const body = orderSchema.parse(req.body);
  if (body.pickupLocation.toLowerCase() === body.dropoffLocation.toLowerCase()) {
    throw new HttpError(422, "Pickup and drop-off locations must be different.");
  }
  const driver = body.truckerId ? dispatchableDriver(body.truckerId, null, user) : null;

  const { id, ref } = nextReference();
  db.prepare(
    `INSERT INTO shipments (id, reference_code, cargo, pickup_location, dropoff_location, pickup_date,
       pickup_time, status, carrier_id, trucker_id, totp_secret)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, ref, body.cargo, body.pickupLocation, body.dropoffLocation, body.pickupDate, body.pickupTime,
    driver ? "assigned" : "unassigned", driver?.carrier.id ?? null, driver?.trucker.id ?? null,
    driver ? generateSecret() : null);

  audit(id, user, "order_created", { truckerId: driver?.trucker.id ?? null });
  res.status(201).json(respond(id, user));
});

const assignSchema = z.object({ truckerId: z.string().min(1) });

shipmentsRouter.post("/:id/assign", requireRole("coordinator"), (req, res) => {
  const user = currentUser(req);
  const { truckerId } = assignSchema.parse(req.body);
  const row = getShipment(req.params.id as string);
  assertStatus(row, ["unassigned", "assigned", "en_route"]);
  const { trucker, carrier } = dispatchableDriver(truckerId, row.id, user);

  // New driver means a brand-new pass secret; the old driver's pass stops working.
  db.prepare(
    `UPDATE shipments SET carrier_id = ?, trucker_id = ?, status = 'assigned',
       totp_secret = ?, last_totp_step = NULL, failed_attempts = 0, locked = 0,
       declined_by = NULL, accepted_at = NULL, arrived_at = NULL
     WHERE id = ?`,
  ).run(carrier.id, trucker.id, generateSecret(), row.id);

  audit(row.id, user, row.trucker_id ? "reassigned" : "assigned", { truckerId });
  res.json(respond(row.id, user));
});

/** Rotate the pass secret, e.g. after a lockout or a lost phone. */
shipmentsRouter.post("/:id/reissue-code", requireRole("coordinator"), (req, res) => {
  const user = currentUser(req);
  const row = getShipment(req.params.id as string);
  assertStatus(row, ["assigned", "en_route", "at_warehouse"]);
  db.prepare(
    `UPDATE shipments SET totp_secret = ?, last_totp_step = NULL, failed_attempts = 0, locked = 0
     WHERE id = ?`,
  ).run(generateSecret(), row.id);
  audit(row.id, user, "pass_reissued");
  res.json(respond(row.id, user));
});

// ---------- trucker ----------

shipmentsRouter.post("/:id/accept", requireRole("trucker"), (req, res) => {
  const user = currentUser(req);
  const row = getShipment(req.params.id as string);
  assertOwnShipment(row, user);
  assertStatus(row, ["assigned"]);
  db.prepare("UPDATE shipments SET status = 'en_route', accepted_at = ? WHERE id = ?").run(now(), row.id);
  audit(row.id, user, "accepted");
  res.json(respond(row.id, user));
});

shipmentsRouter.post("/:id/decline", requireRole("trucker"), (req, res) => {
  const user = currentUser(req);
  const row = getShipment(req.params.id as string);
  assertOwnShipment(row, user);
  assertStatus(row, ["assigned"]);
  db.prepare(
    `UPDATE shipments SET status = 'unassigned', trucker_id = NULL, carrier_id = NULL,
       totp_secret = NULL, last_totp_step = NULL, declined_by = ?
     WHERE id = ?`,
  ).run(user.truckerId ?? null, row.id);
  audit(row.id, user, "declined");
  // The trucker no longer owns it, so there's nothing of theirs to return.
  res.json({ ok: true });
});

shipmentsRouter.post("/:id/arrive", requireRole("trucker"), (req, res) => {
  const user = currentUser(req);
  const row = getShipment(req.params.id as string);
  assertOwnShipment(row, user);
  assertStatus(row, ["en_route"]);
  db.prepare("UPDATE shipments SET status = 'at_warehouse', arrived_at = ? WHERE id = ?").run(now(), row.id);
  audit(row.id, user, "arrived");
  res.json(respond(row.id, user));
});

// ---------- clerk ----------

const TICKET_AUDIENCE = "dock-verify";
const CHECKABLE: ShipmentStatus[] = ["en_route", "at_warehouse"];

const scanSchema = z.union([
  z.object({ qr: z.string().min(1).max(4000) }),
  z.object({ code: z.string().regex(/^\d{6}$/, "Code must be 6 digits") }),
]);

/** Count a wrong code against a specific shipment; lock it after too many. */
function recordFailedCode(row: ShipmentRow, user: AuthUser): never {
  const attempts = row.failed_attempts + 1;
  const locked = attempts >= config.maxCodeAttempts;
  db.prepare("UPDATE shipments SET failed_attempts = ?, locked = ? WHERE id = ?").run(attempts, locked ? 1 : 0, row.id);
  audit(row.id, user, locked ? "scan_locked" : "scan_failed_code", { attempts });
  throw new HttpError(
    locked ? 423 : 400,
    locked
      ? "Too many invalid codes. Pass locked. Do NOT release the load; contact the coordinator."
      : "Code is invalid or has expired. Codes refresh every 30 seconds; ask the driver for the current one.",
    { attemptsRemaining: Math.max(0, config.maxCodeAttempts - attempts) },
  );
}

/**
 * Clerk scans the driver's QR (or types the 6-digit code). On success the
 * server returns the authoritative driver + delivery details from its own
 * records, plus a short-lived ticket that authorises the final verify step.
 */
shipmentsRouter.post("/scan", requireRole("clerk"), verifyLimiter, (req, res) => {
  const user = currentUser(req);
  const body = scanSchema.parse(req.body);

  let row: ShipmentRow;
  let code: string;
  let pass: DriverPass | null = null;

  if ("qr" in body) {
    pass = parsePass(body.qr);
    code = pass.code;
    const found = db.prepare(`${SHIPMENT_SELECT} WHERE s.id = ?`).get(pass.shipment.id) as unknown as ShipmentRow | undefined;
    if (!found) {
      audit(null, user, "scan_unknown_shipment", { shipmentId: pass.shipment.id });
      throw new HttpError(404, "This pass refers to an order TruTruck has no record of.");
    }
    row = found;
  } else {
    code = body.code;
    const candidates = db
      .prepare(`${SHIPMENT_SELECT} WHERE s.status IN ('en_route','at_warehouse') AND s.locked = 0 AND s.totp_secret IS NOT NULL`)
      .all() as unknown as ShipmentRow[];
    const matches = candidates.filter((r) => matchTotp(r.totp_secret!, code) !== null);
    if (matches.length === 0) {
      audit(null, user, "lookup_failed");
      throw new HttpError(404, "No active driver pass matches that code. Codes refresh every 30 seconds.");
    }
    if (matches.length > 1) {
      throw new HttpError(409, "That code matches more than one pass. Scan the driver's QR code instead.");
    }
    row = matches[0];
  }

  if (row.status === "assigned") {
    throw new HttpError(409, `${row.driver_name ?? "The driver"} hasn't accepted ${row.reference_code} yet.`);
  }
  if (row.status === "verified" || row.status === "in_transit") {
    audit(row.id, user, "scan_after_checkin");
    throw new HttpError(409, `${row.reference_code} has already been checked in. This pass is no longer valid.`);
  }
  if (row.status === "unassigned") {
    throw new HttpError(409, `${row.reference_code} has no driver assigned. This pass is no longer valid.`);
  }
  if (row.locked) {
    throw new HttpError(423, "Pass locked after too many invalid codes. Coordinator must reissue it.");
  }
  if (!row.totp_secret || !row.trucker_id) throw new HttpError(409, "No active pass for this order.");

  const step = matchTotp(row.totp_secret, code);
  if (step === null) recordFailedCode(row, user);

  // Each code works once: a photo of someone else's screen is useless after one scan.
  if (row.last_totp_step !== null && step <= row.last_totp_step) {
    audit(row.id, user, "scan_replayed", { step });
    throw new HttpError(409, "This code has already been used. Wait for the driver's next code (max 30 seconds).");
  }
  db.prepare("UPDATE shipments SET last_totp_step = ?, failed_attempts = 0 WHERE id = ?").run(step, row.id);

  const driver = getTrucker(row.trucker_id);
  const mismatches = pass ? comparePass(pass, row, driver) : [];
  if (mismatches.length > 0) {
    audit(row.id, user, "scan_tampered", { fields: mismatches.map((m) => m.field) });
    throw new HttpError(422, "Pass details don't match dispatch records. Possible forged pass: do NOT release the load.", {
      mismatches,
    });
  }

  audit(row.id, user, "scan_ok", { via: pass ? "qr" : "code" });
  const ticket = jwt.sign({ sid: row.id }, config.jwtSecret, { audience: TICKET_AUDIENCE, expiresIn: "5m" });
  res.json({
    via: pass ? "qr" : "code",
    shipment: shipmentDto(row, user),
    driver: truckerDto(driver),
    carrier: carrierDto(getCarrier(driver.carrier_id)),
    ticket,
  });
});

const verifySchema = z.object({
  ticket: z.string().min(1),
  idMatches: z.boolean(),
  vehicleMatches: z.boolean(),
  plateEntered: z.string().trim().min(2).max(20),
  dockNumber: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
});

shipmentsRouter.post("/:id/verify", requireRole("clerk"), verifyLimiter, (req, res) => {
  const user = currentUser(req);
  const body = verifySchema.parse(req.body);
  const row = getShipment(req.params.id as string);

  try {
    const payload = jwt.verify(body.ticket, config.jwtSecret, { audience: TICKET_AUDIENCE }) as { sid?: string };
    if (payload.sid !== row.id) throw new Error("ticket for another shipment");
  } catch {
    throw new HttpError(410, "Check-in session expired. Scan the driver's pass again.");
  }
  assertStatus(row, CHECKABLE);
  if (row.locked) throw new HttpError(423, "Pass locked. Coordinator must reissue it.");

  if (!body.idMatches || !body.vehicleMatches) {
    audit(row.id, user, "verify_failed_checks", { idMatches: body.idMatches, vehicleMatches: body.vehicleMatches });
    throw new HttpError(400, !body.idMatches
      ? "Driver ID does not match the assigned driver."
      : "Vehicle does not match the assigned plate/description.");
  }

  const driver = getTrucker(row.trucker_id ?? "");
  if (normalizePlate(body.plateEntered) !== normalizePlate(driver.vehicle_plate)) {
    audit(row.id, user, "plate_mismatch", { plateEntered: body.plateEntered });
    throw new HttpError(400, "Plate entered does not match the assigned vehicle.");
  }

  // Success: the pass is retired so it can't be used again.
  const dock = body.dockNumber || "Dock 1";
  transaction(() => {
    db.prepare(
      `UPDATE shipments SET status = 'verified', verified_at = ?, arrived_at = COALESCE(arrived_at, ?),
         dock_number = ?, verification_notes = ?, totp_secret = NULL, last_totp_step = NULL
       WHERE id = ?`,
    ).run(now(), now(), dock, body.notes ?? null, row.id);
    audit(row.id, user, "verified", { dockNumber: dock });
  });
  res.json(respond(row.id, user));
});

shipmentsRouter.post("/:id/release", requireRole("clerk"), (req, res) => {
  const user = currentUser(req);
  const row = getShipment(req.params.id as string);
  assertStatus(row, ["verified"]);
  db.prepare("UPDATE shipments SET status = 'in_transit', released_at = ? WHERE id = ?").run(now(), row.id);
  audit(row.id, user, "released");
  res.json(respond(row.id, user));
});
