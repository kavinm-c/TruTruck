import { db } from "./db.js";
import type { AuthUser } from "./auth.js";

const insert = db.prepare(
  `INSERT INTO audit_log (shipment_id, actor_role, actor_id, event, detail)
   VALUES (?, ?, ?, ?, ?)`,
);

export function audit(
  shipmentId: string | null,
  user: AuthUser,
  event: string,
  detail?: Record<string, unknown>,
) {
  insert.run(
    shipmentId,
    user.role,
    user.driverId ?? null,
    event,
    detail ? JSON.stringify(detail) : null,
  );
}
