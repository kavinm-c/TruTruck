import type { PassMismatch, Role } from "@/types";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export interface Session {
  role: Role;
  driverId?: string;
}

export class ApiError extends Error {
  status: number;
  attemptsRemaining?: number;
  /** Set when a scanned pass disagrees with dispatch records. */
  mismatches?: PassMismatch[];

  constructor(status: number, message: string, extra: { attemptsRemaining?: number; mismatches?: PassMismatch[] } = {}) {
    super(message);
    this.status = status;
    this.attemptsRemaining = extra.attemptsRemaining;
    this.mismatches = extra.mismatches;
  }
}

const tokens = new Map<string, string>();
const sessionKey = (s: Session) => `${s.role}:${s.driverId ?? ""}`;

async function login(session: Session): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Login failed");
  tokens.set(sessionKey(session), data.token);
  return data.token;
}

export async function request<T>(
  session: Session,
  path: string,
  options: { method?: string; body?: unknown } = {},
  retried = false,
): Promise<T> {
  const token = tokens.get(sessionKey(session)) ?? (await login(session));
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined && { "Content-Type": "application/json" }),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the TruckerTrust API. Is the server running?");
  }

  if (res.status === 401 && !retried) {
    tokens.delete(sessionKey(session));
    return request<T>(session, path, options, true);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface the first validation problem instead of a bare "Invalid request".
    const issue = data.issues?.[0];
    const message = issue
      ? [issue.path?.join("."), issue.message].filter(Boolean).join(": ")
      : (data.error ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, message, {
      attemptsRemaining: data.attemptsRemaining,
      mismatches: data.mismatches,
    });
  }
  return data as T;
}

export async function getDemoDrivers(): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${BASE_URL}/auth/demo-users`);
  if (!res.ok) throw new ApiError(res.status, "Could not load demo users");
  const data = await res.json();
  return data.drivers;
}
