# ZURI

ZURI is a QR ordering and payments app for restaurants, shops, and ticketed events. Guests open a link or scan a table code, pick from the venue's menu, and pay with Paystack or Monnify. The venue runs orders, reservations, and payouts from a dashboard.

The live product is [zuriqo.com](https://zuriqo.com). This repository is the application: a React client, an Express API, and the Supabase schema.

## Repository

QR ordering, in-person payments, and event ticketing for hospitality venues.

Topics: `hospitality`, `qr-ordering`, `payments`, `react`, `express`, `supabase`

## Layout

| Path | What it is |
| --- | --- |
| `client/` | React 18 + Vite + Tailwind |
| `server/` | Express API, Socket.IO, payment and email workers |
| `supabase/migrations/` | Postgres schema, applied in filename order |
| `supabase/seed_demo_full.sql` | Demo venue, menu, and one sample order |
| `docs/` | Architecture, API, environment, and a short demo |

## Run it

You need Node.js 20 or newer. The marketing pages run without a database. Orders, login, and payments need a Supabase project.

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env.local
```

Leave `client/.env.local` empty for local development. Vite proxies `/api` to `http://127.0.0.1:3000`.

Put at least these in `server/.env`:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
```

`JWT_SECRET` can be any long random string. In production the process still boots without it, but `/api/health` stays unhealthy and auth routes fail.

Apply every file in `supabase/migrations/` in the Supabase SQL editor, from `001_initial_schema.sql` through `037_lock_down_rls.sql`. Then run `supabase/seed_demo_full.sql` if you want the demo venue.

```bash
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:3000/api/health

Demo login after the seed: `demo@zuri.com` / `demo123`

`/api/health` returns `200` when Supabase env and the JWT secret are present and every route module loaded. If Supabase is not configured it returns `503` and lists what is missing. The process is still up.

Frontend only:

```bash
npm run dev:client
```

Production-style API, after `npm run build`:

```bash
npm start
```

That serves `client/dist` and the API on `PORT` (default 3000).

## Tests

```bash
npm test
npm run build:client
```

The test suite does not need Supabase, Paystack, or Monnify. It covers business and admin authentication, order validation, and payment-webhook idempotency. GitHub Actions runs the same commands on every push.

## Payments and mail

Checkout uses the platform Paystack or Monnify keys, chosen per venue. Webhooks:

- `POST /api/payment/webhook` — Paystack, `x-paystack-signature`
- `POST /api/payment/monnify-webhook` — Monnify

A repeated success event for an order that is already paid does not settle it again. If the receipt email never went out, the webhook only retries that email.

Outbound mail uses [Resend](https://resend.com) (`RESEND_API_KEY`, `RESEND_FROM`).

## More detail

- [Architecture](docs/ARCHITECTURE.md)
- [Environment and database](docs/ENVIRONMENT.md)
- [API and authentication](docs/API.md)
- [Product demo](docs/DEMO.md)
- [Deployment notes](docs/DEPLOYMENT.md)
