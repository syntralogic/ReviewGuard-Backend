import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { encrypt } from "../lib/crypto";
import {
  buildAuthUrl,
  emailFromIdToken,
  exchangeCode,
  googleConfigured,
  listAccounts,
  listLocations,
} from "../lib/google";
import { syncBusiness } from "../lib/sync";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const clientOrigin = () => process.env.CLIENT_ORIGIN ?? "http://localhost:8080";
const back = (result: string) => `${clientOrigin()}/?google=${result}`;

router.get("/config", requireAuth, (_req, res) => {
  res.json({ googleEnabled: googleConfigured() });
});

// Top-level navigation from the frontend; the session cookie identifies the user.
router.get("/start", requireAuth, (req, res) => {
  if (!googleConfigured()) return res.status(400).json({ error: "Google integration is not configured." });
  const state = jwt.sign({ businessId: req.auth!.businessId, purpose: "google-oauth" }, JWT_SECRET, {
    expiresIn: "10m",
  });
  return res.redirect(buildAuthUrl(state));
});

// Google redirects here; identity comes from the signed `state`, not a cookie.
router.get("/callback", async (req, res) => {
  if (!googleConfigured()) return res.redirect(back("error"));
  if (typeof req.query.error === "string") return res.redirect(back("denied"));

  let businessId: string;
  try {
    const p = jwt.verify(String(req.query.state ?? ""), JWT_SECRET) as { businessId?: string; purpose?: string };
    if (p.purpose !== "google-oauth" || !p.businessId) throw new Error("bad state");
    businessId = p.businessId;
  } catch {
    return res.redirect(back("error"));
  }

  try {
    const tokens = await exchangeCode(String(req.query.code ?? ""));
    if (!tokens.refresh_token) return res.redirect(back("error"));

    // Pick the first account that actually has a location.
    let accountName: string | null = null;
    let location: { name: string; title?: string } | null = null;
    for (const account of await listAccounts(tokens.access_token)) {
      const locations = await listLocations(account.name, tokens.access_token);
      if (locations.length > 0) {
        accountName = account.name;
        location = locations[0];
        break;
      }
    }
    if (!accountName || !location) return res.redirect(back("no_location"));

    // Real data replaces any demo reviews created by the simulated connect.
    await pool.query("DELETE FROM reviews WHERE business_id = $1 AND external_id IS NULL", [businessId]);
    await pool.query(
      `INSERT INTO google_connections
         (business_id, connected, account_email, connected_at, refresh_token_enc,
          google_account_name, google_location_name, location_title, sync_error)
       VALUES ($1, true, $2, now(), $3, $4, $5, $6, NULL)
       ON CONFLICT (business_id) DO UPDATE SET
         connected = true, account_email = $2, connected_at = now(), refresh_token_enc = $3,
         google_account_name = $4, google_location_name = $5, location_title = $6, sync_error = NULL`,
      [
        businessId,
        emailFromIdToken(tokens.id_token) ?? "Google account",
        encrypt(tokens.refresh_token),
        accountName,
        location.name,
        location.title ?? null,
      ],
    );

    try {
      await syncBusiness(businessId);
    } catch (err) {
      console.error("Initial sync failed:", err instanceof Error ? err.message : err);
    }
    return res.redirect(back("connected"));
  } catch (err) {
    console.error("Google callback failed:", err instanceof Error ? err.message : err);
    return res.redirect(back("error"));
  }
});

router.post("/sync", requireAuth, async (req, res) => {
  try {
    const result = await syncBusiness(req.auth!.businessId);
    if (!result) return res.status(400).json({ error: "Google account is not connected." });
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : "Sync failed." });
  }
});

export default router;
