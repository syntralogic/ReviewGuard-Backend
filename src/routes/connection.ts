import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { seedDemoReviews } from "../lib/seed";
import type { GoogleConnection } from "../types";

const router = Router();
router.use(requireAuth);

function toDto(row: {
  connected: boolean;
  account_email: string | null;
  connected_at: Date | null;
}): GoogleConnection {
  return {
    connected: row.connected,
    accountEmail: row.account_email,
    connectedAt: row.connected_at ? row.connected_at.toISOString() : null,
  };
}

router.get("/", async (req, res) => {
  const result = await pool.query(
    "SELECT connected, account_email, connected_at FROM google_connections WHERE business_id = $1",
    [req.auth!.businessId],
  );
  const row = result.rows[0] ?? { connected: false, account_email: null, connected_at: null };
  return res.json(toDto(row));
});

const connectSchema = z.object({
  accountEmail: z.string().trim().min(1, "Account email is required").email(),
});

/**
 * Simulates connecting a Google Business Profile, same as the original
 * frontend mock: no real Google OAuth here, just marks the business
 * connected and imports a starter set of reviews the first time.
 */
router.post("/connect", async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const { businessId } = req.auth!;
  const { accountEmail } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const connectedAt = new Date().toISOString();
    await client.query(
      `INSERT INTO google_connections (business_id, connected, account_email, connected_at)
       VALUES ($1, true, $2, $3)
       ON CONFLICT (business_id)
       DO UPDATE SET connected = true, account_email = $2, connected_at = $3`,
      [businessId, accountEmail, connectedAt],
    );

    const existingReviews = await client.query(
      "SELECT 1 FROM reviews WHERE business_id = $1 LIMIT 1",
      [businessId],
    );
    if (existingReviews.rowCount === 0) {
      await seedDemoReviews(client, businessId);
    }

    await client.query("COMMIT");
    return res.json({ connected: true, accountEmail, connectedAt });
  } catch (err) {
    await client.query("ROLLBACK");
    // eslint-disable-next-line no-console
    console.error("Connect failed:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  } finally {
    client.release();
  }
});

router.post("/disconnect", async (req, res) => {
  await pool.query(
    `UPDATE google_connections SET connected = false, account_email = NULL, connected_at = NULL
     WHERE business_id = $1`,
    [req.auth!.businessId],
  );
  return res.json({ connected: false, accountEmail: null, connectedAt: null });
});

export default router;
