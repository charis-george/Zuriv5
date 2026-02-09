# Vercel Deployment Checklist

## Pre-Deployment

- [ ] Code is pushed to Git repository (GitHub/GitLab/Bitbucket)
- [ ] All dependencies are in `package.json` files
- [ ] Environment variables are documented
- [ ] Database migration plan (SQLite won't persist on Vercel)

## Vercel Configuration

- [x] `vercel.json` created
- [x] `api/index.js` created for serverless functions
- [x] `.vercelignore` created
- [x] Database configured to use `/tmp` on Vercel

## Deployment Steps

1. **Connect Repository**
   - [ ] Go to [vercel.com](https://vercel.com)
   - [ ] Click "Add New Project"
   - [ ] Import your Git repository

2. **Configure Project**
   - [ ] Framework Preset: **Other**
   - [ ] Root Directory: `./` (root)
   - [ ] Build Command: `cd client && npm install && npm run build`
   - [ ] Output Directory: `client/dist`
   - [ ] Install Command: `npm run install:all`

3. **Environment Variables**
   - [ ] `NODE_ENV` = `production`
   - [ ] `FRONTEND_URL` = Your Vercel URL (set after first deploy)
   - [ ] `PAYSTACK_SECRET_KEY` = Your Paystack key (if using payments)
   - [ ] `VERCEL` = `1` (automatically set by Vercel)

4. **Deploy**
   - [ ] Click "Deploy"
   - [ ] Wait for build to complete
   - [ ] Check deployment logs for errors

5. **Post-Deployment**
   - [ ] Update `FRONTEND_URL` with actual Vercel URL
   - [ ] Test API endpoints: `https://your-app.vercel.app/api/health`
   - [ ] Test frontend: `https://your-app.vercel.app`
   - [ ] Test business login
   - [ ] Test order creation

## Known Limitations

- [ ] **SQLite**: Data won't persist between deployments
- [ ] **Socket.io**: Real-time features may not work
- [ ] **File uploads**: Limited to `/tmp` directory

## Recommended Next Steps

- [ ] Migrate to cloud database (PostgreSQL, MongoDB, etc.)
- [ ] Set up separate backend for Socket.io if needed
- [ ] Configure custom domain (optional)
- [ ] Set up monitoring and error tracking

## Testing Checklist

- [ ] Homepage loads correctly
- [ ] QR scanner works
- [ ] Business login works
- [ ] Menu displays correctly
- [ ] Order creation works
- [ ] Order status updates work
- [ ] Analytics dashboard loads
- [ ] QR code generation works

## Troubleshooting

If deployment fails:
1. Check build logs in Vercel dashboard
2. Verify all dependencies are installed
3. Check Node.js version (should be 18.x)
4. Verify environment variables are set
5. Check API route paths

If API routes return 404:
1. Verify `api/index.js` exists
2. Check `vercel.json` configuration
3. Ensure routes are properly exported

If database errors occur:
1. Remember SQLite is temporary on Vercel
2. Consider migrating to cloud database
3. Check `/tmp` directory permissions

