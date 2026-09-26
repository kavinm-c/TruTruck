import { Router } from "express";
import { db, type CarrierRow, type TruckerRow } from "../db.js";
import { carrierDto, truckerDto } from "../dto.js";
import { currentUser, requireAuth } from "../auth.js";

export const referenceRouter = Router();
referenceRouter.use(requireAuth);

referenceRouter.get("/carriers", (_req, res) => {
  const rows = db.prepare("SELECT * FROM carriers ORDER BY name").all() as unknown as CarrierRow[];
  res.json(rows.map(carrierDto));
});

referenceRouter.get("/truckers", (req, res) => {
  const user = currentUser(req);
  const rows = db.prepare("SELECT * FROM truckers ORDER BY name").all() as unknown as TruckerRow[];
  res.json(rows.map((r) => truckerDto(r, user)));
});
