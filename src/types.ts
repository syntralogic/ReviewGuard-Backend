export type PolicyRiskCategory =
  | "spam"
  | "irrelevant"
  | "harassment"
  | "offensive"
  | "promotional"
  | "conflict_of_interest";

export type ReviewStatus = "needs_attention" | "reported" | "resolved" | "none";

export interface Review {
  id: string;
  businessId: string;
  reviewerName: string;
  rating: number;
  text: string;
  createdAt: string;
  riskCategories: PolicyRiskCategory[];
  status: ReviewStatus;
  notes: string | null;
  archived: boolean;
}

export type ReportStatus = "prepared" | "submitted" | "under_review" | "closed";

export interface Report {
  id: string;
  reviewId: string;
  reviewExcerpt: string;
  reason: PolicyRiskCategory | "other";
  explanation: string;
  evidence: string | null;
  createdAt: string;
  status: ReportStatus;
}

export interface GoogleConnection {
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
}

export interface DashboardStats {
  totalReviews: number | null;
  averageRating: number | null;
  needsAttention: number | null;
  reportsSubmitted: number | null;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

// --- DB row shapes (snake_case) ---

export interface ReviewRow {
  id: string;
  business_id: string;
  reviewer_name: string;
  rating: number;
  text: string;
  created_at: Date;
  risk_categories: string[];
  status: ReviewStatus;
  notes: string | null;
  archived: boolean;
}

export interface ReportRow {
  id: string;
  review_id: string;
  review_excerpt: string;
  reason: string;
  explanation: string;
  evidence: string | null;
  created_at: Date;
  status: ReportStatus;
}

export function reviewRowToDto(row: ReviewRow): Review {
  return {
    id: row.id,
    businessId: row.business_id,
    reviewerName: row.reviewer_name,
    rating: row.rating,
    text: row.text,
    createdAt: row.created_at.toISOString(),
    riskCategories: (row.risk_categories ?? []) as PolicyRiskCategory[],
    status: row.status,
    notes: row.notes,
    archived: row.archived,
  };
}

export function reportRowToDto(row: ReportRow): Report {
  return {
    id: row.id,
    reviewId: row.review_id,
    reviewExcerpt: row.review_excerpt,
    reason: row.reason as PolicyRiskCategory | "other",
    explanation: row.explanation,
    evidence: row.evidence,
    createdAt: row.created_at.toISOString(),
    status: row.status,
  };
}
