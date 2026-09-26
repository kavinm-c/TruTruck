import type { Role } from "@/types";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export interface Session {
  role: Role;
  truckerId?: string;
}

export class ApiError extends Error {
  status: number;
  attemptsRemaining?: number;

  constructor(status: number, message: string, attemptsRemaining?: number) {
    super(message);
    this.status = status;
    this.attemptsRemaining = attemptsRemaining;
  }
}

const tokens = new Map<string, string>();
const sessionKey = (s: Session) => `${s.role}:${s.truckerId ?? ""}`;

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
    throw new ApiError(0, "Can't reach the TruTruck API. Is the server running?");
  }

  if (res.status === 401 && !retried) {
    tokens.delete(sessionKey(session));
    return request<T>(session, path, options, true);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.attemptsRemaining);
  }
  return data as T;
}

export async function getDemoTruckers(): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${BASE_URL}/auth/demo-users`);
  if (!res.ok) throw new ApiError(res.status, "Could not load demo users");
  const data = await res.json();
  return data.truckers;
}
