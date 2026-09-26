import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole("coordinator"));

auditRouter.get("/", (req, res) => {
  const shipmentId = typeof req.query.shipmentId === "string" ? req.query.shipmentId : null;
  const rows = shipmentId
    ? db.prepare("SELECT * FROM audit_log WHERE shipment_id = ? ORDER BY id DESC LIMIT 200").all(shipmentId)
    : db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 200").all();
  res.json(
    (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id,
      shipmentId: r.shipment_id,
      actorRole: r.actor_role,
      actorId: r.actor_id,
      event: r.event,
      detail: r.detail ? JSON.parse(r.detail as string) : null,
      createdAt: r.created_at,
    })),
  );
});
