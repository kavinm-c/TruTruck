import { randomInt, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

/** Cryptographically random 6-digit code (Math.random is not safe for this). */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function codeExpiry(from = new Date()): string {
  return new Date(from.getTime() + config.codeTtlHours * 3_600_000).toISOString();
}

/** Constant-time comparison so response timing doesn't leak correct digits. */
export function codesMatch(entered: string, expected: string): boolean {
  const a = Buffer.from(entered);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
