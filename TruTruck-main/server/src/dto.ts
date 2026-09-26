import type { AuthUser } from "./auth.js";
import type { CarrierRow, ShipmentRow, TruckerRow } from "./db.js";

const CODE_VISIBLE_STATUSES = new Set(["assigned", "en_route", "at_warehouse"]);

/**
 * Shape a shipment for the caller's role. The verification code is ONLY
 * ever returned to the trucker assigned to that shipment. Coordinators and
 * clerks never see it, so the clerk has to get it from the driver in person.
 */
export function shipmentDto(row: ShipmentRow, user: AuthUser) {
  const isAssignedTrucker = user.role === "trucker" && row.trucker_id === user.truckerId;
  return {
    id: row.id,
    referenceCode: row.reference_code,
    what: row.what,
    origin: row.origin,
    destination: row.destination,
    pickupDate: row.pickup_date,
    pickupWindow: row.pickup_window,
    status: row.status,
    carrierId: row.carrier_id ?? undefined,
    truckerId: row.trucker_id ?? undefined,
    verificationCode:
      isAssignedTrucker && CODE_VISIBLE_STATUSES.has(row.status)
        ? (row.verification_code ?? undefined)
        : undefined,
    codeExpiresAt: row.code_expires_at ?? undefined,
    dockNumber: row.dock_number ?? undefined,
    acknowledgedAt: row.acknowledged_at ?? undefined,
    arrivedAt: row.arrived_at ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    releasedAt: row.released_at ?? undefined,
    verificationNotes: row.verification_notes ?? undefined,
    ...(user.role !== "trucker" && {
      failedAttempts: row.failed_attempts,
      locked: row.locked === 1,
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

export function truckerDto(row: TruckerRow, user: AuthUser) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    carrierId: row.carrier_id,
    // Truckers don't need other drivers' licence numbers.
    licenseNumber: user.role === "trucker" && row.id !== user.truckerId ? "" : row.license_number,
    vehiclePlate: row.vehicle_plate,
    vehicleDescription: row.vehicle_description,
  };
}
