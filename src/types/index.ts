export type Role = "coordinator" | "driver" | "clerk";

export type ShipmentStatus =
  | "unassigned"
  | "assigned"
  | "en_route"
  | "at_warehouse"
  | "verified"
  | "in_transit"
  | "cancelled";

export interface Carrier {
  id: string;
  name: string;
  phone: string;
  cvorNumber: string;
  cvorStatus: "active" | "expired" | "suspended";
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** Data URL of the driver's ID photo. */
  photo?: string;
  carrierId: string;
  licenseNumber: string;
  vehiclePlate: string;
  vehicleDescription: string;
}

export type DriverInput = Omit<Driver, "id">;

export interface Shipment {
  id: string;
  referenceCode: string;
  cargo: string;
  pickupLocation: string;
  dropoffLocation: string;
  /** YYYY-MM-DD */
  pickupDate: string;
  /** HH:MM, 24-hour */
  pickupTime: string;
  status: ShipmentStatus;
  carrierId?: string;
  carrierName?: string;
  driverId?: string;
  driverName?: string;
  /** Base32 TOTP secret. Only sent to the assigned driver after they accept. */
  totpSecret?: string;
  dockNumber?: string;
  acceptedAt?: string;
  arrivedAt?: string;
  verifiedAt?: string;
  releasedAt?: string;
  verificationNotes?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  failedAttempts?: number;
  locked?: boolean;
  /** Coordinator only: name of the driver who last declined this order. */
  declinedBy?: string;
}

export interface OrderInput {
  cargo: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDate: string;
  pickupTime: string;
  driverId?: string;
}

/** What the clerk gets back after a valid QR / code scan. */
export interface ScanResult {
  via: "qr" | "code";
  shipment: Shipment;
  driver: Driver;
  carrier: Carrier;
  /** Short-lived server ticket that authorises the final verify step. */
  ticket: string;
}

export interface PassMismatch {
  field: string;
  onPass: string;
  onRecord: string;
}

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  unassigned: "Unassigned",
  assigned: "Awaiting acceptance",
  en_route: "Accepted · en route",
  at_warehouse: "At warehouse",
  verified: "Verified",
  in_transit: "In transit",
  cancelled: "Cancelled",
};

/** Display order for status filters. */
export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "unassigned",
  "assigned",
  "en_route",
  "at_warehouse",
  "verified",
  "in_transit",
  "cancelled",
];

/** Orders the coordinator can still revoke: anything that hasn't left the dock. */
export const REVOCABLE_STATUSES: ShipmentStatus[] = [
  "unassigned",
  "assigned",
  "en_route",
  "at_warehouse",
  "verified",
];
