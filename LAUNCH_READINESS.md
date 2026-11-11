# ZURI Launch Readiness Checklist

Use this checklist to ensure the product is ready for first launch. Items are implemented in code; check off as you verify in your environment.

---

## Security & configuration

- [x] **JWT secret required in production** – Server fails to start if `BUSINESS_JWT_SECRET` or `JWT_SECRET` is missing when `NODE_ENV=production`.
- [x] **CORS restricted in production** – API and Socket.io only allow requests from `FRONTEND_URL` when set in production.
- [x] **Password reset via email** – When SMTP is configured, reset links are sent by email; reset link is not returned in the API response.
- [x] **Rate limiting** – Auth routes (login, register) and payment routes are rate-limited to reduce abuse.

---

## Product & UX

- [x] **404 page** – Unknown routes show a “Page not found” screen with a link home.
- [x] **Order page error state** – When business not found or menu fails to load, the page shows a clear message with “Back to home” and “Scan again” links.
- [x] **Debug instrumentation removed** – No debug `fetch` or logging left in `OrderPage.tsx` or other client pages.

---

## Documentation & deployment

- [x] **Deployment checklist updated** – `DEPLOYMENT_CHECKLIST.md` reflects Supabase (no SQLite), required env vars, and Paystack.
- [x] **Paystack and env documented** – README and deployment docs list required variables (`SUPABASE_*`, `PAYSTACK_*`, `FRONTEND_URL`, `BUSINESS_JWT_SECRET`).
- [ ] **Real-time on Vercel** – Documented: on Vercel serverless, Socket.io is mocked; real-time order updates require a separate WebSocket server or Supabase Realtime if needed.

---

## Error handling & observability

- [x] **ErrorBoundary hardened** – In production, only a generic “Something went wrong” message is shown; full error message is not exposed.
- [ ] **Error tracking (optional)** – Add Sentry or similar for client/server errors and track in production (see README or code comments).

---

## Pre-launch verification

- [ ] Set all required environment variables in production (see `DEPLOYMENT_CHECKLIST.md`).
- [ ] Test business signup → onboarding → dashboard → add menu → QR → place test order → payment.
- [ ] Test password reset flow (with SMTP configured).
- [ ] Test 404 by visiting an invalid URL.
- [ ] Confirm rate limiting responds with 429 when limits are exceeded (optional).

---

## Required environment variables (production)

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | Set to `production` |
| `FRONTEND_URL` | Frontend origin (e.g. `https://your-app.vercel.app`) for CORS |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `BUSINESS_JWT_SECRET` or `JWT_SECRET` | Secret for business JWT (required in production) |
| `PAYSTACK_SECRET_KEY` | Paystack secret key for payments |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key for client (optional if per-business keys used) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Optional; for password reset and contact emails |
