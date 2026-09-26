// RFC 6238 TOTP in the browser (HMAC-SHA1, 6 digits, 30s steps), matching
// the server and Google Authenticator. The driver's device computes codes
// from its secret locally, so the pass keeps working with a weak signal.

export const TOTP_PERIOD_SECONDS = 30;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array<ArrayBuffer> {
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
  return new Uint8Array(out);
}

export function currentStep(at = Date.now()): number {
  return Math.floor(at / 1000 / TOTP_PERIOD_SECONDS);
}

/** Seconds until the code for `at` rolls over. */
export function secondsRemaining(at = Date.now()): number {
  return TOTP_PERIOD_SECONDS - (Math.floor(at / 1000) % TOTP_PERIOD_SECONDS);
}

export async function totpAt(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counter = new DataView(new ArrayBuffer(8));
  counter.setUint32(0, Math.floor(step / 2 ** 32));
  counter.setUint32(4, step >>> 0);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter.buffer));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return (binary % 1_000_000).toString().padStart(6, "0");
}
