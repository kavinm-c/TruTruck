import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { maybe, must, supabase, type DriverRow } from "../db.js";
import { HttpError } from "../errors.js";
import { signToken } from "../auth.js";

export const authRouter = Router();

/**
 * DEMO ONLY: pick a role with no password so judges can click through all
 * three views. Real deployment would replace this with proper accounts/SSO.
 */
authRouter.use((_req, _res, next) => {
  if (!config.demoLogin) throw new HttpError(404, "Demo login disabled");
  next();
});

authRouter.get("/demo-users", async (_req, res) => {
  const drivers = must(await supabase.from("drivers").select("id, name").order("name")) as Pick<DriverRow, "id" | "name">[];
  res.json({ roles: ["coordinator", "driver", "clerk"], drivers });
});

const loginSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("coordinator") }),
  z.object({ role: z.literal("clerk") }),
  z.object({ role: z.literal("driver"), driverId: z.string().min(1) }),
]);

authRouter.post("/demo-login", async (req, res) => {
  const body = loginSchema.parse(req.body);
  if (body.role === "driver") {
    const exists = maybe(await supabase.from("drivers").select("id").eq("id", body.driverId).maybeSingle());
    if (!exists) throw new HttpError(404, "Unknown driver");
    res.json({ token: signToken({ role: "driver", driverId: body.driverId }), user: body });
    return;
  }
  res.json({ token: signToken({ role: body.role }), user: body });
});
