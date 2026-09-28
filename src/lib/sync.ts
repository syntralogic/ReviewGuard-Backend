import { pool } from "../db";
import { decrypt } from "./crypto";
import { detectRisks } from "./risk";
import {
  GoogleApiError,
  listAllReviews,
  refreshAccessToken,
  type GoogleReview,
} from "./google";

export interface SyncDeps {
  refresh: (refreshToken: string) => Promise<string>;
  fetchReviews: (account: string, location: string, accessToken: string) => Promise<GoogleReview[]>;
}

const defaultDeps: SyncDeps = { refresh: refreshAccessToken, fetchReviews: listAllReviews };

const inFlight = new Set<string>();

/**
 * Pulls every review for the business's connected Google location and
 * upserts it. New reviews are auto-scanned for policy risks; existing ones
 * keep the owner's status/notes/archive choices (only rating/text refresh).
 * Reviews we had reported that vanished from Google are marked resolved.
 */
export async function syncBusiness(businessId: string, deps: SyncDeps = defaultDeps) {
  const conn = await pool.query(
    `SELECT refresh_token_enc, google_account_name, google_location_name
       FROM google_connections WHERE business_id = $1 AND connected = true`,
    [businessId],
  );
  const row = conn.rows[0];
  if (!row?.refresh_token_enc || !row.google_account_name || !row.google_location_name) return null;

  let reviews: GoogleReview[];
  try {
    const accessToken = await deps.refresh(decrypt(row.refresh_token_enc));
    reviews = await deps.fetchReviews(row.google_account_name, row.google_location_name, accessToken);
  } catch (err) {
    const revoked = err instanceof GoogleApiError && err.code === "invalid_grant";
    const message = revoked
      ? "Google access was revoked or expired. Please reconnect your Google account."
      : err instanceof Error
        ? err.message
        : "Sync failed.";
    await pool.query(
      `UPDATE google_connections SET sync_error = $2, connected = CASE WHEN $3 THEN false ELSE connected END
        WHERE business_id = $1`,
      [businessId, message, revoked],
    );
    throw err;
  }

  const client = await pool.connect();
  let imported = 0;
  try {
    await client.query("BEGIN");
    for (const r of reviews) {
      const risks = detectRisks(r.text);
      const status = risks.length > 0 ? "needs_attention" : "none";
      const res = await client.query(
        `INSERT INTO reviews (business_id, external_id, reviewer_name, rating, text, created_at, risk_categories, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (business_id, external_id) WHERE external_id IS NOT NULL
         DO UPDATE SET
           reviewer_name = EXCLUDED.reviewer_name,
           rating = EXCLUDED.rating,
           text = EXCLUDED.text,
           risk_categories = CASE WHEN reviews.status IN ('none', 'needs_attention')
                                  THEN EXCLUDED.risk_categories ELSE reviews.risk_categories END,
           status = CASE WHEN reviews.status IN ('none', 'needs_attention')
                         THEN EXCLUDED.status ELSE reviews.status END
         RETURNING (xmax = 0) AS inserted`,
        [businessId, r.externalId, r.reviewerName, r.rating, r.text, r.createdAt, risks, status],
      );
      if (res.rows[0]?.inserted) imported++;
    }

    // Full list fetched successfully: anything we reported that is gone is removed.
    const ids = reviews.map((r) => r.externalId);
    await client.query(
      `UPDATE reviews SET status = 'resolved'
        WHERE business_id = $1 AND external_id IS NOT NULL AND status = 'reported'
          AND NOT (external_id = ANY($2::text[]))`,
      [businessId, ids],
    );

    await client.query(
      `UPDATE google_connections SET last_synced_at = now(), sync_error = NULL WHERE business_id = $1`,
      [businessId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { total: reviews.length, imported };
}

const STALE_MS = 10 * 60 * 1000;

/** Fire-and-forget refresh when data is older than 10 minutes (covers hosts that sleep). */
export function maybeSync(businessId: string) {
  if (inFlight.has(businessId)) return;
  inFlight.add(businessId);
  pool
    .query(
      `SELECT 1 FROM google_connections
        WHERE business_id = $1 AND connected = true AND refresh_token_enc IS NOT NULL
          AND (last_synced_at IS NULL OR last_synced_at < now() - ($2 || ' milliseconds')::interval)`,
      [businessId, String(STALE_MS)],
    )
    .then((r) => (r.rowCount ? syncBusiness(businessId) : null))
    .catch((err) => console.error("Background sync failed:", err instanceof Error ? err.message : err))
    .finally(() => inFlight.delete(businessId));
}

export async function syncAllBusinesses() {
  const r = await pool.query(
    `SELECT business_id FROM google_connections WHERE connected = true AND refresh_token_enc IS NOT NULL`,
  );
  for (const { business_id } of r.rows) {
    if (inFlight.has(business_id)) continue;
    inFlight.add(business_id);
    try {
      await syncBusiness(business_id);
    } catch (err) {
      console.error(`Sync failed for ${business_id}:`, err instanceof Error ? err.message : err);
    } finally {
      inFlight.delete(business_id);
    }
  }
}
