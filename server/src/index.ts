import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { seed } from "./seed.js";
import { warnIfMigrationPending } from "./db.js";
import { errorHandler } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { referenceRouter } from "./routes/reference.js";
import { shipmentsRouter } from "./routes/shipments.js";
import { driversRouter } from "./routes/drivers.js";
import { auditRouter } from "./routes/audit.js";

await seed(); // creates tables; loads demo data only if the DB is empty
await warnIfMigrationPending();

const app = express();
// Hosts like Render sit behind one proxy; trust it so rate limits apply per client IP.
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
// Driver photos are sent as resized data URLs, so allow a little headroom.
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60_000, limit: 1000, standardHeaders: "draft-8", legacyHeaders: false }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/auth", authRouter);
app.use("/api/shipments", shipmentsRouter);
app.use("/api/drivers", driversRouter);
app.use("/api/audit", auditRouter);
app.use("/api", referenceRouter);
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.use(errorHandler);

// Express 5 passes listen errors (e.g. port already in use) to this callback.
app.listen(config.port, (err?: Error) => {
  if (err) throw err;
  console.log(`TruTruck API listening on http://localhost:${config.port}/api`);
});
