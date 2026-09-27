import type { PoolClient } from "pg";

/**
 * Mirrors seedReviews() from the frontend's mock lib/api.ts — inserted the
 * first time a business connects its Google account, so the UI has data to
 * show immediately, same as the mock behaviour did.
 */
export async function seedDemoReviews(client: PoolClient, businessId: string) {
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

  const seed = [
    {
      reviewerName: "Aqsa R.",
      rating: 1,
      text: "Buy 500 followers instantly at cheapfollowers.example.com!! Best prices, DM me.",
      createdAt: daysAgo(2),
      riskCategories: ["spam", "promotional"],
      status: "needs_attention",
    },
    {
      reviewerName: "Hamza K.",
      rating: 1,
      text: "Never even visited this place, just leaving 1 star because I don't like the owner personally.",
      createdAt: daysAgo(5),
      riskCategories: ["irrelevant", "conflict_of_interest"],
      status: "needs_attention",
    },
    {
      reviewerName: "Sana M.",
      rating: 5,
      text: "Great service, friendly staff, and quick turnaround. Will come back again.",
      createdAt: daysAgo(7),
      riskCategories: [],
      status: "none",
    },
    {
      reviewerName: "Bilal A.",
      rating: 2,
      text: "Service was slow and the staff seemed disorganized. Wouldn't recommend for a quick visit.",
      createdAt: daysAgo(10),
      riskCategories: [],
      status: "none",
    },
    {
      reviewerName: "Unknown User",
      rating: 1,
      text: "You people are disgusting and should be ashamed, I hope your business fails, idiots.",
      createdAt: daysAgo(14),
      riskCategories: ["harassment", "offensive"],
      status: "resolved",
    },
  ];

  for (const r of seed) {
    await client.query(
      `INSERT INTO reviews (business_id, reviewer_name, rating, text, created_at, risk_categories, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [businessId, r.reviewerName, r.rating, r.text, r.createdAt, r.riskCategories, r.status],
    );
  }
}
