import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";
import type { AdminBusinessSummary, AdminPlatformStats, AdminReportSummary } from "../types";

/**
 * Platform-wide admin endpoints — for staff/owner use across every business
 * on ReviewGuard, not a single business's own data. Gated by requireAdmin
 * (role = 'admin' on the users table; nothing grants this at signup — see
 * db/schema.sql). Not called by the frontend yet: the admin panel UI
 * (ReviewGuard-Frontend's /admin routes) still reads its own local mock data
 * for now, per instruction to build both sides without wiring them together
 * until the API-integration pass.
 */
const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/stats", async (_req, res) => {
  const result = await pool.query(
    `SELECT
       COUNT(DISTINCT b.id)::int AS total_businesses,
       COUNT(DISTINCT b.id) FILTER (WHERE gc.connected)::int AS connected_businesses,
       COUNT(r.id) FILTER (WHERE NOT r.archived)::int AS total_reviews,
       COUNT(r.id) FILTER (WHERE NOT r.archived AND r.status = 'needs_attention')::int AS total_needs_attention,
       COUNT(DISTINCT rp.id)::int AS total_reports_submitted
     FROM businesses b
     LEFT JOIN google_connections gc ON gc.business_id = b.id
     LEFT JOIN reviews r ON r.business_id = b.id
     LEFT JOIN reports rp ON rp.review_id = r.id`,
  );
  const row = result.rows[0];
  const stats: AdminPlatformStats = {
    totalBusinesses: row.total_businesses,
    connectedBusinesses: row.connected_businesses,
    totalReviews: row.total_reviews,
    totalNeedsAttention: row.total_needs_attention,
    totalReportsSubmitted: row.total_reports_submitted,
  };
  return res.json(stats);
});

router.get("/businesses", async (_req, res) => {
  const result = await pool.query(
    `SELECT
       b.id,
       b.name AS business_name,
       u.name AS owner_name,
       u.email AS owner_email,
       COALESCE(gc.connected, false) AS connected,
       gc.account_email AS google_account_email,
       COUNT(r.id) FILTER (WHERE NOT r.archived)::int AS total_reviews,
       COUNT(r.id) FILTER (WHERE NOT r.archived AND r.status = 'needs_attention')::int AS needs_attention,
       COUNT(DISTINCT rp.id)::int AS reports_submitted,
       b.created_at
     FROM businesses b
     JOIN users u ON u.id = b.owner_id
     LEFT JOIN google_connections gc ON gc.business_id = b.id
     LEFT JOIN reviews r ON r.business_id = b.id
     LEFT JOIN reports rp ON rp.review_id = r.id
     GROUP BY b.id, u.name, u.email, gc.connected, gc.account_email
     ORDER BY b.created_at DESC`,
  );

  const businesses: AdminBusinessSummary[] = result.rows.map((row) => ({
    id: row.id,
    businessName: row.business_name,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    connected: row.connected,
    googleAccountEmail: row.google_account_email,
    totalReviews: row.total_reviews,
    needsAttention: row.needs_attention,
    reportsSubmitted: row.reports_submitted,
    createdAt: row.created_at.toISOString(),
  }));
  return res.json(businesses);
});

router.get("/reports", async (_req, res) => {
  const result = await pool.query(
    `SELECT
       rp.id,
       b.name AS business_name,
       rp.review_excerpt,
       rp.reason,
       rp.status,
       rp.created_at
     FROM reports rp
     JOIN reviews r ON r.id = rp.review_id
     JOIN businesses b ON b.id = r.business_id
     ORDER BY rp.created_at DESC`,
  );

  const reports: AdminReportSummary[] = result.rows.map((row) => ({
    id: row.id,
    businessName: row.business_name,
    reviewExcerpt: row.review_excerpt,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  }));
  return res.json(reports);
});

export default router;
