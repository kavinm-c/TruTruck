import { must, supabase } from "./db.js";
import type { AuthUser } from "./auth.js";

export async function audit(
  shipmentId: string | null,
  user: AuthUser,
  event: string,
  detail?: Record<string, unknown>,
) {
  must(
    await supabase.from("audit_log").insert({
      shipment_id: shipmentId,
      actor_role: user.role,
      actor_id: user.driverId ?? null,
      event,
      detail: detail ?? null,
    }),
  );
}
