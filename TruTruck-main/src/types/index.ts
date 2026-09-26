export type Role = "coordinator" | "trucker" | "clerk";

export type ShipmentStatus =
  | "unassigned"
  | "assigned"
  | "en_route"
  | "at_warehouse"
  | "verified"
  | "in_transit";

export interface Carrier {
  id: string;
  name: string;
  phone: string;
  cvorNumber?: string;
  cvorStatus?: "active" | "expired" | "suspended";
}

export interface Trucker {
  id: string;
  name: string;
  phone: string;
  carrierId: string;
  licenseNumber: string;
  vehiclePlate: string;
  vehicleDescription: string;
}

export interface Shipment {
  id: string;
  referenceCode: string;
  what: string;
  origin: string;
  destination: string;
  pickupDate: string;
  pickupWindow: string;
  status: ShipmentStatus;
  carrierId?: string;
  truckerId?: string;
  verificationCode?: string;
  dockNumber?: string;
  acknowledgedAt?: string;
  arrivedAt?: string;
  verifiedAt?: string;
  verificationNotes?: string;
  codeExpiresAt?: string;
  releasedAt?: string;
  failedAttempts?: number;
  locked?: boolean;
}

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  en_route: "En route to pickup",
  at_warehouse: "At warehouse",
  verified: "Verified",
  in_transit: "In transit",
};
