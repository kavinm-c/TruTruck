import { Router } from "express";
import { must, supabase, type CarrierRow } from "../db.js";
import { carrierDto } from "../dto.js";
import { requireAuth } from "../auth.js";

export const referenceRouter = Router();
referenceRouter.use(requireAuth);

referenceRouter.get("/carriers", async (_req, res) => {
  const rows = must(await supabase.from("carriers").select("*").order("name")) as CarrierRow[];
  res.json(rows.map(carrierDto));
});
