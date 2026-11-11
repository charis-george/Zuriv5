// Vercel serverless function entry point
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });

const routeLoadErrors = {};
function safeRequireRoute(label, modulePath) {
  try {
    const router = require(modulePath);
    delete routeLoadErrors[label];
    return router;
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    routeLoadErrors[label] = message;
    console.error(`[ZURI] Route module failed to load: ${label}`, message);
    const router = express.Router();
    router.use((_req, res) => {
      res.status(503).json({ error: `Route temporarily unavailable: ${label}`, detail: message });
    });
    return router;
  }
}

const app = express();

// Middleware — webhooks need raw body before JSON parser
const webhookRawParser = express.raw({ type: () => true, limit: '2mb' });
app.use('/api/payment/webhook', webhookRawParser);
app.use('/api/payment/monnify-webhook', webhookRawParser);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database (for Vercel serverless)
let dbInitialized = false;
const initDatabase = async () => {
  if (!dbInitialized) {
    try {
      const { init } = require('../server/database');
      await init();
      dbInitialized = true;
      console.log('Database initialized for Vercel');
    } catch (error) {
      console.error('Database initialization error:', error);
      // Continue anyway - Supabase connection is handled per-request
    }
  }
};

// Mock Socket.io for routes (since Socket.io doesn't work on serverless)
const mockIo = {
  to: () => mockIo,
  emit: () => {},
  on: () => {}
};

// Make mock io available to routes
app.set('io', mockIo);

// Initialize database before handling requests
app.use(async (req, res, next) => {
  await initDatabase();
  next();
});

// Import routes (safe load so one broken module does not crash the whole API)
const businessRoutes = safeRequireRoute('business', '../server/routes/business');
const menuRoutes = safeRequireRoute('menu', '../server/routes/menu');
const orderRoutes = safeRequireRoute('order', '../server/routes/order');
const analyticsRoutes = safeRequireRoute('analytics', '../server/routes/analytics');
const qrRoutes = safeRequireRoute('qr', '../server/routes/qr');
const paymentRoutes = safeRequireRoute('payment', '../server/routes/payment');
const contactRoutes = safeRequireRoute('contact', '../server/routes/contact');
const subscriptionRoutes = safeRequireRoute('subscription', '../server/routes/subscription');
const aiRoutes = safeRequireRoute('ai', '../server/routes/ai');
const banksRoutes = safeRequireRoute('banks', '../server/routes/banks');
const tapRoutes = safeRequireRoute('tap', '../server/routes/tap');
const tapAuthRoutes = safeRequireRoute('tap-auth', '../server/routes/tap-auth');
const networkRoutes = safeRequireRoute('network', '../server/routes/network');
const reservationRoutes = safeRequireRoute('reservations', '../server/routes/reservations');
const adminRoutes = safeRequireRoute('admin', '../server/routes/admin');
const agentRoutes = safeRequireRoute('agent', '../server/routes/agent');

// Mount under /api so client calls like /api/business/login work
app.use('/api/business', businessRoutes);
app.use('/api/banks', banksRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/tap', tapRoutes);
app.use('/api/tap-auth', tapAuthRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: Object.keys(routeLoadErrors).length === 0,
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel' : 'local',
    routeLoadErrors: Object.keys(routeLoadErrors).length ? routeLoadErrors : undefined
  });
});

// Explicit API 404 for serverless deploys (must be after /api/health and route mounts)
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API route not found',
    path: req.originalUrl
  });
});

// Export for Vercel
module.exports = app;

