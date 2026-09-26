import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export type Role = "coordinator" | "driver" | "clerk";

export interface AuthUser {
  role: Role;
  driverId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "8h" });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Missing bearer token");
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = { role: payload.role, driverId: payload.driverId };
    next();
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, "Not allowed for this role");
    }
    next();
  };

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  return req.user;
}
