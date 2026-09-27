-- ReviewGuard backend schema
-- Mirrors src/types/index.ts and src/lib/auth.ts on the frontend.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  google_place_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS google_connections (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  connected BOOLEAN NOT NULL DEFAULT false,
  account_email TEXT,
  connected_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- PolicyRiskCategory[]: spam | irrelevant | harassment | offensive | promotional | conflict_of_interest
  risk_categories TEXT[] NOT NULL DEFAULT '{}',
  -- ReviewStatus: needs_attention | reported | resolved | none
  status TEXT NOT NULL DEFAULT 'none'
    CHECK (status IN ('needs_attention', 'reported', 'resolved', 'none')),
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_reviews_business_id ON reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_archived ON reviews(archived);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  review_excerpt TEXT NOT NULL,
  -- PolicyRiskCategory | "other"
  reason TEXT NOT NULL
    CHECK (reason IN ('spam', 'irrelevant', 'harassment', 'offensive', 'promotional', 'conflict_of_interest', 'other')),
  explanation TEXT NOT NULL,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ReportStatus: prepared | submitted | under_review | closed
  status TEXT NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'submitted', 'under_review', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_reports_review_id ON reports(review_id);
