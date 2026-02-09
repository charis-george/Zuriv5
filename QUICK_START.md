# ZURI Quick Start Guide

## 🚀 Get Started in 5 Minutes

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Set Up Supabase

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com) and create a free account
   - Create a new project
   - Wait for project to be ready (~2 minutes)

2. **Get Your Credentials**
   - Go to **Settings** → **API**
   - Copy your **Project URL** and **service_role** key

3. **Create Database Tables**
   - Go to **SQL Editor** in Supabase dashboard
   - Copy contents of `supabase/migrations/001_initial_schema.sql`
   - Paste and click **Run**

4. **Set Environment Variables**
   - Create `server/.env` file:
   ```env
   PORT=3000
   FRONTEND_URL=http://localhost:5173
   SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### 3. Start Development
```bash
npm run dev
```

### 4. Access the App
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000

### 5. Test Login
- **Email**: demo@zuri.com
- **Password**: demo123

## 📚 Full Documentation

- **Supabase Setup**: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- **Vercel Deployment**: [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)
- **General Setup**: [SETUP.md](./SETUP.md)

## 🔑 Required Keys

| Key | Where to Find |
|-----|---------------|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role key |

Both keys look like:
- URL: `https://xxxxxxxxxxxxx.supabase.co`
- Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (long JWT token)

## ✅ What's Included

- ✅ Full-stack React + Node.js application
- ✅ Supabase PostgreSQL database
- ✅ Real-time order notifications (Socket.io)
- ✅ QR code generation and scanning
- ✅ Business analytics dashboard
- ✅ Menu management system
- ✅ Payment integration (Paystack)

## 🐛 Troubleshooting

**"Missing Supabase environment variables"**
→ Make sure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are in `server/.env`

**"relation does not exist"**
→ Run the SQL migration in Supabase SQL Editor

**"permission denied"**
→ Check that you're using the `service_role` key (not `anon` key)

For more help, see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

