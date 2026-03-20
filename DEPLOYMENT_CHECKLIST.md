# ZURI Deployment Checklist

## Pre-Deployment

- [ ] Code is pushed to Git repository (GitHub/GitLab/Bitbucket)
- [ ] All dependencies are in `package.json` files (root, `server/`, `client/`)
- [ ] Environment variables are set (see **Required environment variables** below)
- [ ] Supabase project created and migrations run (see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md))
- [ ] Paystack account created; secret and public keys ready (test keys for staging, live for production)

## Required environment variables

Set these in your hosting provider (e.g. Vercel) or in `server/.env` for self-hosted:

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Production | Set to `production` |
| `FRONTEND_URL` | Production | Frontend origin, e.g. `https://your-app.vercel.app` (used for CORS and password reset links) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `BUSINESS_JWT_SECRET` or `JWT_SECRET` | Production | Strong secret for business JWTs (required in production; server will not start without it) |
| `PAYSTACK_SECRET_KEY` | Payments | Paystack secret key (test key for staging, live for production) |
| `PAYSTACK_PUBLIC_KEY` | Optional | Paystack public key for client (if not using per-business keys) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Optional | For password reset and contact form emails; if missing, reset link is only returned in dev |

## Vercel configuration

- [x] `vercel.json` created
- [x] `api/index.js` created for serverless functions
- [x] `.vercelignore` created

### Deployment steps

1. **Connect repository** at [vercel.com](https://vercel.com) → Add New Project → Import Git repo.
2. **Configure project**
   - Framework Preset: **Other**
   - Root Directory: `./`
   - Build Command: `cd client && npm install && npm run build`
   - Output Directory: `client/dist`
   - Install Command: `npm run install:all`
3. **Set environment variables** (see table above). Include `VERCEL=1` (set automatically by Vercel).
4. **Deploy** and wait for build to complete.
5. **Post-deploy**: Set `FRONTEND_URL` to your actual Vercel URL (e.g. `https://your-app.vercel.app`).

## Known limitations on Vercel

- **Socket.io**: Real-time features (live order updates, “order ready” notifications) do not work on Vercel serverless because Socket.io requires a long-lived connection. The API uses a mock Socket.io; order and payment flows still work, but the dashboard and customer will not get real-time updates. For full real-time, run the Express server on a platform that supports WebSockets (e.g. Railway, Render, or a VPS) or consider Supabase Realtime.
- **File uploads**: Menu item images are stored in Supabase Storage; no local `/tmp` dependency.

## Database

- **Supabase (PostgreSQL)** is the database. Run all migrations in `supabase/migrations/` in order against your Supabase project. Data persists in Supabase; nothing is stored on Vercel’s filesystem.

## Testing checklist

- [ ] Homepage loads
- [ ] QR scanner works (`/scan`)
- [ ] Business login and onboarding
- [ ] Menu and QR code generation
- [ ] Place test order and payment (Paystack test mode)
- [ ] Password reset (with SMTP configured)
- [ ] Invalid URL shows 404 page
- [ ] `/api/health` returns `{ "status": "ok" }`

## Troubleshooting

- **Build fails**: Check Node version (18.x), run `npm run install:all` locally, fix any missing deps or TypeScript errors.
- **API 404**: Ensure `api/index.js` exists and routes are mounted under `/api`.
- **CORS errors**: Set `FRONTEND_URL` to the exact origin of your frontend (no trailing slash).
- **JWT / auth errors**: In production, `BUSINESS_JWT_SECRET` or `JWT_SECRET` must be set or the server will not start.
- **Payments fail**: Confirm `PAYSTACK_SECRET_KEY` and (if used) `PAYSTACK_PUBLIC_KEY` are set; configure Paystack webhook to your `/api/payment/webhook` URL.
