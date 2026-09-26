import "dotenv/config";

const isProd = process.env.NODE_ENV === "production";

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret !== "change-me") return secret;
  if (isProd) throw new Error("JWT_SECRET must be set in production");
  console.warn("[config] JWT_SECRET not set; using an insecure dev secret");
  return "dev-only-insecure-secret";
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set (Supabase > Connect > Session pooler)");
  return url;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: jwtSecret(),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
  databaseUrl: databaseUrl(),
  totpStepSeconds: Number(process.env.TOTP_STEP_SECONDS ?? 30),
  // Accept codes from this many 30s steps either side of now, to absorb clock drift.
  totpWindow: Number(process.env.TOTP_WINDOW ?? 1),
  maxCodeAttempts: Number(process.env.MAX_CODE_ATTEMPTS ?? 5),
  demoLogin: (process.env.DEMO_LOGIN ?? "true") === "true",
};
