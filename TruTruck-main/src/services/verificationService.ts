import { request, type Session } from "@/services/api";
import type { Shipment } from "@/types";

export interface VerificationRequest {
  shipmentId: string;
  enteredCode: string;
  idMatches: boolean;
  vehicleMatches: boolean;
  plateEntered: string;
  dockNumber: string;
  notes?: string;
}

const CLERK: Session = { role: "clerk" };

/** Server checks code (single-use, expiring, 5-attempt lockout), ID, vehicle and plate. */
export function verifyDriverIdentity(req: VerificationRequest): Promise<Shipment> {
  return request<Shipment>(CLERK, `/shipments/${req.shipmentId}/verify`, {
    method: "POST",
    body: {
      code: req.enteredCode.trim(),
      idMatches: req.idMatches,
      vehicleMatches: req.vehicleMatches,
      plateEntered: req.plateEntered,
      dockNumber: req.dockNumber,
      notes: req.notes,
    },
  });
}

export function lookupShipmentByCode(code: string): Promise<Shipment> {
  return request<Shipment>(CLERK, "/shipments/lookup", {
    method: "POST",
    body: { code: code.trim() },
  });
}
