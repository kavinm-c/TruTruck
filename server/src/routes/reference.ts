import { Router } from "express";
import { db, type CarrierRow } from "../db.js";
import { carrierDto } from "../dto.js";
import { requireAuth } from "../auth.js";

export const referenceRouter = Router();
referenceRouter.use(requireAuth);

referenceRouter.get("/carriers", (_req, res) => {
  const rows = db.prepare("SELECT * FROM carriers ORDER BY name").all() as unknown as CarrierRow[];
  res.json(rows.map(carrierDto));
});
