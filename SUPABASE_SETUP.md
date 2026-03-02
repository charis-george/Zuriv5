# Supabase Setup Guide for ZURI

This guide will help you set up Supabase (PostgreSQL) for the ZURI application.

## Prerequisites

1. A Supabase account (sign up at [supabase.com](https://supabase.com))
2. Basic knowledge of SQL (for running migrations)

## Step 1: Create a Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Click **"New Project"**
3. Fill in the project details:
   - **Name**: `zuri-qr-ordering` (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose the closest region to your users
4. Click **"Create new project"**
5. Wait for the project to be created (takes 1-2 minutes)

## Step 2: Get Your Supabase Credentials

1. In your project dashboard, go to **Settings** → **API**
2. You'll see two important values:

### Project URL
- This is your `SUPABASE_URL`
- Looks like: `https://xxxxxxxxxxxxx.supabase.co`

### API Keys
- **`anon` key**: Public key (for client-side, if needed)
- **`service_role` key**: Secret key (for server-side) - **Keep this secret!**
- The **service_role** key is a long JWT starting with `eyJhbGciOiJ...` (hundreds of characters). Use this in `SUPABASE_SERVICE_ROLE_KEY`.
- Do **not** use the anon key or any key that looks like `sb_publishable_...` for the server: Storage uploads and RLS bypass require the real **service_role** secret.

**Copy these values** - you'll need them for your `.env` file.

## Step 3: Create Database Tables

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **"New query"**
3. Copy and paste the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Click **"Run"** (or press `Ctrl+Enter`)
5. You should see "Success. No rows returned" - this means the tables were created successfully

## Step 4: Verify Tables Were Created

1. Go to **Table Editor** in the left sidebar
2. You should see these tables:
   - `businesses`
   - `categories`
   - `menu_items`
   - `orders`
   - `order_items`

## Step 4b: Create Storage Bucket (for menu item images)

To allow businesses to upload menu item photos:

1. In the left sidebar, go to **Storage**
2. Click **"New bucket"**
3. Name: **`menu-items`** (exactly)
4. Enable **Public bucket** (so storefront can show images)
5. Click **Create bucket**

If this bucket is missing, menu image uploads will fail with "Bucket not found"; creating it fixes the issue.

**If uploads fail with "new row violates row-level security policy" (403):** add Storage RLS policies so the backend can upload. In **SQL Editor**, run the contents of `supabase/migrations/006_storage_menu_items_policies.sql`. That adds:
- INSERT policy for `service_role` on bucket `menu-items`
- SELECT policy for `public` on bucket `menu-items` (so images are viewable)

## Step 5: Configure Environment Variables

### Backend `.env` file (`server/.env`)

Add these variables:

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Server Configuration
PORT=3000
FRONTEND_URL=http://localhost:5173

# Payment Configuration (Optional)
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxx
```

### For Vercel Deployment

Add these same variables in your Vercel dashboard:
1. Go to your project → **Settings** → **Environment Variables**
2. Add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FRONTEND_URL` (your Vercel URL)
   - `PAYSTACK_SECRET_KEY` (if using payments)

## Step 6: Key Identification Guide

Here's how to identify each key and where to find them:

| Key Name | What It Looks Like | Where to Find |
|----------|-------------------|---------------|
| `SUPABASE_URL` | `https://xxxxxxxxxxxxx.supabase.co` | Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (long JWT token) | Settings → API → service_role key |

## Step 7: Install Dependencies

Run this command to install Supabase client:

```bash
cd server
npm install @supabase/supabase-js
```

Or from the root:

```bash
npm run install:all
```

## Step 8: Test the Connection

1. Start your server:
   ```bash
   npm run dev
   ```

2. Check the console - you should see:
   ```
   Initializing Supabase database...
   Demo business already exists
   Supabase database initialized successfully
   ```

3. Try registering a new business or logging in with:
   - Email: `demo@zuri.com`
   - Password: `demo123`

## Database Schema Overview

### Tables

1. **businesses** - Stores business information
   - `id` (UUID)
   - `name`, `email`, `password`
   - `phone`, `address`
   - `created_at`

2. **categories** - Menu categories
   - `id` (UUID)
   - `business_id` (foreign key)
   - `name`, `display_order`

3. **menu_items** - Menu items
   - `id` (UUID)
   - `business_id`, `category_id` (foreign keys)
   - `name`, `description`, `price`, `cost`
   - `image_url`, `available`, `display_order`

4. **orders** - Customer orders
   - `id` (UUID)
   - `business_id` (foreign key)
   - `customer_name`, `customer_phone`, `customer_email`
   - `status`, `total_amount`, `estimated_prep_time`
   - `payment_status`, `created_at`, `completed_at`

5. **order_items** - Items in each order
   - `id` (UUID)
   - `order_id`, `menu_item_id` (foreign keys)
   - `quantity`, `price`, `special_notes`

## Row Level Security (RLS)

The database uses Row Level Security policies. Currently, all policies allow service role access (for backend operations). For production, you may want to:

1. Add more restrictive policies
2. Use Supabase Auth for user authentication
3. Implement proper access controls

## Troubleshooting

### Error: "Missing Supabase environment variables"
- Make sure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in your `.env` file
- Restart your server after adding environment variables

### Error: "relation does not exist"
- Run the SQL migration in Supabase SQL Editor
- Make sure all tables were created successfully

### Error: "permission denied"
- Check that RLS policies are set correctly
- Verify you're using the `service_role` key (not `anon` key) for backend operations

### Connection Issues
- Verify your `SUPABASE_URL` is correct
- Check that your project is active (not paused)
- Ensure your IP is not blocked (Supabase allows all IPs by default)

## Security Best Practices

1. **Never commit `.env` files** - They're already in `.gitignore`
2. **Never expose service_role key** - Keep it server-side only
3. **Use environment variables** - Don't hardcode credentials
4. **Rotate keys periodically** - You can regenerate keys in Supabase dashboard
5. **Use RLS policies** - Implement proper access controls for production

## Next Steps

After setting up Supabase:
1. Test user registration and login
2. Create a test business and menu
3. Test order creation
4. Verify analytics are working
5. Deploy to Vercel with environment variables set

## Supabase Dashboard Features

You can use the Supabase dashboard to:
- **View data**: Table Editor shows all your data
- **Run queries**: SQL Editor for custom queries
- **Monitor**: Check database usage and performance
- **Backup**: Automatic backups (on paid plans)
- **API Docs**: Auto-generated API documentation

## Support

If you encounter issues:
1. Check Supabase dashboard logs
2. Verify environment variables are set correctly
3. Check that tables exist in Table Editor
4. Review RLS policies in Authentication → Policies
5. Check Supabase status page: https://status.supabase.com/

