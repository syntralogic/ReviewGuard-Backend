import { Pool } from "pg";

// Managed Postgres providers (Render, Railway, Supabase, Heroku, etc.) require
// SSL on external/internal connections in production. Local dev Postgres
// typically has no SSL configured, so only enable it outside development.
// `rejectUnauthorized: false` accepts the provider's own cert chain without
// needing the CA bundle configured — standard practice for these hosts.
const isProduction = process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle Postgres client", err);
});
