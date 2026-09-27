import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const COOKIE_NAME = process.env.COOKIE_NAME ?? "reviewguard_session";
const isProduction = process.env.NODE_ENV === "production";

// Frontend (Vercel) and backend (Render/etc.) sit on different domains in
// production, so the session cookie must be sent cross-site. That requires
// SameSite=None, which browsers only honor alongside Secure. In local dev
// both run on http://localhost, so Lax + non-Secure is used instead.
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
  path: "/",
};

export interface AuthTokenPayload {
  userId: string;
  businessId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export function signToken(payload: AuthTokenPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  // clearCookie must be called with the same attributes the cookie was set
  // with (SameSite/Secure included), or some browsers won't match it and
  // silently ignore the clear.
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired or invalid." });
  }
}
