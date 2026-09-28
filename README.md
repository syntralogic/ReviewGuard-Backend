# ReviewGuard Backend

Express + TypeScript + PostgreSQL API for the ReviewGuard frontend
(`syntralogic/ReviewGuard-Frontend`). This replaces the frontend's mock
`localStorage` layer (`src/lib/api.ts`, `src/lib/auth.ts`) with a real
database and session auth. The frontend is wired to this API via `api-client.ts`.

## Stack

- Express 4 + TypeScript
- PostgreSQL (via `pg`)
- JWT auth in an httpOnly cookie (`bcryptjs` for password hashing)
- `zod` for request validation

## Setup

```sh
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, CLIENT_ORIGIN
npm run db:migrate     # creates all tables (safe to re-run)
npm run dev            # http://localhost:4000
```

Requires a running PostgreSQL instance reachable at `DATABASE_URL`.

## API

All routes below `/api/*` except `/api/auth/signup` and `/api/auth/login`
require the session cookie (set automatically on signup/login).

| Method | Path                          | Notes                                   |
|--------|-------------------------------|------------------------------------------|
| POST   | `/api/auth/signup`            | `{ name, email, password }`             |
| POST   | `/api/auth/login`             | `{ email, password }`                   |
| POST   | `/api/auth/logout`            |                                          |
| GET    | `/api/auth/me`                |                                          |
| GET    | `/api/connection`              | Google connection status                |
| POST   | `/api/connection/connect`      | `{ accountEmail }` — seeds demo reviews on first connect |
| POST   | `/api/connection/disconnect`   |                                          |
| GET    | `/api/dashboard/stats`         |                                          |
| GET    | `/api/reviews`                 | Active (non-archived) reviews           |
| GET    | `/api/reviews/archived`        |                                          |
| GET    | `/api/reviews/:id`             |                                          |
| PATCH  | `/api/reviews/:id/notes`       | `{ notes }`                             |
| POST   | `/api/reviews/:id/archive`     |                                          |
| POST   | `/api/reviews/:id/unarchive`   |                                          |
| POST   | `/api/reviews/:id/mark-removed`| Confirms Google actually removed it     |
| GET    | `/api/reports`                 |                                          |
| GET    | `/api/reports/review/:reviewId`|                                          |
| POST   | `/api/reports`                 | `{ reviewId, reason, explanation, evidence }` |
| POST   | `/api/reports/:id/submit`      | Marks a prepared report as submitted    |

Every account gets one `business` row on signup (the app doesn't yet support
multiple businesses per user — same single-business assumption the frontend
mock used with its `"demo-business"` id).

## Deploy: Supabase (database) + Render (backend)

1. **Supabase** - create a project, then *Connect* -> *Session pooler* and copy
   the connection string (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`).
   Use the pooler, not the direct `db.<ref>.supabase.co` host: Render is
   IPv4-only and the direct host is IPv6-only. Don't add `?sslmode=require`.
2. **Render** - New -> Web Service -> this repo.
   - Build Command: `npm install --include=dev && npm run build && npm run db:migrate:prod`
   - Start Command: `npm start`
   - The build command applies the schema on every deploy (idempotent), so no
     Render Shell is needed. `--include=dev` is required because
     `NODE_ENV=production` would otherwise skip TypeScript.
3. **Environment variables** on Render:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Supabase session-pooler string |
   | `JWT_SECRET` | long random string (`openssl rand -hex 32`) |
   | `NODE_ENV` | `production` (enables SSL + cross-site cookies) |
   | `CLIENT_ORIGIN` | exact frontend URL, no trailing slash |
   | `JWT_EXPIRES_IN` | `7d` |
   | `COOKIE_NAME` | `reviewguard_session` |

4. Point the frontend's `VITE_API_URL` at the Render URL and redeploy it.

The schema enables Row Level Security on every table so Supabase's auto-generated
REST API can't expose them; the backend connects as `postgres`, which bypasses RLS.

## Not yet done

- Admin endpoints (`/api/admin/*`) exist but the frontend admin panel does not
  call them yet.
- No real Google Business Profile integration - `/api/connection/connect`
  simulates it.
