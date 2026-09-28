import { Pool } from "pg";

// Managed Postgres (Supabase, Render, Railway, Heroku, ...) requires SSL.
// Local dev Postgres usually has no SSL, so it is only enabled in production.
// Override with DATABASE_SSL=true|false if needed.
// `rejectUnauthorized: false` accepts the provider's cert chain without the CA
// bundle (Supabase's pooler cert fails strict verification otherwise).
// NOTE: don't append `?sslmode=require` to DATABASE_URL - pg would then
// enforce strict verification and override this setting.
const sslEnv = process.env.DATABASE_SSL;
const useSsl =
  sslEnv !== undefined
    ? sslEnv.toLowerCase() === "true"
    : process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle Postgres client", err);
});
