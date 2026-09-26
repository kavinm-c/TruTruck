import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

// RFC 6238 TOTP (HMAC-SHA1, 6 digits), the same scheme Google Authenticator uses.
// Each shipment gets its own secret; only the assigned driver's app ever receives it.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/=+$/, "").toUpperCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit random secret, base32 encoded (RFC 4226 recommended length). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function currentStep(at = Date.now()): number {
  return Math.floor(at / 1000 / config.totpStepSeconds);
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 1_000_000).toString().padStart(6, "0");
}

/** Constant-time comparison so response timing doesn't leak correct digits. */
function codesMatch(entered: string, expected: string): boolean {
  const a = Buffer.from(entered);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Returns the time step the code belongs to (within the drift window),
 * or null if it doesn't match. Callers use the step for replay protection.
 */
export function matchTotp(secret: string, code: string, at = Date.now()): number | null {
  const now = currentStep(at);
  for (let drift = -config.totpWindow; drift <= config.totpWindow; drift++) {
    if (codesMatch(code, totpAt(secret, now + drift))) return now + drift;
  }
  return null;
}

export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
