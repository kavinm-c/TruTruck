import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { maybe, must, supabase, type DriverRow } from "../db.js";
import { driverDto } from "../dto.js";
import { HttpError } from "../errors.js";
import { audit } from "../audit.js";
import { currentUser, requireAuth, requireRole } from "../auth.js";

export const driversRouter = Router();
driversRouter.use(requireAuth);

/**
 * Coordinators see every driver. Drivers only see themselves. Clerks get no
 * list at all: they only see a driver's details after scanning a valid pass.
 */
driversRouter.get("/", requireRole("coordinator", "driver"), async (req, res) => {
  const user = currentUser(req);
  const query = supabase.from("drivers").select("*");
  const rows = must(
    await (user.role === "driver" ? query.eq("id", user.driverId ?? "") : query.order("name")),
  ) as DriverRow[];
  res.json(rows.map(driverDto));
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

async function assertCarrier(carrierId: string) {
  const found = maybe(await supabase.from("carriers").select("id").eq("id", carrierId).maybeSingle());
  if (!found) throw new HttpError(404, "Carrier not found");
}

/**
 * Email and licence number identify a driver, so they must be unique.
 * Both are normalised by driverSchema (lower/upper case), matching how they're stored;
 * the lower() unique indexes in schema.sql are the backstop.
 */
async function assertUnique(email: string, licenseNumber: string, exceptId = "") {
  const clash = async (column: "email" | "license_number", value: string) =>
    must(await supabase.from("drivers").select("id").ilike(column, escapeLike(value)).neq("id", exceptId).limit(1))
      .length > 0;
  if (await clash("email", email)) throw new HttpError(409, "Another driver already uses that email.");
  if (await clash("license_number", licenseNumber)) {
    throw new HttpError(409, "Another driver already has that licence number.");
  }
}

/** ilike without wildcards: an exact, case-insensitive match. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function getDriver(id: string): Promise<DriverRow> {
  const row = maybe(await supabase.from("drivers").select("*").eq("id", id).maybeSingle()) as DriverRow | null;
  if (!row) throw new HttpError(404, "Driver not found");
  return row;
}

driversRouter.post("/", requireRole("coordinator"), async (req, res) => {
  const user = currentUser(req);
  const body = driverSchema.parse(req.body);
  await assertCarrier(body.carrierId);
  await assertUnique(body.email, body.licenseNumber);

  const id = `drv-${randomUUID().slice(0, 8)}`;
  must(
    await supabase.from("drivers").insert({
      id, name: body.name, phone: body.phone, email: body.email, photo: body.photo, carrier_id: body.carrierId,
      license_number: body.licenseNumber, vehicle_plate: body.vehiclePlate, vehicle_description: body.vehicleDescription,
    }),
  );

  await audit(null, user, "driver_added", { driverId: id, name: body.name });
  res.status(201).json(driverDto(await getDriver(id)));
});

// Editing may omit the photo to keep the current one.
driversRouter.put("/:id", requireRole("coordinator"), async (req, res) => {
  const user = currentUser(req);
  const existing = await getDriver(req.params.id as string);
  const body = driverSchema.extend({ photo: photoSchema.optional() }).parse(req.body);
  await assertCarrier(body.carrierId);
  await assertUnique(body.email, body.licenseNumber, existing.id);

  must(
    await supabase.from("drivers").update({
      name: body.name, phone: body.phone, email: body.email, photo: body.photo ?? existing.photo,
      carrier_id: body.carrierId, license_number: body.licenseNumber, vehicle_plate: body.vehiclePlate,
      vehicle_description: body.vehicleDescription,
    }).eq("id", existing.id),
  );
  // Keep open orders pointing at the driver's current carrier.
  must(
    await supabase.from("shipments").update({ carrier_id: body.carrierId })
      .eq("driver_id", existing.id).in("status", ["assigned", "en_route", "at_warehouse"]),
  );

  await audit(null, user, "driver_updated", { driverId: existing.id });
  res.json(driverDto(await getDriver(existing.id)));
});
