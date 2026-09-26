import { request, type Session } from "@/services/api";
import type { ScanResult, Shipment } from "@/types";

const CLERK: Session = { role: "clerk" };

/** What the clerk captured: the raw QR text, or a 6-digit code typed by hand. */
export type ScanInput = { qr: string } | { code: string };

export interface VerificationRequest {
  shipmentId: string;
  ticket: string;
  idMatches: boolean;
  vehicleMatches: boolean;
  plateEntered: string;
  dockNumber: string;
  notes?: string;
}

/**
 * Server checks the rotating TOTP code (30s, single-use, 5-attempt lockout)
 * and, for QR scans, that the pass details match dispatch records. Returns the
 * authoritative driver details plus a short-lived ticket for the verify step.
 */
export function scanDriverPass(input: ScanInput): Promise<ScanResult> {
  const body = "code" in input ? { code: input.code.trim() } : input;
  return request<ScanResult>(CLERK, "/shipments/scan", { method: "POST", body });
}

/** Server re-checks the ticket, the ID/vehicle checks and the plate. */
export function verifyDriverIdentity(req: VerificationRequest): Promise<Shipment> {
  return request<Shipment>(CLERK, `/shipments/${req.shipmentId}/verify`, {
    method: "POST",
    body: {
      ticket: req.ticket,
      idMatches: req.idMatches,
      vehicleMatches: req.vehicleMatches,
      plateEntered: req.plateEntered,
      dockNumber: req.dockNumber,
      notes: req.notes,
    },
  });
}
