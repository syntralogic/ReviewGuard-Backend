import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { reportRowToDto, type ReportRow } from "../types";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const result = await pool.query<ReportRow>(
    `SELECT r.* FROM reports r
     JOIN reviews rv ON rv.id = r.review_id
     WHERE rv.business_id = $1
     ORDER BY r.created_at DESC`,
    [req.auth!.businessId],
  );
  return res.json(result.rows.map(reportRowToDto));
});

router.get("/review/:reviewId", async (req, res) => {
  const result = await pool.query<ReportRow>(
    `SELECT r.* FROM reports r
     JOIN reviews rv ON rv.id = r.review_id
     WHERE r.review_id = $1 AND rv.business_id = $2
     ORDER BY r.created_at DESC`,
    [req.params.reviewId, req.auth!.businessId],
  );
  return res.json(result.rows.map(reportRowToDto));
});

const prepareReportSchema = z.object({
  reviewId: z.string().uuid(),
  reason: z.enum([
    "spam",
    "irrelevant",
    "harassment",
    "offensive",
    "promotional",
    "conflict_of_interest",
    "other",
  ]),
  explanation: z.string().trim().min(1, "Explanation is required."),
  evidence: z.string().nullable().optional(),
});

/**
 * Prepares a report draft explaining why a review may violate Google's own
 * review policies — mirrors prepareReport from the frontend mock. This only
 * stores the draft; the business owner still files it with Google themselves.
 */
router.post("/", async (req, res) => {
  const parsed = prepareReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input." });
  }
  const { reviewId, reason, explanation, evidence } = parsed.data;
  const { businessId } = req.auth!;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reviewResult = await client.query(
      "SELECT id, text, status FROM reviews WHERE id = $1 AND business_id = $2",
      [reviewId, businessId],
    );
    const review = reviewResult.rows[0];
    if (!review) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Review not found." });
    }

    const reviewExcerpt = String(review.text).slice(0, 140);
    const reportResult = await client.query<ReportRow>(
      `INSERT INTO reports (review_id, review_excerpt, reason, explanation, evidence, status)
       VALUES ($1, $2, $3, $4, $5, 'prepared')
       RETURNING *`,
      [reviewId, reviewExcerpt, reason, explanation, evidence ?? null],
    );

    if (review.status !== "resolved") {
      await client.query("UPDATE reviews SET status = 'reported' WHERE id = $1", [reviewId]);
    }

    await client.query("COMMIT");
    return res.status(201).json(reportRowToDto(reportResult.rows[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    // eslint-disable-next-line no-console
    console.error("prepareReport failed:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  } finally {
    client.release();
  }
});

/**
 * Marks a prepared report as actually submitted through Google's own
 * review-flagging tools — mirrors markReportSubmitted from the frontend mock.
 */
router.post("/:id/submit", async (req, res) => {
  const result = await pool.query<ReportRow>(
    `UPDATE reports r SET status = 'submitted'
     FROM reviews rv
     WHERE r.review_id = rv.id AND r.id = $1 AND rv.business_id = $2 AND r.status = 'prepared'
     RETURNING r.*`,
    [req.params.id, req.auth!.businessId],
  );
  if (result.rowCount === 0) {
    // Either not found, or not owned by this business, or not in "prepared"
    // status — fetch to distinguish "not found" from "no-op" like the mock did.
    const existing = await pool.query<ReportRow>(
      `SELECT r.* FROM reports r
       JOIN reviews rv ON rv.id = r.review_id
       WHERE r.id = $1 AND rv.business_id = $2`,
      [req.params.id, req.auth!.businessId],
    );
    if (existing.rowCount === 0) return res.status(404).json(null);
    return res.json(reportRowToDto(existing.rows[0]));
  }
  return res.json(reportRowToDto(result.rows[0]));
});

export default router;
