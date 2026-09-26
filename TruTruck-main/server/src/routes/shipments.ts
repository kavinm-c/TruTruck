import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { db, type CarrierRow, type ShipmentRow, type ShipmentStatus, type TruckerRow } from "../db.js";
import { HttpError } from "../errors.js";
import { audit } from "../audit.js";
import { codeExpiry, codesMatch, generateCode, normalizePlate } from "../codes.js";
import { shipmentDto } from "../dto.js";
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
  const row = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id) as unknown as ShipmentRow | undefined;
  if (!row) throw new HttpError(404, "Shipment not found");
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
      .prepare("SELECT * FROM shipments WHERE trucker_id = ? ORDER BY pickup_date, reference_code")
      .all(user.truckerId ?? "") as unknown as ShipmentRow[];
  } else if (user.role === "clerk") {
    rows = db
      .prepare(
        `SELECT * FROM shipments WHERE status IN ('at_warehouse','verified','in_transit')
         ORDER BY arrived_at DESC`,
      )
      .all() as unknown as ShipmentRow[];
  } else {
    rows = db.prepare("SELECT * FROM shipments ORDER BY pickup_date, reference_code").all() as unknown as ShipmentRow[];
  }
  res.json(rows.map((r) => shipmentDto(r, user)));
});

// ---------- coordinator ----------

const assignSchema = z.object({ carrierId: z.string().min(1), truckerId: z.string().min(1) });

shipmentsRouter.post("/:id/assign", requireRole("coordinator"), (req, res) => {
  const user = currentUser(req);
  const { carrierId, truckerId } = assignSchema.parse(req.body);
  const row = getShipment(req.params.id as string);
  assertStatus(row, ["unassigned", "assigned", "en_route"]);

  const carrier = db.prepare("SELECT * FROM carriers WHERE id = ?").get(carrierId) as unknown as CarrierRow | undefined;
  if (!carrier) throw new HttpError(404, "Carrier not found");
  if (carrier.cvor_status !== "active") {
    audit(row.id, user, "assign_blocked_carrier", { carrierId, cvorStatus: carrier.cvor_status });
    throw new HttpError(422, `${carrier.name}'s CVOR registration is ${carrier.cvor_status}. Cannot dispatch.`);
  }

  const trucker = db.prepare("SELECT * FROM truckers WHERE id = ?").get(truckerId) as unknown as TruckerRow | undefined;
  if (!trucker) throw new HttpError(404, "Trucker not found");
  if (trucker.carrier_id !== carrierId) throw new HttpError(422, "Trucker does not belong to that carrier");

  db.prepare(
    `UPDATE shipments SET carrier_id = ?, trucker_id = ?, status = 'assigned',
       verification_code = ?, code_expires_at = ?, failed_attempts = 0, locked = 0,
       acknowledged_at = NULL, arrived_at = NULL
     WHERE id = ?`,
  ).run(carrierId, truckerId, generateCode(), codeExpiry(), row.id);

  audit(row.id, user, row.trucker_id ? "reassigned" : "assigned", { carrierId, truckerId });
  res.json(respond(row.id, user));
});

shipmentsRouter.post("/:id/reissue-code", requireRole("coordinator"), (req, res) => {
  const user = currentUser(req);
  const row = getShipment(req.params.id as string);
  assertStatus(row, ["assigned", "en_route", "at_warehouse"]);
  db.prepare(
    `UPDATE shipments SET verification_code = ?, code_expires_at = ?, failed_attempts = 0, locked = 0
     WHERE id = ?`,
  ).run(generateCode(), codeExpiry(), row.id);
  audit(row.id, user, "code_reissued");
  res.json(respond(row.id, user));
});

// ---------- trucker ----------

shipmentsRouter.post("/:id/acknowledge", requireRole("trucker"), (req, res) => {
  const user = currentUser(req);
  const row = getShipment(req.params.id as string);
  assertOwnShipment(row, user);
  assertStatus(row, ["assigned"]);
  db.prepare("UPDATE shipments SET status = 'en_route', acknowledged_at = ? WHERE id = ?").run(now(), row.id);
  audit(row.id, user, "acknowledged");
  res.json(respond(row.id, user));
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

const codeSchema = z.string().regex(/^\d{6}$/, "Code must be 6 digits");

/** Find which waiting shipment a driver's code belongs to (rate-limited). */
shipmentsRouter.post("/lookup", requireRole("clerk"), verifyLimiter, (req, res) => {
  const user = currentUser(req);
  const code = codeSchema.parse(req.body?.code);
  const candidates = db
    .prepare("SELECT * FROM shipments WHERE status = 'at_warehouse' AND locked = 0")
    .all() as unknown as ShipmentRow[];
  const match = candidates.find(
    (r) => r.verification_code && codesMatch(code, r.verification_code),
  );
  if (!match) {
    audit(null, user, "lookup_failed");
    throw new HttpError(404, "No shipment awaiting check-in matches that code.");
  }
  res.json(shipmentDto(match, user));
});

const verifySchema = z.object({
  code: codeSchema,
  idMatches: z.boolean(),
  vehicleMatches: z.boolean(),
  plateEntered: z.string().max(20).optional(),
  dockNumber: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
});

shipmentsRouter.post("/:id/verify", requireRole("clerk"), verifyLimiter, (req, res) => {
  const user = currentUser(req);
  const body = verifySchema.parse(req.body);
  const row = getShipment(req.params.id as string);
  assertStatus(row, ["at_warehouse"]);

  if (row.locked) {
    throw new HttpError(423, "Code locked after too many failed attempts. Coordinator must reissue a code.");
  }
  if (!row.verification_code) throw new HttpError(409, "No active code for this shipment");
  if (row.code_expires_at && new Date(row.code_expires_at) < new Date()) {
    audit(row.id, user, "verify_failed_expired");
    throw new HttpError(410, "Code has expired. Coordinator must reissue a code.");
  }

  if (!codesMatch(body.code, row.verification_code)) {
    const attempts = row.failed_attempts + 1;
    const locked = attempts >= config.maxCodeAttempts;
    db.prepare("UPDATE shipments SET failed_attempts = ?, locked = ? WHERE id = ?").run(
      attempts, locked ? 1 : 0, row.id,
    );
    audit(row.id, user, locked ? "verify_locked" : "verify_failed_code", { attempts });
    throw new HttpError(
      locked ? 423 : 400,
      locked
        ? "Too many wrong codes. Shipment locked. Do NOT release the load; contact the coordinator."
        : "Verification code does not match this shipment.",
      { attemptsRemaining: Math.max(0, config.maxCodeAttempts - attempts) },
    );
  }

  if (!body.idMatches || !body.vehicleMatches) {
    audit(row.id, user, "verify_failed_checks", {
      idMatches: body.idMatches, vehicleMatches: body.vehicleMatches,
    });
    throw new HttpError(400, !body.idMatches
      ? "Driver ID does not match the assigned trucker."
      : "Vehicle does not match the assigned plate/description.");
  }

  if (body.plateEntered) {
    const trucker = db.prepare("SELECT vehicle_plate FROM truckers WHERE id = ?")
      .get(row.trucker_id ?? "") as unknown as Pick<TruckerRow, "vehicle_plate"> | undefined;
    if (!trucker || normalizePlate(body.plateEntered) !== normalizePlate(trucker.vehicle_plate)) {
      audit(row.id, user, "plate_mismatch", { plateEntered: body.plateEntered });
      throw new HttpError(400, "Plate entered does not match the assigned vehicle.");
    }
  }

  // Success: code is single-use, so wipe it.
  db.prepare(
    `UPDATE shipments SET status = 'verified', verified_at = ?, dock_number = ?,
       verification_notes = ?, verification_code = NULL, code_expires_at = NULL
     WHERE id = ?`,
  ).run(now(), body.dockNumber || "Dock 1", body.notes ?? null, row.id);
  audit(row.id, user, "verified", { dockNumber: body.dockNumber || "Dock 1" });
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
