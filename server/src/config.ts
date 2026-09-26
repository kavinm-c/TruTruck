import "dotenv/config";

const isProd = process.env.NODE_ENV === "production";

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret !== "change-me") return secret;
  if (isProd) throw new Error("JWT_SECRET must be set in production");
  console.warn("[config] JWT_SECRET not set; using an insecure dev secret");
  return "dev-only-insecure-secret";
}

function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (${hint})`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: jwtSecret(),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
  supabaseUrl: required("SUPABASE_URL", "Supabase > Project Settings > API"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY", "Supabase > Project Settings > API Keys, secret key"),
  totpStepSeconds: Number(process.env.TOTP_STEP_SECONDS ?? 30),
  // Accept codes from this many 30s steps either side of now, to absorb clock drift.
  totpWindow: Number(process.env.TOTP_WINDOW ?? 1),
  maxCodeAttempts: Number(process.env.MAX_CODE_ATTEMPTS ?? 5),
  demoLogin: (process.env.DEMO_LOGIN ?? "true") === "true",
};
