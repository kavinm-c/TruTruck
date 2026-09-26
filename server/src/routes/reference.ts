import { Router } from "express";
import { sql, type CarrierRow } from "../db.js";
import { carrierDto } from "../dto.js";
import { requireAuth } from "../auth.js";

export const referenceRouter = Router();
referenceRouter.use(requireAuth);

referenceRouter.get("/carriers", async (_req, res) => {
  const rows = await sql<CarrierRow[]>`SELECT * FROM carriers ORDER BY name`;
  res.json(rows.map(carrierDto));
});
