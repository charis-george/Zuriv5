# Vercel Deployment Guide for ZURI

This guide will help you deploy the ZURI application to Vercel.

## ✅ Database Setup

### Supabase (PostgreSQL)
**The application uses Supabase (PostgreSQL)** which works perfectly on Vercel:
- ✅ Persistent data storage
- ✅ Works with serverless functions
- ✅ Automatic backups
- ✅ Real-time capabilities (if needed)

**Setup Required:**
1. Create a Supabase project (see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md))
2. Run the SQL migration to create tables
3. Set environment variables in Vercel dashboard

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. Git repository pushed to GitHub/GitLab/Bitbucket
3. Environment variables ready

## Deployment Steps

### 1. Install Vercel CLI (Optional)

```bash
npm i -g vercel
```

### 2. Deploy via Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your Git repository
4. Configure the project:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (root)
   - **Build Command**: `cd client && npm install && npm run build`
   - **Output Directory**: `client/dist`
   - **Install Command**: `npm run install:all`

### 3. Set Environment Variables

In the Vercel dashboard, go to **Settings → Environment Variables** and add:

#### Required:
- `NODE_ENV`: `production`
- `FRONTEND_URL`: Your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

#### Optional (for payment processing):
- `PAYSTACK_SECRET_KEY`: Your Paystack secret key

### 4. Deploy

Click "Deploy" and wait for the build to complete.

## Project Structure for Vercel

```
zuri/
├── api/              # Serverless API functions
│   └── index.js      # Main API handler
├── client/           # React frontend
│   └── dist/         # Built frontend (generated)
├── server/           # Server code (used by API)
├── vercel.json       # Vercel configuration
└── package.json      # Root package.json
```

## How It Works

1. **Frontend**: Built and served as static files from `client/dist`
2. **API Routes**: Handled by serverless functions in `api/`
3. **Database**: Uses Supabase (PostgreSQL) - fully persistent and production-ready

## API Routes

All API routes are accessible at:
- `https://your-app.vercel.app/api/*`

For example:
- `/api/business/login`
- `/api/menu/business/:businessId`
- `/api/order`

## Socket.io Limitation

**Socket.io real-time features may not work on Vercel** because:
- Serverless functions don't maintain persistent connections
- Each request is handled by a new function instance

**Alternatives:**
- Use Vercel's WebSocket support (if available)
- Use a separate service for real-time features (Pusher, Ably, etc.)
- Deploy backend separately on a platform that supports WebSockets (Railway, Render, etc.)

## Troubleshooting

### Build Fails

1. Check build logs in Vercel dashboard
2. Ensure all dependencies are in `package.json`
3. Verify Node.js version (should be 18.x)

### API Routes Return 404

1. Check `vercel.json` configuration
2. Ensure `api/index.js` exists
3. Verify route paths match

### Database Errors

1. Verify Supabase credentials are set correctly
2. Check that tables exist in Supabase dashboard
3. Ensure RLS policies allow service role access
4. Check Supabase project is active (not paused)

### Environment Variables Not Working

1. Ensure variables are set in Vercel dashboard
2. Redeploy after adding new variables
3. Check variable names match exactly (case-sensitive)

## Database Setup

The application uses **Supabase (PostgreSQL)** which is already configured. To set it up:

1. **Create Supabase project** (see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md))
2. **Run SQL migration** from `supabase/migrations/001_initial_schema.sql`
3. **Set environment variables** in Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

That's it! Supabase works perfectly with Vercel's serverless functions.

## Local Development

For local development, continue using:
```bash
npm run dev
```

This uses the regular Express server with SQLite, which works fine locally.

## Production Recommendations

For a production-ready deployment:

1. **Use a cloud database** (PostgreSQL, MongoDB, etc.)
2. **Deploy backend separately** if you need:
   - Socket.io real-time features
   - Persistent file storage
   - Long-running processes
3. **Use Vercel for frontend** and a service like Railway/Render for backend

## Support

If you encounter issues:
1. Check Vercel build logs
2. Review function logs in Vercel dashboard
3. Test API routes using Vercel's function logs
4. Verify environment variables are set correctly

