import type { Shipment, Trucker } from "@/types";

/**
 * Payload encoded in the driver's QR code. Must stay in sync with
 * `passSchema` in the server's src/pass.ts. The server re-checks every field
 * against its own records, so editing the QR only gets it rejected.
 */
export interface DriverPass {
  t: "trutruck-pass";
  v: 1;
  code: string;
  shipment: { id: string; ref: string; pickup: string; dropoff: string; date: string; time: string };
  driver: { id: string; name: string; phone: string; email: string; license: string; plate: string };
}

export function buildPass(shipment: Shipment, driver: Trucker, code: string): string {
  const pass: DriverPass = {
    t: "trutruck-pass",
    v: 1,
    code,
    shipment: {
      id: shipment.id,
      ref: shipment.referenceCode,
      pickup: shipment.pickupLocation,
      dropoff: shipment.dropoffLocation,
      date: shipment.pickupDate,
      time: shipment.pickupTime,
    },
    driver: {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      license: driver.licenseNumber,
      plate: driver.vehiclePlate,
    },
  };
  return JSON.stringify(pass);
}
