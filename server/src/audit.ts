import type postgres from "postgres";
import { sql as pool, type Sql } from "./db.js";
import type { AuthUser } from "./auth.js";

/** Pass `sql` to write the entry inside an open transaction. */
export async function audit(
  shipmentId: string | null,
  user: AuthUser,
  event: string,
  detail?: Record<string, unknown>,
  sql: Sql = pool,
) {
  await sql`
    INSERT INTO audit_log (shipment_id, actor_role, actor_id, event, detail)
    VALUES (${shipmentId}, ${user.role}, ${user.driverId ?? null}, ${event},
      ${detail ? pool.json(detail as postgres.JSONValue) : null})`;
}
