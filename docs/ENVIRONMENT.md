# Environment and database

Copy `server/.env.example` to `server/.env`. Copy `client/.env.example` to `client/.env.local` only if the API is not on localhost.

## Required to serve real data

| Variable | Where | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | server | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Server-side key. Do not put this in the client. |
| `JWT_SECRET` or `BUSINESS_JWT_SECRET` | server | Signs business, scanner, and Tap tokens. Required for a healthy production process. |
| `PORT` | server | Defaults to 3000 |

`SUPABASE_ANON_KEY` is accepted if the service role key is absent. Use the service role key. The anon key cannot do what the dashboard does.

## Required for the features that use them

| Variable | Purpose |
| --- | --- |
| `FRONTEND_URL` | Comma-separated browser origins allowed in production CORS. Also used in password-reset and checkout return links. |
| `PAYSTACK_SECRET_KEY` | Paystack checkout, verification, and webhook signatures |
| `PAYSTACK_PUBLIC_KEY` | Shown to the client when a venue has not set its own |
| `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE` | Monnify checkout. All three must be from the same sandbox or live environment. |
| `MONNIFY_WALLET_ACCOUNT_NUMBER` | Source wallet for Monnify payouts |
| `RESEND_API_KEY`, `RESEND_FROM` | Receipts, password reset, welcome, and contact mail |
| `CONTACT_EMAIL` | Inbox for the demo and waitlist forms. Defaults to `info@zuriqo.com`. |
| `ZURI_ADMIN_API_KEY` | Sent as `X-Zuri-Admin-Key` on `/api/admin/*`. Admin routes return 503 until this is set. |
| `VITE_API_URL` | Client build only. Empty in local dev. |

Optional groups (Redis for multi-instance sockets, VAPID keys for web push, Anthropic for menu and storefront AI, Africa's Talking for payment-alert SMS) are commented in `server/.env.example`.

## Database initialization

1. Create a Supabase project.
2. Open the SQL editor and run each file in `supabase/migrations/` in numeric order. Start at `001_initial_schema.sql` and finish at `036_ai_daily_credits.sql`. Each file is written to be safe to re-run.
3. In Storage, create a public bucket named `menu-items` for logos and dish photos.
4. Optional demo data: run `supabase/seed_demo_full.sql`. Login is `demo@zuri.com` / `demo123`. The smaller `supabase/seed_demo_business.sql` only inserts that login.

The API does not create tables on boot. `database.init()` only checks that the Supabase client can be constructed.

## Health

`GET /api/health` returns JSON:

- `ok: true` and HTTP 200 when env is present and route modules loaded
- `ok: false` and HTTP 503 when Supabase env or the production JWT secret is missing, or a route file failed to load
- `degraded: true` when the Supabase circuit breaker is open. The process stays up so a short upstream blip does not restart the container.
