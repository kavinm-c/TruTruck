import { useEffect } from "react";
import { create } from "zustand";
import { request, type Session } from "@/services/api";
import {
  scanDriverPass,
  verifyDriverIdentity,
  type ScanInput,
  type VerificationRequest,
} from "@/services/verificationService";
import type { Carrier, DriverInput, OrderInput, Role, ScanResult, Shipment, Driver } from "@/types";

interface AppState {
  session: Session | null;
  shipments: Shipment[];
  carriers: Carrier[];
  drivers: Driver[];
  loading: boolean;
  error: string | null;

  setSession: (session: Session) => Promise<void>;
  refresh: () => Promise<void>;

  // coordinator
  createDriver: (input: DriverInput) => Promise<Driver>;
  updateDriver: (id: string, input: Partial<DriverInput>) => Promise<Driver>;
  createOrder: (input: OrderInput) => Promise<Shipment>;
  assignShipment: (shipmentId: string, driverId: string) => Promise<void>;
  reissueCode: (shipmentId: string) => Promise<void>;

  // driver
  acceptShipment: (shipmentId: string) => Promise<void>;
  declineShipment: (shipmentId: string) => Promise<void>;
  markArrived: (shipmentId: string) => Promise<void>;

  // clerk
  scanPass: (input: ScanInput) => Promise<ScanResult>;
  verifyAndAdmit: (req: VerificationRequest) => Promise<void>;
  releaseForTransit: (shipmentId: string) => Promise<void>;
}

function requireSession(session: Session | null): Session {
  if (!session) throw new Error("No active session");
  return session;
}

export const useAppStore = create<AppState>((set, get) => {
  async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const result = await request<T>(requireSession(get().session), path, { method, body });
    await get().refresh();
    return result;
  }

  return {
    session: null,
    shipments: [],
    carriers: [],
    drivers: [],
    loading: false,
    error: null,

    setSession: async (session) => {
      set({ session, shipments: [], drivers: [], loading: true });
      await get().refresh();
    },

    refresh: async () => {
      const session = get().session;
      if (!session) return;
      try {
        // Clerks don't get a driver list; they only see a driver after a valid scan.
        const [shipments, carriers, drivers] = await Promise.all([
          request<Shipment[]>(session, "/shipments"),
          request<Carrier[]>(session, "/carriers"),
          session.role === "clerk" ? Promise.resolve([]) : request<Driver[]>(session, "/drivers"),
        ]);
        // Ignore responses for a role the user has already switched away from.
        if (get().session !== session) return;
        set({ shipments, carriers, drivers, loading: false, error: null });
      } catch (e) {
        if (get().session !== session) return;
        set({ loading: false, error: e instanceof Error ? e.message : "Failed to load data" });
      }
    },

    createDriver: (input) => send("POST", "/drivers", input),
    updateDriver: (id, input) => send("PUT", `/drivers/${id}`, input),
    createOrder: (input) => send("POST", "/shipments", input),
    assignShipment: (id, driverId) => send("POST", `/shipments/${id}/assign`, { driverId }),
    reissueCode: (id) => send("POST", `/shipments/${id}/reissue-code`),

    acceptShipment: (id) => send("POST", `/shipments/${id}/accept`),
    declineShipment: (id) => send("POST", `/shipments/${id}/decline`),
    markArrived: (id) => send("POST", `/shipments/${id}/arrive`),

    scanPass: (input) => scanDriverPass(input),
    verifyAndAdmit: async (req) => {
      await verifyDriverIdentity(req);
      await get().refresh();
    },
    releaseForTransit: (id) => send("POST", `/shipments/${id}/release`),
  };
});

/** Log in as a role and poll for updates so changes from other screens show up. */
export function useRoleSession(role: Role, driverId?: string, intervalMs = 4000) {
  const setSession = useAppStore((s) => s.setSession);
  const refresh = useAppStore((s) => s.refresh);

  useEffect(() => {
    if (role === "driver" && !driverId) return;
    void setSession({ role, driverId });
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [role, driverId, intervalMs, setSession, refresh]);
}
