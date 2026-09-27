import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import type { DashboardStats } from "../types";

const router = Router();
router.use(requireAuth);

router.get("/stats", async (req, res) => {
  const { businessId } = req.auth!;

  const connectionResult = await pool.query(
    "SELECT connected FROM google_connections WHERE business_id = $1",
    [businessId],
  );
  const connected = connectionResult.rows[0]?.connected ?? false;

  if (!connected) {
    const stats: DashboardStats = {
      totalReviews: null,
      averageRating: null,
      needsAttention: null,
      reportsSubmitted: null,
    };
    return res.json(stats);
  }

  const statsResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE NOT archived)::int AS total_reviews,
       COALESCE(ROUND(AVG(rating) FILTER (WHERE NOT archived)::numeric, 1), 0)::float AS average_rating,
       COUNT(*) FILTER (WHERE NOT archived AND status = 'needs_attention')::int AS needs_attention
     FROM reviews
     WHERE business_id = $1`,
    [businessId],
  );
  const reportsResult = await pool.query(
    `SELECT COUNT(*)::int AS reports_submitted
     FROM reports r
     JOIN reviews rv ON rv.id = r.review_id
     WHERE rv.business_id = $1`,
    [businessId],
  );

  const row = statsResult.rows[0];
  const stats: DashboardStats = {
    totalReviews: row.total_reviews,
    averageRating: row.average_rating,
    needsAttention: row.needs_attention,
    reportsSubmitted: reportsResult.rows[0].reports_submitted,
  };
  return res.json(stats);
});

export default router;
