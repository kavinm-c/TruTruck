import { Router } from "express";
import { sql } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole("coordinator"));

auditRouter.get("/", async (req, res) => {
  const shipmentId = typeof req.query.shipmentId === "string" ? req.query.shipmentId : null;
  const rows = await sql`
    SELECT * FROM audit_log
    ${shipmentId ? sql`WHERE shipment_id = ${shipmentId}` : sql``}
    ORDER BY id DESC LIMIT 200`;
  res.json(
    rows.map((r) => ({
      id: r.id,
      shipmentId: r.shipment_id,
      actorRole: r.actor_role,
      actorId: r.actor_id,
      event: r.event,
      detail: r.detail,
      createdAt: r.created_at,
    })),
  );
});
