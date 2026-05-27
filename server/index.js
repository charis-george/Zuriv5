const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Don’t crash the container on misconfig; start server and surface 503s instead.
const SUPABASE_ENV_OK = Boolean(
  process.env.SUPABASE_URL &&
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
);
if (!SUPABASE_ENV_OK) {
  console.error(
    '[ZURI] Missing Supabase env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in Railway → Variables.'
  );
}

/** Comma-separated list, e.g. https://app.vercel.app,https://preview.vercel.app */
function parseFrontendOrigins() {
  const raw = process.env.FRONTEND_URL;
  if (!raw || typeof raw !== 'string') return null;
  const list = raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return list.length ? list : null;
}

const app = express();
const server = http.createServer(app);

// Running behind Railway/Render/Nginx/etc: enables correct client IP detection
// for rate limiting when X-Forwarded-For is present.
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 1);

const frontendOrigins =
  process.env.NODE_ENV === 'production' ? parseFrontendOrigins() : null;
const corsOriginOption =
  frontendOrigins && frontendOrigins.length === 1
    ? frontendOrigins[0]
    : frontendOrigins && frontendOrigins.length > 1
      ? frontendOrigins
      : undefined;

const socketCorsOrigin =
  process.env.NODE_ENV === 'production' && corsOriginOption ? corsOriginOption : '*';

const io = socketIo(server, {
  cors: {
    origin: socketCorsOrigin,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Webhook needs raw body for signature verification (must be before express.json())
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// CORS: in production, allow FRONTEND_URL (comma-separated for prod + Vercel previews)
app.use(cors(corsOriginOption ? { origin: corsOriginOption } : {}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/dist')));

if (!SUPABASE_ENV_OK) {
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    res.status(503).json({
      error: 'Server misconfigured: Supabase env missing',
      missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)']
    });
  });
}

// Rate limiting: auth and payment routes (webhook excluded)
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  skip: (req) => req.path === '/api/payment/webhook',
  message: { error: 'Too many payment requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/business', authLimiter);
app.use('/api/payment', paymentLimiter);

function safeRequireRoute(label, modulePath) {
  try {
    return require(modulePath);
  } catch (e) {
    console.error(`[ZURI] Route module failed to load: ${label}`, {
      modulePath,
      message: e && e.message ? e.message : String(e)
    });
    const router = express.Router();
    router.use((_req, res) => {
      res.status(503).json({ error: `Route temporarily unavailable: ${label}` });
    });
    return router;
  }
}

// Import routes
const businessRoutes = safeRequireRoute(
  'business',
  './routes/' + (fs.existsSync(path.join(__dirname, 'routes', 'business.js')) ? 'business.js' : 'Business.js')
);
const menuRoutes = safeRequireRoute('menu', './routes/menu');
const orderRoutes = safeRequireRoute('order', './routes/order');
const analyticsRoutes = safeRequireRoute('analytics', './routes/analytics');
const qrRoutes = safeRequireRoute('qr', './routes/qr');
const paymentRoutes = safeRequireRoute('payment', './routes/payment');
const contactRoutes = safeRequireRoute('contact', './routes/contact');
const subscriptionRoutes = safeRequireRoute('subscription', './routes/subscription');
const aiRoutes = safeRequireRoute('ai', './routes/ai');
const banksRoutes = safeRequireRoute('banks', './routes/banks');
const tapRoutes = safeRequireRoute('tap', './routes/tap');
const tapAuthRoutes = safeRequireRoute('tap-auth', './routes/tap-auth');
const networkRoutes = safeRequireRoute('network', './routes/network');
const reservationRoutes = safeRequireRoute('reservations', './routes/reservations');
const reviewRoutes = safeRequireRoute('reviews', './routes/reviews');

// Routes
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
app.use('/api/tap', tapRoutes);
app.use('/api/tap-auth', tapAuthRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/reviews', reviewRoutes);

// Uptime / CORS check (register before SPA fallback)
app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, uptime: process.uptime() });
});

// Socket.io for real-time updates
const { verifyBusinessToken } = require('./middleware/auth');

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Public storefront room (no auth) for live theme updates on customer ordering pages
  socket.on('join-storefront', (data) => {
    const businessId = typeof data === 'string' ? data : data?.businessId;
    if (!businessId || typeof businessId !== 'string') return;
    socket.join(`storefront-${businessId}`);
  });

  socket.on('join-business', (data) => {
    const businessId = typeof data === 'string' ? data : data?.businessId;
    const token = typeof data === 'object' && data?.token ? data.token : null;
    if (!businessId) return;
    const payload = verifyBusinessToken(token);
    if (!payload || payload.sub !== businessId) {
      console.log(`Socket ${socket.id} join-business rejected: invalid or missing token`);
      return;
    }
    socket.join(`business-${businessId}`);
    console.log(`Socket ${socket.id} joined business-${businessId}`);
  });

  socket.on('join-tap-room', (code) => {
    if (code && typeof code === 'string') {
      const room = `tap-room-${code.toUpperCase()}`;
      socket.join(room);
      console.log(`Socket ${socket.id} joined ${room}`);
    }
  });

  socket.on('leave-tap-room', (code) => {
    if (code && typeof code === 'string') {
      socket.leave(`tap-room-${code.toUpperCase()}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

// Unmatched /api/* → JSON 404 (avoid sending SPA HTML for mistaken GET /api/...; clarify real 404s in DevTools)
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (res.headersSent) return next();
  res.status(404).json({
    error: 'API route not found',
    method: req.method,
    path: req.originalUrl
  });
});

// Serve React app for all other routes (avoid hard crash if dist was not built)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../client/dist/index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('[ZURI] Missing client/dist/index.html — build the client in deploy:', err.message);
      res
        .status(503)
        .type('text')
        .send('Frontend not built (client/dist missing). See Railway build logs and nixpacks.toml.');
    }
  });
});

// Start server ASAP (Railway/containers may kill apps that don't bind quickly).
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
  if (process.env.NODE_ENV === 'production' && !parseFrontendOrigins()?.length) {
    console.warn(
      'FRONTEND_URL is unset: set it to your Vercel origin(s) so browsers can call this API (CORS).'
    );
  }
});

// Initialize database in the background.
const db = require('./database');
db.init().catch((error) => {
  console.error('Failed to initialize database:', error);
});

// Handle server errors gracefully
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please free the port or use a different port.`);
    console.error('You can kill the process using:');
    console.error(`  Windows: netstat -ano | findstr :${PORT} (then taskkill /F /PID <PID>)`);
    console.error(`  Mac/Linux: lsof -ti:${PORT} | xargs kill -9`);
    process.exit(1);
  } else {
    console.error('Server error:', error);
    process.exit(1);
  }
});

module.exports = { app, io };

