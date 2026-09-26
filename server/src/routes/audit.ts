import { Router } from "express";
import { must, supabase } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole("coordinator"));

auditRouter.get("/", async (req, res) => {
  const shipmentId = typeof req.query.shipmentId === "string" ? req.query.shipmentId : null;
  let query = supabase.from("audit_log").select("*").order("id", { ascending: false }).limit(200);
  if (shipmentId) query = query.eq("shipment_id", shipmentId);
  const rows = must(await query);
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
