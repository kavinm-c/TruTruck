import { create } from "zustand";
import { carriers, initialShipments, truckers } from "@/data/mockData";
import type { Carrier, Shipment, Trucker } from "@/types";

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

interface AppState {
  shipments: Shipment[];
  carriers: Carrier[];
  truckers: Trucker[];

  assignShipment: (shipmentId: string, carrierId: string, truckerId: string) => void;
  acknowledgeShipment: (shipmentId: string) => void;
  markArrived: (shipmentId: string) => void;
  verifyAndAdmit: (shipmentId: string, dockNumber: string, notes?: string) => void;
  releaseForTransit: (shipmentId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  shipments: initialShipments,
  carriers,
  truckers,

  assignShipment: (shipmentId, carrierId, truckerId) =>
    set((state) => ({
      shipments: state.shipments.map((s) =>
        s.id === shipmentId
          ? {
              ...s,
              carrierId,
              truckerId,
              status: "assigned",
              verificationCode: generateVerificationCode(),
            }
          : s,
      ),
    })),

  acknowledgeShipment: (shipmentId) =>
    set((state) => ({
      shipments: state.shipments.map((s) =>
        s.id === shipmentId
          ? { ...s, status: "en_route", acknowledgedAt: new Date().toISOString() }
          : s,
      ),
    })),

  markArrived: (shipmentId) =>
    set((state) => ({
      shipments: state.shipments.map((s) =>
        s.id === shipmentId
          ? { ...s, status: "at_warehouse", arrivedAt: new Date().toISOString() }
          : s,
      ),
    })),

  verifyAndAdmit: (shipmentId, dockNumber, notes) =>
    set((state) => ({
      shipments: state.shipments.map((s) =>
        s.id === shipmentId
          ? {
              ...s,
              status: "verified",
              verifiedAt: new Date().toISOString(),
              dockNumber,
              verificationNotes: notes,
            }
          : s,
      ),
    })),

  releaseForTransit: (shipmentId) =>
    set((state) => ({
      shipments: state.shipments.map((s) =>
        s.id === shipmentId ? { ...s, status: "in_transit" } : s,
      ),
    })),
}));
