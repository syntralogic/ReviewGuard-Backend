import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { reviewRowToDto, type ReviewRow } from "../types";
import { maybeSync } from "../lib/sync";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  maybeSync(req.auth!.businessId);
  const result = await pool.query<ReviewRow>(
    `SELECT * FROM reviews WHERE business_id = $1 AND archived = false ORDER BY created_at DESC`,
    [req.auth!.businessId],
  );
  return res.json(result.rows.map(reviewRowToDto));
});

router.get("/archived", async (req, res) => {
  const result = await pool.query<ReviewRow>(
    `SELECT * FROM reviews WHERE business_id = $1 AND archived = true ORDER BY created_at DESC`,
    [req.auth!.businessId],
  );
  return res.json(result.rows.map(reviewRowToDto));
});

router.get("/:id", async (req, res) => {
  const result = await pool.query<ReviewRow>(
    `SELECT * FROM reviews WHERE id = $1 AND business_id = $2`,
    [req.params.id, req.auth!.businessId],
  );
  if (result.rowCount === 0) return res.status(404).json(null);
  return res.json(reviewRowToDto(result.rows[0]));
});

const notesSchema = z.object({ notes: z.string() });

router.patch("/:id/notes", async (req, res) => {
  const parsed = notesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input." });
  }
  const notes = parsed.data.notes.trim() || null;

  const result = await pool.query<ReviewRow>(
    `UPDATE reviews SET notes = $1 WHERE id = $2 AND business_id = $3 RETURNING *`,
    [notes, req.params.id, req.auth!.businessId],
  );
  if (result.rowCount === 0) return res.status(404).json(null);
  return res.json(reviewRowToDto(result.rows[0]));
});

router.post("/:id/archive", async (req, res) => {
  const result = await pool.query<ReviewRow>(
    `UPDATE reviews SET archived = true WHERE id = $1 AND business_id = $2 RETURNING *`,
    [req.params.id, req.auth!.businessId],
  );
  if (result.rowCount === 0) return res.status(404).json(null);
  return res.json(reviewRowToDto(result.rows[0]));
});

router.post("/:id/unarchive", async (req, res) => {
  const result = await pool.query<ReviewRow>(
    `UPDATE reviews SET archived = false WHERE id = $1 AND business_id = $2 RETURNING *`,
    [req.params.id, req.auth!.businessId],
  );
  if (result.rowCount === 0) return res.status(404).json(null);
  return res.json(reviewRowToDto(result.rows[0]));
});

/**
 * Manual confirmation that Google actually removed a review after a report
 * was filed through Google's own tools — mirrors markReviewRemovedByGoogle
 * from the frontend mock. Also closes any reports tied to the review.
 */
router.post("/:id/mark-removed", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<ReviewRow>(
      `UPDATE reviews SET status = 'resolved' WHERE id = $1 AND business_id = $2 RETURNING *`,
      [req.params.id, req.auth!.businessId],
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json(null);
    }
    await client.query(`UPDATE reports SET status = 'closed' WHERE review_id = $1`, [
      req.params.id,
    ]);
    await client.query("COMMIT");
    return res.json(reviewRowToDto(result.rows[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    // eslint-disable-next-line no-console
    console.error("mark-removed failed:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  } finally {
    client.release();
  }
});

export default router;
