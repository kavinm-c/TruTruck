import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sql, type DriverRow } from "../db.js";
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
  const rows =
    user.role === "driver"
      ? await sql<DriverRow[]>`SELECT * FROM drivers WHERE id = ${user.driverId ?? ""}`
      : await sql<DriverRow[]>`SELECT * FROM drivers ORDER BY name`;
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
  const [found] = await sql`SELECT 1 FROM carriers WHERE id = ${carrierId}`;
  if (!found) throw new HttpError(404, "Carrier not found");
}

/** Email and licence number identify a driver, so they must be unique. */
async function assertUnique(email: string, licenseNumber: string, exceptId = "") {
  const [clash] = await sql<Pick<DriverRow, "email" | "license_number">[]>`
    SELECT email, license_number FROM drivers
    WHERE id != ${exceptId}
      AND (lower(email) = lower(${email}) OR lower(license_number) = lower(${licenseNumber}))`;
  if (!clash) return;
  throw new HttpError(
    409,
    clash.email.toLowerCase() === email.toLowerCase()
      ? "Another driver already uses that email."
      : "Another driver already has that licence number.",
  );
}

async function getDriver(id: string): Promise<DriverRow> {
  const [row] = await sql<DriverRow[]>`SELECT * FROM drivers WHERE id = ${id}`;
  if (!row) throw new HttpError(404, "Driver not found");
  return row;
}

driversRouter.post("/", requireRole("coordinator"), async (req, res) => {
  const user = currentUser(req);
  const body = driverSchema.parse(req.body);
  await assertCarrier(body.carrierId);
  await assertUnique(body.email, body.licenseNumber);

  const id = `drv-${randomUUID().slice(0, 8)}`;
  await sql`
    INSERT INTO drivers (id, name, phone, email, photo, carrier_id, license_number, vehicle_plate, vehicle_description)
    VALUES (${id}, ${body.name}, ${body.phone}, ${body.email}, ${body.photo}, ${body.carrierId},
      ${body.licenseNumber}, ${body.vehiclePlate}, ${body.vehicleDescription})`;

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

  await sql.begin(async (tx) => {
    await tx`
      UPDATE drivers SET name = ${body.name}, phone = ${body.phone}, email = ${body.email},
        photo = ${body.photo ?? existing.photo}, carrier_id = ${body.carrierId},
        license_number = ${body.licenseNumber}, vehicle_plate = ${body.vehiclePlate},
        vehicle_description = ${body.vehicleDescription}
      WHERE id = ${existing.id}`;
    // Keep open orders pointing at the driver's current carrier.
    await tx`
      UPDATE shipments SET carrier_id = ${body.carrierId}
      WHERE driver_id = ${existing.id} AND status IN ('assigned','en_route','at_warehouse')`;
  });

  await audit(null, user, "driver_updated", { driverId: existing.id });
  res.json(driverDto(await getDriver(existing.id)));
});
