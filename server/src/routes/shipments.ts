import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import {
  must,
  maybe,
  supabase,
  selectShipments,
  shipmentRows,
  type CarrierRow,
  type ShipmentRow,
  type ShipmentStatus,
  type DriverRow,
} from "../db.js";
import { HttpError } from "../errors.js";
import { audit } from "../audit.js";
import { generateSecret, matchTotp, normalizePlate } from "../totp.js";
import { comparePass, parsePass, type DriverPass } from "../pass.js";
import { carrierDto, shipmentDto, driverDto } from "../dto.js";
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

async function findShipment(id: string): Promise<ShipmentRow | undefined> {
  const [row] = shipmentRows(must(await selectShipments().eq("id", id)));
  return row;
}

async function updateShipment(id: string, patch: Partial<ShipmentRow>) {
  must(await supabase.from("shipments").update(patch).eq("id", id));
}

const now = () => new Date().toISOString();

async function getShipment(id: string): Promise<ShipmentRow> {
  const row = await findShipment(id);
  if (!row) throw new HttpError(404, "Shipment not found");
  return row;
}

async function getDriver(id: string): Promise<DriverRow> {
  const row = maybe(await supabase.from("drivers").select("*").eq("id", id).maybeSingle()) as DriverRow | null;
  if (!row) throw new HttpError(404, "Driver not found");
  return row;
}

async function getCarrier(id: string): Promise<CarrierRow> {
  const row = maybe(await supabase.from("carriers").select("*").eq("id", id).maybeSingle()) as CarrierRow | null;
  if (!row) throw new HttpError(404, "Carrier not found");
  return row;
}

function assertStatus(row: ShipmentRow, allowed: ShipmentStatus[]) {
  if (!allowed.includes(row.status)) {
    throw new HttpError(409, `Shipment is '${row.status}'; expected ${allowed.join(" or ")}`);
  }
}

function assertOwnShipment(row: ShipmentRow, user: AuthUser) {
  if (row.driver_id !== user.driverId) throw new HttpError(403, "Not your shipment");
}

/** Dispatch is blocked when the driver's carrier registration isn't active. */
async function dispatchableDriver(driverId: string, shipmentId: string | null, user: AuthUser) {
  const driver = await getDriver(driverId);
  const carrier = await getCarrier(driver.carrier_id);
  if (carrier.cvor_status !== "active") {
    await audit(shipmentId, user, "assign_blocked_carrier", { driverId, carrierId: carrier.id, cvorStatus: carrier.cvor_status });
    throw new HttpError(422, `${carrier.name}'s CVOR registration is ${carrier.cvor_status}. Cannot dispatch ${driver.name}.`);
  }
  return { driver, carrier };
}

async function respond(id: string, user: AuthUser) {
  return shipmentDto(await getShipment(id), user);
}

// ---------- list ----------

shipmentsRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  let rows: ShipmentRow[];
  if (user.role === "driver") {
    rows = shipmentRows(must(
      await selectShipments().eq("driver_id", user.driverId ?? "").order("pickup_date").order("pickup_time"),
    ));
  } else if (user.role === "clerk") {
    rows = shipmentRows(must(await selectShipments().in("status", ["at_warehouse", "verified", "in_transit"])));
    // Most recent check-in first (PostgREST can't order by an expression).
    const checkedIn = (r: ShipmentRow) => r.verified_at ?? r.arrived_at ?? "";
    rows.sort((a, b) => checkedIn(b).localeCompare(checkedIn(a)));
  } else {
    rows = shipmentRows(must(
      await selectShipments().order("pickup_date").order("pickup_time").order("reference_code"),
    ));
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
  driverId: z.string().min(1).optional(),
});

async function nextReference(): Promise<{ id: string; ref: string }> {
  const refs = must(await supabase.from("shipments").select("reference_code"));
  const n = Math.max(1000, ...refs.map((r) => Number(r.reference_code.slice(4)) || 0));
  const next = n + 1;
  return { id: `shp-${next}`, ref: `TRU-${next}` };
}

/** Create a delivery order. A pass secret is minted as soon as a driver is assigned. */
shipmentsRouter.post("/", requireRole("coordinator"), async (req, res) => {
  const user = currentUser(req);
  const body = orderSchema.parse(req.body);
  if (body.pickupLocation.toLowerCase() === body.dropoffLocation.toLowerCase()) {
    throw new HttpError(422, "Pickup and drop-off locations must be different.");
  }
  const dispatch = body.driverId ? await dispatchableDriver(body.driverId, null, user) : null;

  const { id, ref } = await nextReference();
  must(
    await supabase.from("shipments").insert({
      id, reference_code: ref, cargo: body.cargo, pickup_location: body.pickupLocation,
      dropoff_location: body.dropoffLocation, pickup_date: body.pickupDate, pickup_time: body.pickupTime,
      status: dispatch ? "assigned" : "unassigned", carrier_id: dispatch?.carrier.id ?? null,
      driver_id: dispatch?.driver.id ?? null, totp_secret: dispatch ? generateSecret() : null,
    }),
  );

  await audit(id, user, "order_created", { driverId: dispatch?.driver.id ?? null });
  res.status(201).json(await respond(id, user));
});

const assignSchema = z.object({ driverId: z.string().min(1) });

shipmentsRouter.post("/:id/assign", requireRole("coordinator"), async (req, res) => {
  const user = currentUser(req);
  const { driverId } = assignSchema.parse(req.body);
  const row = await getShipment(req.params.id as string);
  assertStatus(row, ["unassigned", "assigned", "en_route"]);
  const { driver, carrier } = await dispatchableDriver(driverId, row.id, user);

  // New driver means a brand-new pass secret; the old driver's pass stops working.
  await updateShipment(row.id, {
    carrier_id: carrier.id, driver_id: driver.id, status: "assigned",
    totp_secret: generateSecret(), last_totp_step: null, failed_attempts: 0, locked: false,
    declined_by: null, accepted_at: null, arrived_at: null,
  });

  await audit(row.id, user, row.driver_id ? "reassigned" : "assigned", { driverId });
  res.json(await respond(row.id, user));
});

/** Rotate the pass secret, e.g. after a lockout or a lost phone. */
shipmentsRouter.post("/:id/reissue-code", requireRole("coordinator"), async (req, res) => {
  const user = currentUser(req);
  const row = await getShipment(req.params.id as string);
  assertStatus(row, ["assigned", "en_route", "at_warehouse"]);
  await updateShipment(row.id, { totp_secret: generateSecret(), last_totp_step: null, failed_attempts: 0, locked: false });
  await audit(row.id, user, "pass_reissued");
  res.json(await respond(row.id, user));
});

// Orders can be revoked any time before the load leaves the dock.
const REVOCABLE: ShipmentStatus[] = ["unassigned", "assigned", "en_route", "at_warehouse", "verified"];
const revokeSchema = z.object({ reason: z.string().trim().max(200).optional() });

/** Cancel an order. The driver's pass stops working immediately. */
shipmentsRouter.post("/:id/revoke", requireRole("coordinator"), async (req, res) => {
  const user = currentUser(req);
  const { reason } = revokeSchema.parse(req.body ?? {});
  const row = await getShipment(req.params.id as string);
  if (row.status === "cancelled") throw new HttpError(409, `${row.reference_code} is already cancelled.`);
  if (row.status === "in_transit") {
    throw new HttpError(409, `${row.reference_code} has already left the dock and can't be revoked.`);
  }
  assertStatus(row, REVOCABLE);

  try {
    await updateShipment(row.id, {
      status: "cancelled", cancelled_at: now(), cancel_reason: reason || null,
      totp_secret: null, last_totp_step: null, locked: false, failed_attempts: 0,
    });
  } catch (e) {
    // Most likely the database predates the 'cancelled' status.
    console.error(e);
    throw new HttpError(503, "The database needs an update before orders can be revoked. " +
      "Run server/migrations/002_revoke_orders.sql in the Supabase SQL Editor.");
  }
  await audit(row.id, user, "revoked", { previousStatus: row.status, reason: reason || null });
  res.json(await respond(row.id, user));
});

// ---------- driver ----------

shipmentsRouter.post("/:id/accept", requireRole("driver"), async (req, res) => {
  const user = currentUser(req);
  const row = await getShipment(req.params.id as string);
  assertOwnShipment(row, user);
  assertStatus(row, ["assigned"]);
  await updateShipment(row.id, { status: "en_route", accepted_at: now() });
  await audit(row.id, user, "accepted");
  res.json(await respond(row.id, user));
});

shipmentsRouter.post("/:id/decline", requireRole("driver"), async (req, res) => {
  const user = currentUser(req);
  const row = await getShipment(req.params.id as string);
  assertOwnShipment(row, user);
  assertStatus(row, ["assigned"]);
  await updateShipment(row.id, {
    status: "unassigned", driver_id: null, carrier_id: null,
    totp_secret: null, last_totp_step: null, declined_by: user.driverId ?? null,
  });
  await audit(row.id, user, "declined");
  // The driver no longer owns it, so there's nothing of theirs to return.
  res.json({ ok: true });
});

shipmentsRouter.post("/:id/arrive", requireRole("driver"), async (req, res) => {
  const user = currentUser(req);
  const row = await getShipment(req.params.id as string);
  assertOwnShipment(row, user);
  assertStatus(row, ["en_route"]);
  await updateShipment(row.id, { status: "at_warehouse", arrived_at: now() });
  await audit(row.id, user, "arrived");
  res.json(await respond(row.id, user));
});

// ---------- clerk ----------

const TICKET_AUDIENCE = "dock-verify";
const CHECKABLE: ShipmentStatus[] = ["en_route", "at_warehouse"];

const scanSchema = z.union([
  z.object({ qr: z.string().min(1).max(4000) }),
  z.object({ code: z.string().regex(/^\d{6}$/, "Code must be 6 digits") }),
]);

/** Count a wrong code against a specific shipment; lock it after too many. Returns the error to throw. */
async function recordFailedCode(row: ShipmentRow, user: AuthUser): Promise<HttpError> {
  const attempts = row.failed_attempts + 1;
  const locked = attempts >= config.maxCodeAttempts;
  await updateShipment(row.id, { failed_attempts: attempts, locked });
  await audit(row.id, user, locked ? "scan_locked" : "scan_failed_code", { attempts });
  return new HttpError(
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
shipmentsRouter.post("/scan", requireRole("clerk"), verifyLimiter, async (req, res) => {
  const user = currentUser(req);
  const body = scanSchema.parse(req.body);

  let row: ShipmentRow;
  let code: string;
  let pass: DriverPass | null = null;

  if ("qr" in body) {
    pass = parsePass(body.qr);
    code = pass.code;
    const found = await findShipment(pass.shipment.id);
    if (!found) {
      await audit(null, user, "scan_unknown_shipment", { shipmentId: pass.shipment.id });
      throw new HttpError(404, "This pass refers to an order TruTruck has no record of.");
    }
    row = found;
  } else {
    code = body.code;
    const candidates = shipmentRows(must(
      await selectShipments()
        .in("status", ["en_route", "at_warehouse"]).eq("locked", false).not("totp_secret", "is", null),
    ));
    const matches = candidates.filter((r) => matchTotp(r.totp_secret!, code) !== null);
    if (matches.length === 0) {
      await audit(null, user, "lookup_failed");
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
    await audit(row.id, user, "scan_after_checkin");
    throw new HttpError(409, `${row.reference_code} has already been checked in. This pass is no longer valid.`);
  }
  if (row.status === "cancelled") {
    await audit(row.id, user, "scan_cancelled_order");
    throw new HttpError(409, `${row.reference_code} was cancelled by dispatch. Do NOT release the load.`);
  }
  if (row.status === "unassigned") {
    throw new HttpError(409, `${row.reference_code} has no driver assigned. This pass is no longer valid.`);
  }
  if (row.locked) {
    throw new HttpError(423, "Pass locked after too many invalid codes. Coordinator must reissue it.");
  }
  if (!row.totp_secret || !row.driver_id) throw new HttpError(409, "No active pass for this order.");

  const step = matchTotp(row.totp_secret, code);
  if (step === null) throw await recordFailedCode(row, user);

  // Each code works once: a photo of someone else's screen is useless after one scan.
  if (row.last_totp_step !== null && step <= row.last_totp_step) {
    await audit(row.id, user, "scan_replayed", { step });
    throw new HttpError(409, "This code has already been used. Wait for the driver's next code (max 30 seconds).");
  }
  await updateShipment(row.id, { last_totp_step: step, failed_attempts: 0 });

  const driver = await getDriver(row.driver_id);
  const mismatches = pass ? comparePass(pass, row, driver) : [];
  if (mismatches.length > 0) {
    await audit(row.id, user, "scan_tampered", { fields: mismatches.map((m) => m.field) });
    throw new HttpError(422, "Pass details don't match dispatch records. Possible forged pass: do NOT release the load.", {
      mismatches,
    });
  }

  await audit(row.id, user, "scan_ok", { via: pass ? "qr" : "code" });
  const ticket = jwt.sign({ sid: row.id }, config.jwtSecret, { audience: TICKET_AUDIENCE, expiresIn: "5m" });
  res.json({
    via: pass ? "qr" : "code",
    shipment: shipmentDto(row, user),
    driver: driverDto(driver),
    carrier: carrierDto(await getCarrier(driver.carrier_id)),
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

shipmentsRouter.post("/:id/verify", requireRole("clerk"), verifyLimiter, async (req, res) => {
  const user = currentUser(req);
  const body = verifySchema.parse(req.body);
  const row = await getShipment(req.params.id as string);

  try {
    const payload = jwt.verify(body.ticket, config.jwtSecret, { audience: TICKET_AUDIENCE }) as { sid?: string };
    if (payload.sid !== row.id) throw new Error("ticket for another shipment");
  } catch {
    throw new HttpError(410, "Check-in session expired. Scan the driver's pass again.");
  }
  assertStatus(row, CHECKABLE);
  if (row.locked) throw new HttpError(423, "Pass locked. Coordinator must reissue it.");

  if (!body.idMatches || !body.vehicleMatches) {
    await audit(row.id, user, "verify_failed_checks", { idMatches: body.idMatches, vehicleMatches: body.vehicleMatches });
    throw new HttpError(400, !body.idMatches
      ? "Driver ID does not match the assigned driver."
      : "Vehicle does not match the assigned plate/description.");
  }

  const driver = await getDriver(row.driver_id ?? "");
  if (normalizePlate(body.plateEntered) !== normalizePlate(driver.vehicle_plate)) {
    await audit(row.id, user, "plate_mismatch", { plateEntered: body.plateEntered });
    throw new HttpError(400, "Plate entered does not match the assigned vehicle.");
  }

  // Success: the pass is retired so it can't be used again.
  const dock = body.dockNumber || "Dock 1";
  await updateShipment(row.id, {
    status: "verified", verified_at: now(), arrived_at: row.arrived_at ?? now(),
    dock_number: dock, verification_notes: body.notes ?? null, totp_secret: null, last_totp_step: null,
  });
  await audit(row.id, user, "verified", { dockNumber: dock });
  res.json(await respond(row.id, user));
});

shipmentsRouter.post("/:id/release", requireRole("clerk"), async (req, res) => {
  const user = currentUser(req);
  const row = await getShipment(req.params.id as string);
  assertStatus(row, ["verified"]);
  await updateShipment(row.id, { status: "in_transit", released_at: now() });
  await audit(row.id, user, "released");
  res.json(await respond(row.id, user));
});
