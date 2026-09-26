import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db, type TruckerRow } from "../db.js";
import { truckerDto } from "../dto.js";
import { HttpError } from "../errors.js";
import { audit } from "../audit.js";
import { currentUser, requireAuth, requireRole } from "../auth.js";

export const truckersRouter = Router();
truckersRouter.use(requireAuth);

/**
 * Coordinators see every driver. Truckers only see themselves. Clerks get no
 * list at all: they only see a driver's details after scanning a valid pass.
 */
truckersRouter.get("/", requireRole("coordinator", "trucker"), (req, res) => {
  const user = currentUser(req);
  const rows = (
    user.role === "trucker"
      ? db.prepare("SELECT * FROM truckers WHERE id = ?").all(user.truckerId ?? "")
      : db.prepare("SELECT * FROM truckers ORDER BY name").all()
  ) as unknown as TruckerRow[];
  res.json(rows.map(truckerDto));
});

// Photos are resized in the browser before upload, so 400k chars is generous.
const photoSchema = z
  .string()
  .max(400_000, "Photo is too large")
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Photo must be a JPEG, PNG or WebP image");

const driverSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[+()\-.\s\d]{7,20}$/, "Enter a valid phone number"),
  email: z.string().trim().toLowerCase().email().max(120),
  licenseNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9\- ]{5,30}$/, "Enter a valid licence number"),
  carrierId: z.string().min(1),
  vehiclePlate: z.string().trim().toUpperCase().min(2).max(12),
  vehicleDescription: z.string().trim().max(120).default(""),
  photo: photoSchema,
});

function assertCarrier(carrierId: string) {
  if (!db.prepare("SELECT 1 FROM carriers WHERE id = ?").get(carrierId)) {
    throw new HttpError(404, "Carrier not found");
  }
}

/** Email and licence number identify a driver, so they must be unique. */
function assertUnique(email: string, licenseNumber: string, exceptId = "") {
  const clash = db
    .prepare(
      `SELECT email, license_number FROM truckers
       WHERE id != ? AND (email = ? COLLATE NOCASE OR license_number = ? COLLATE NOCASE)`,
    )
    .get(exceptId, email, licenseNumber) as unknown as Pick<TruckerRow, "email" | "license_number"> | undefined;
  if (!clash) return;
  throw new HttpError(
    409,
    clash.email.toLowerCase() === email.toLowerCase()
      ? "Another driver already uses that email."
      : "Another driver already has that licence number.",
  );
}

function getTrucker(id: string): TruckerRow {
  const row = db.prepare("SELECT * FROM truckers WHERE id = ?").get(id) as unknown as TruckerRow | undefined;
  if (!row) throw new HttpError(404, "Driver not found");
  return row;
}

truckersRouter.post("/", requireRole("coordinator"), (req, res) => {
  const user = currentUser(req);
  const body = driverSchema.parse(req.body);
  assertCarrier(body.carrierId);
  assertUnique(body.email, body.licenseNumber);

  const id = `trk-${randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO truckers (id, name, phone, email, photo, carrier_id, license_number, vehicle_plate, vehicle_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, body.name, body.phone, body.email, body.photo, body.carrierId, body.licenseNumber,
    body.vehiclePlate, body.vehicleDescription);

  audit(null, user, "driver_added", { truckerId: id, name: body.name });
  res.status(201).json(truckerDto(getTrucker(id)));
});

// Editing may omit the photo to keep the current one.
truckersRouter.put("/:id", requireRole("coordinator"), (req, res) => {
  const user = currentUser(req);
  const existing = getTrucker(req.params.id as string);
  const body = driverSchema.extend({ photo: photoSchema.optional() }).parse(req.body);
  assertCarrier(body.carrierId);
  assertUnique(body.email, body.licenseNumber, existing.id);

  db.prepare(
    `UPDATE truckers SET name = ?, phone = ?, email = ?, photo = ?, carrier_id = ?, license_number = ?,
       vehicle_plate = ?, vehicle_description = ?
     WHERE id = ?`,
  ).run(body.name, body.phone, body.email, body.photo ?? existing.photo, body.carrierId, body.licenseNumber,
    body.vehiclePlate, body.vehicleDescription, existing.id);
  // Keep open orders pointing at the driver's current carrier.
  db.prepare(
    `UPDATE shipments SET carrier_id = ?
     WHERE trucker_id = ? AND status IN ('assigned','en_route','at_warehouse')`,
  ).run(body.carrierId, existing.id);

  audit(null, user, "driver_updated", { truckerId: existing.id });
  res.json(truckerDto(getTrucker(existing.id)));
});
