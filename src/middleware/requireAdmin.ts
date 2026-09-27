import type { NextFunction, Request, Response } from "express";
import { pool } from "../db";

/**
 * Must run after requireAuth. Checks the user's role against the database
 * (rather than trusting a role baked into the JWT) so revoking admin access
 * takes effect immediately, without waiting for tokens to expire.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    const result = await pool.query("SELECT role FROM users WHERE id = $1", [req.auth.userId]);
    const role = result.rows[0]?.role;
    if (role !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("requireAdmin check failed:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
