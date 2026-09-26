import { useEffect } from "react";
import { create } from "zustand";
import { request, type Session } from "@/services/api";
import { lookupShipmentByCode, verifyDriverIdentity, type VerificationRequest } from "@/services/verificationService";
import type { Carrier, Role, Shipment, Trucker } from "@/types";

interface AppState {
  session: Session | null;
  shipments: Shipment[];
  carriers: Carrier[];
  truckers: Trucker[];
  loading: boolean;
  error: string | null;

  setSession: (session: Session) => Promise<void>;
  refresh: () => Promise<void>;

  assignShipment: (shipmentId: string, carrierId: string, truckerId: string) => Promise<void>;
  reissueCode: (shipmentId: string) => Promise<void>;
  acknowledgeShipment: (shipmentId: string) => Promise<void>;
  markArrived: (shipmentId: string) => Promise<void>;
  lookupByCode: (code: string) => Promise<Shipment>;
  verifyAndAdmit: (req: VerificationRequest) => Promise<void>;
  releaseForTransit: (shipmentId: string) => Promise<void>;
}

function requireSession(session: Session | null): Session {
  if (!session) throw new Error("No active session");
  return session;
}

export const useAppStore = create<AppState>((set, get) => {
  async function post(path: string, body?: unknown) {
    await request(requireSession(get().session), path, { method: "POST", body });
    await get().refresh();
  }

  return {
    session: null,
    shipments: [],
    carriers: [],
    truckers: [],
    loading: false,
    error: null,

    setSession: async (session) => {
      set({ session, shipments: [], loading: true });
      await get().refresh();
    },

    refresh: async () => {
      const session = get().session;
      if (!session) return;
      try {
        const [shipments, carriers, truckers] = await Promise.all([
          request<Shipment[]>(session, "/shipments"),
          request<Carrier[]>(session, "/carriers"),
          request<Trucker[]>(session, "/truckers"),
        ]);
        // Ignore responses for a role the user has already switched away from.
        if (get().session !== session) return;
        set({ shipments, carriers, truckers, loading: false, error: null });
      } catch (e) {
        if (get().session !== session) return;
        set({ loading: false, error: e instanceof Error ? e.message : "Failed to load data" });
      }
    },

    assignShipment: (id, carrierId, truckerId) => post(`/shipments/${id}/assign`, { carrierId, truckerId }),
    reissueCode: (id) => post(`/shipments/${id}/reissue-code`),
    acknowledgeShipment: (id) => post(`/shipments/${id}/acknowledge`),
    markArrived: (id) => post(`/shipments/${id}/arrive`),
    releaseForTransit: (id) => post(`/shipments/${id}/release`),

    lookupByCode: (code) => lookupShipmentByCode(code),

    verifyAndAdmit: async (req) => {
      await verifyDriverIdentity(req);
      await get().refresh();
    },
  };
});

/** Log in as a role and poll for updates so changes from other screens show up. */
export function useRoleSession(role: Role, truckerId?: string, intervalMs = 4000) {
  const setSession = useAppStore((s) => s.setSession);
  const refresh = useAppStore((s) => s.refresh);

  useEffect(() => {
    if (role === "trucker" && !truckerId) return;
    void setSession({ role, truckerId });
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [role, truckerId, intervalMs, setSession, refresh]);
}
