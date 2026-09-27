# ReviewGuard Backend

Express + TypeScript + PostgreSQL API for the ReviewGuard frontend
(`syntralogic/ReviewGuard-Frontend`). This replaces the frontend's mock
`localStorage` layer (`src/lib/api.ts`, `src/lib/auth.ts`) with a real
database and session auth — the data shapes match those files exactly.

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

## Not yet done

- Frontend is not wired up yet (`src/lib/api.ts` / `src/lib/auth.ts` still
  point at the mock localStorage layer) — intentionally left as-is per request.
- No real Google Business Profile integration — `/api/connection/connect`
  simulates it the same way the mock did.
