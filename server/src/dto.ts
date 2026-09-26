import type { AuthUser } from "./auth.js";
import type { CarrierRow, ShipmentRow, DriverRow } from "./db.js";

// The driver only gets the pass secret once they've accepted the delivery,
// and loses it once the clerk has verified them at the dock.
const PASS_VISIBLE_STATUSES = new Set(["en_route", "at_warehouse"]);

/**
 * Shape a shipment for the caller's role. The TOTP secret is ONLY ever
 * returned to the driver assigned to that shipment. Coordinators and clerks
 * never see it, so the clerk has to get the rotating code from the driver.
 */
export function shipmentDto(row: ShipmentRow, user: AuthUser) {
  const isAssignedDriver = user.role === "driver" && row.driver_id === user.driverId;
  return {
    id: row.id,
    referenceCode: row.reference_code,
    cargo: row.cargo,
    pickupLocation: row.pickup_location,
    dropoffLocation: row.dropoff_location,
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    status: row.status,
    carrierId: row.carrier_id ?? undefined,
    carrierName: row.carrier_name ?? undefined,
    driverId: row.driver_id ?? undefined,
    driverName: row.driver_name ?? undefined,
    totpSecret:
      isAssignedDriver && PASS_VISIBLE_STATUSES.has(row.status)
        ? (row.totp_secret ?? undefined)
        : undefined,
    dockNumber: row.dock_number ?? undefined,
    acceptedAt: row.accepted_at ?? undefined,
    arrivedAt: row.arrived_at ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    releasedAt: row.released_at ?? undefined,
    verificationNotes: row.verification_notes ?? undefined,
    createdAt: row.created_at,
    ...(user.role !== "driver" && {
      failedAttempts: row.failed_attempts,
      locked: row.locked === 1,
    }),
    ...(user.role === "coordinator" && {
      declinedBy: row.declined_by_name ?? undefined,
    }),
  };
}

export function carrierDto(row: CarrierRow) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    cvorNumber: row.cvor_number,
    cvorStatus: row.cvor_status,
  };
}

export function driverDto(row: DriverRow) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    photo: row.photo ?? undefined,
    carrierId: row.carrier_id,
    licenseNumber: row.license_number,
    vehiclePlate: row.vehicle_plate,
    vehicleDescription: row.vehicle_description,
  };
}
