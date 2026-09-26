import type { Shipment, Trucker } from "@/types";

export interface VerificationRequest {
  shipment: Shipment;
  trucker: Trucker;
  enteredCode: string;
  idMatches: boolean;
  vehicleMatches: boolean;
}

export interface VerificationResult {
  approved: boolean;
  reason?: string;
}

/**
 * Stand-in for the real identity-verification API (planned backend).
 * Keeps the same request/response shape so the clerk view doesn't
 * need to change when this is swapped for a live fetch() call.
 */
export async function verifyDriverIdentity(
  request: VerificationRequest,
): Promise<VerificationResult> {
  const codeMatches = request.enteredCode.trim() === request.shipment.verificationCode;

  if (!codeMatches) {
    return { approved: false, reason: "Verification code does not match this shipment." };
  }
  if (!request.idMatches) {
    return { approved: false, reason: "Driver ID does not match the assigned trucker." };
  }
  if (!request.vehicleMatches) {
    return { approved: false, reason: "Vehicle does not match the assigned plate/description." };
  }

  return { approved: true };
}
