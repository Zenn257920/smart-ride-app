# Smart Ride — Innovix SharedRide Myanmar (production rebuild)

Next.js 15 (App Router) + React 19 + TypeScript strict + Tailwind v4 rebuild of
the Vite HTML/CSS/JS carpool prototype (`Zenn257920/smart-ride-app`).
Real server DB (Neon Postgres + Drizzle), Better Auth, Leaflet/OSM maps,
segment-based fair-split pricing ported 1:1 from the old `RouteMatcher`.

## Stack

- Next.js 15, React 19, TypeScript strict, Tailwind CSS v4
- Better Auth (email + password; phone login resolves to email server-side)
- Drizzle ORM + `@neondatabase/serverless` (Neon Postgres 17, Singapore)
- Leaflet + OpenStreetMap + Nominatim + OSRM (free, no keys)
- Vitest (ported pricing tests), Zod-validated API routes, PWA manifest

## Run locally

```bash
npm install
# create .env.local with DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
npm run db:seed                    # demo users / drivers / rides / bookings
npm run dev
```

NOTE: `drizzle-kit push` fails silently in this VM; apply migrations with
`npx tsx scripts/apply-migration.ts drizzle/<file>.sql` after
`npx drizzle-kit generate`.

## Scripts

- `npm run dev` / `npm run build` / `npm start`
- `npm test` — vitest, ported pricing tests (9 tests)
- `npm run db:seed` — `scripts/seed.ts` (idempotent)
- `node scripts/smoke-test.mjs [baseUrl]` — live smoke test against a running
  server (login via demo accounts, offer → search → book →
  fair-split refund → cancel/refund → rating → ride-request flow → wallet)

## Environment (Vercel: Production + Preview + Development)

- `DATABASE_URL` — pooled Neon connection URI (never commit it)
- `BETTER_AUTH_SECRET` — random secret
- `BETTER_AUTH_URL` — the deployed site URL (e.g. https://smart-ride.vercel.app)

## Demo accounts (password `demo1234` for all)

| Email | Role | Opening balance |
| --- | --- | --- |
| passenger@demo.com | passenger | 50,000 MMK |
| driver@demo.com | driver — ဦးလှမောင်, Toyota Probox YGN 3Q/1122 | 150,000 MMK |
| kyawswa@smartride.mm | driver — Honda Shuttle YGN 2P/5566 | 80,000 MMK |
| ayeaye@smartride.mm | driver — Suzuki Ertiga YGN 5R/9988 | 120,000 MMK |
| zawzaw@smartride.com | passenger | 35,000 MMK |
| maysin@smartride.mm | passenger | 42,000 MMK |
| thantzin@smartride.mm | passenger | 60,000 MMK |

Demo balances drift as smoke tests spend them; re-seed only works on a fresh
database (seed skips existing users).

## Notes / known limitations

- Wallet balance is always the ledger sum (`wallet_transactions`, completed
  only). Top-ups are PENDING records (manual transfer; no payment gateway,
  no admin confirm UI yet) and do not change the balance until confirmed.
- Accepted ride-requests do not settle money yet: prepayments stay held and
  the driver is not credited at accept time. A settlement step (on ride
  completion) is still open — there is no "complete ride" flow in v1.
- The neon-http driver has no multi-statement transactions; money flows are
  ordered sequential writes.
- `drizzle-kit push` / `migrate` fail silently in this VM; use
  `drizzle-kit generate` + `scripts/apply-migration.ts <file>`.
- No Gemini anywhere: the old hardcoded key (exposed in the public repo) was
  never reused. Local matching is the source of truth.
