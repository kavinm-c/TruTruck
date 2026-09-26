import { z } from "zod";
import { HttpError } from "./errors.js";
import type { ShipmentRow, TruckerRow } from "./db.js";

/**
 * What the driver's app encodes in the QR code. It is rebuilt every 30s with
 * the current TOTP code. The server never trusts these details on their own:
 * the code proves the pass came from the assigned driver's device, and every
 * other field is compared against dispatch records to catch doctored QRs.
 */
export const passSchema = z.object({
  t: z.literal("trutruck-pass"),
  v: z.literal(1),
  code: z.string().regex(/^\d{6}$/),
  shipment: z.object({
    id: z.string().max(40),
    ref: z.string().max(40),
    pickup: z.string().max(200),
    dropoff: z.string().max(200),
    date: z.string().max(20),
    time: z.string().max(10),
  }),
  driver: z.object({
    id: z.string().max(40),
    name: z.string().max(80),
    phone: z.string().max(20),
    email: z.string().max(120),
    license: z.string().max(30),
    plate: z.string().max(12),
  }),
});

export type DriverPass = z.infer<typeof passSchema>;

export function parsePass(raw: string): DriverPass {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "That QR code isn't a TruTruck driver pass.");
  }
  const result = passSchema.safeParse(json);
  if (!result.success) throw new HttpError(400, "That QR code isn't a TruTruck driver pass.");
  return result.data;
}

export interface PassMismatch {
  field: string;
  onPass: string;
  onRecord: string;
}

/** Fields on the pass that disagree with what dispatch actually has on file. */
export function comparePass(pass: DriverPass, shipment: ShipmentRow, driver: TruckerRow): PassMismatch[] {
  const checks: [string, string, string][] = [
    ["Order reference", pass.shipment.ref, shipment.reference_code],
    ["Pickup location", pass.shipment.pickup, shipment.pickup_location],
    ["Drop-off location", pass.shipment.dropoff, shipment.dropoff_location],
    ["Pickup date", pass.shipment.date, shipment.pickup_date],
    ["Pickup time", pass.shipment.time, shipment.pickup_time],
    ["Driver", pass.driver.id, driver.id],
    ["Driver name", pass.driver.name, driver.name],
    ["Phone", pass.driver.phone, driver.phone],
    ["Email", pass.driver.email.toLowerCase(), driver.email.toLowerCase()],
    ["Licence number", pass.driver.license.toUpperCase(), driver.license_number.toUpperCase()],
    ["Vehicle plate", pass.driver.plate.toUpperCase(), driver.vehicle_plate.toUpperCase()],
  ];
  return checks
    .filter(([, onPass, onRecord]) => onPass !== onRecord)
    .map(([field, onPass, onRecord]) => ({ field, onPass, onRecord }));
}
