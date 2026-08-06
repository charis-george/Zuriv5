const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { JWT_SECRET } = require('./lib/jwtSecret');

const helmet = require('helmet');

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

const { isResendConfigured } = require('./lib/resendMail');
if (!isResendConfigured()) {
  console.error(
    '[ZURI] RESEND_API_KEY is not set — ticket receipts, order alerts, and password reset emails will not send.'
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

const { normalizeUuid } = require('./lib/normalizeUuid');

// Strip spaces/breaks inside UUID path params (common from wrapped share links).
function attachNormalizedUuidParam(paramName) {
  app.param(paramName, (req, res, next, value) => {
    const cleaned = normalizeUuid(value);
    if (cleaned) req.params[paramName] = cleaned;
    next();
  });
}
attachNormalizedUuidParam('businessId');
attachNormalizedUuidParam('id');

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

async function attachSocketRedisAdapter() {
  try {
    const { isRedisConfigured, getRedis } = require('./lib/redis');
    if (!isRedisConfigured()) {
      console.log('[ZURI] REDIS_URL not set — Socket.IO is single-instance (Tap state still shared via Postgres).');
      return false;
    }
    const pubClient = await getRedis();
    if (!pubClient) return false;
    const { createAdapter } = require('@socket.io/redis-adapter');
    const subClient = pubClient.duplicate();
    // ioredis duplicate() may need connect when lazy; ensure ready
    if (subClient.status !== 'ready') {
      await new Promise((resolve, reject) => {
        subClient.once('ready', resolve);
        subClient.once('error', reject);
        if (typeof subClient.connect === 'function' && subClient.status === 'wait') {
          subClient.connect().catch(reject);
        }
      });
    }
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[ZURI] Socket.IO Redis adapter attached (multi-instance Tap rooms).');
    return true;
  } catch (err) {
    console.error('[ZURI] Socket.IO Redis adapter skipped:', err?.message || err);
    return false;
  }
}

const PORT = process.env.PORT || 3000;

// Webhook needs raw body for signature verification (must be before express.json())
const webhookRawParser = express.raw({ type: () => true, limit: '2mb' });
app.use('/api/payment/webhook', webhookRawParser);
app.use('/api/payment/monnify-webhook', webhookRawParser);

// CORS: in production, allow FRONTEND_URL (comma-separated for prod + Vercel previews)
app.use(cors(corsOriginOption ? { origin: corsOriginOption } : {}));
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Soft-normalize businessId from body/query (path params handled via app.param above).
app.use((req, _res, next) => {
  if (req.body && typeof req.body.businessId === 'string') {
    const cleaned = normalizeUuid(req.body.businessId);
    if (cleaned) req.body.businessId = cleaned;
  }
  if (req.query && typeof req.query.businessId === 'string') {
    const cleaned = normalizeUuid(req.query.businessId);
    if (cleaned) req.query.businessId = cleaned;
  }
  next();
});

app.use(express.static(path.join(__dirname, '../client/dist')));

if (!SUPABASE_ENV_OK) {
  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path.endsWith('/payment/webhook') || req.path.endsWith('/payment/monnify-webhook')) {
      return next();
    }
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
  skip: (req) => {
    const path = (req.originalUrl || req.url || '').split('?')[0];
    return path.endsWith('/api/payment/webhook') || path.endsWith('/api/payment/monnify-webhook');
  },
  message: { error: 'Too many payment requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/business', authLimiter);
app.use('/api/payment', paymentLimiter);
app.use('/api/tap-auth', authLimiter);
const tapChargeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many Tap payment attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/tap/charge-with-password', tapChargeLimiter);
app.use('/api/tap/send', tapChargeLimiter);
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many contact requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
const banksLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many bank lookup requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/contact', contactLimiter);
app.use('/api/banks', banksLimiter);
const agentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  skip: (req) => {
    const path = (req.originalUrl || req.url || '').split('?')[0];
    // Inbound SMS webhook gets a separate, slightly higher ceiling below.
    return path.endsWith('/api/agent/sms/inbound');
  },
  message: { error: 'Too many Assist requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
const agentInboundLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many inbound SMS requests.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/agent/sms/inbound', agentInboundLimiter);
app.use('/api/agent', agentLimiter);

// When Supabase origin is timing out (Cloudflare 522), fail fast so payment
// traffic is not buried under hanging DB fetches and HTML error log floods.
const {
  isSupabaseCircuitOpen,
  circuitErrorResponse,
  getCircuitStatus,
  summarizeUpstreamError
} = require('./lib/supabaseResilience');

app.use('/api', (req, res, next) => {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (path === '/api/health' || path.endsWith('/health')) return next();
  // Always accept provider webhooks — they must land; fetch layer still fail-fasts.
  if (path.endsWith('/payment/webhook') || path.endsWith('/payment/monnify-webhook')) {
    return next();
  }
  if (!isSupabaseCircuitOpen()) return next();

  const body = circuitErrorResponse();
  const retrySec = Math.max(1, Math.ceil((body.retry_after_ms || 120000) / 1000));
  res.set('Retry-After', String(retrySec));
  return res.status(503).json(body);
});

const routeLoadErrors = {};

function safeRequireRoute(label, modulePath) {
  try {
    const router = require(modulePath);
    delete routeLoadErrors[label];
    return router;
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    const stack = e && e.stack ? e.stack : undefined;
    routeLoadErrors[label] = message;
    console.error(`[ZURI] Route module failed to load: ${label}`, {
      modulePath,
      message,
      stack
    });
    const router = express.Router();
    router.use((_req, res) => {
      res.status(503).json({
        error: `Route temporarily unavailable: ${label}`,
        detail: message,
        hint:
          /Missing Supabase env/i.test(message)
            ? 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server, then redeploy/restart.'
            : 'Check Railway/deploy logs for the full stack trace, fix the error, and restart the API.'
      });
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
const adminRoutes = safeRequireRoute('admin', './routes/admin');
const agentRoutes = safeRequireRoute('agent', './routes/agent');

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
app.use('/api/agent', agentRoutes);
app.use('/api/tap', tapRoutes);
app.use('/api/tap-auth', tapAuthRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);

// Uptime / CORS check (register before SPA fallback)
// Liveness only — never fail health because Supabase circuit is open.
// Railway/deploy health checks that kill on ok:false caused restart death spirals
// during brief PostgREST cold-starts after project upgrades.
app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const jwtOk = process.env.NODE_ENV !== 'production' || Boolean(JWT_SECRET);
  const circuit = getCircuitStatus();
  const routesOk = Object.keys(routeLoadErrors).length === 0;
  const envOk = SUPABASE_ENV_OK && jwtOk;
  const processHealthy = routesOk && envOk;
  res.status(processHealthy ? 200 : 503).json({
    ok: processHealthy,
    degraded: circuit.state !== 'closed',
    uptime: process.uptime(),
    supabaseEnv: SUPABASE_ENV_OK,
    supabaseCircuit: circuit,
    publicReadCache: (() => {
      try {
        return require('./lib/publicReadCache').getPublicCacheStats();
      } catch {
        return undefined;
      }
    })(),
    jwtConfigured: jwtOk,
    redisConfigured: Boolean(process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL),
    routeLoadErrors: Object.keys(routeLoadErrors).length ? routeLoadErrors : undefined
  });
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

  socket.on('join-tap-room', async (code) => {
    if (!code || typeof code !== 'string') {
      socket.emit('tap-room-error', { error: 'Enter a valid Tap code' });
      return;
    }
    try {
      const { getActiveStaffByCode } = require('./lib/tapRooms');
      const active = await getActiveStaffByCode(code);
      if (!active) {
        socket.emit('tap-room-error', { error: 'Invalid or expired Tap code' });
        return;
      }
      const room = `tap-room-${active.code}`;
      socket.join(room);
      socket.data.tapStaffCode = active.code;
      socket.data.tapStaffCodeId = active.id;
      socket.emit('tap-room-joined', {
        code: active.code,
        staffLabel: active.label,
        expiresAt: active.expiresAt
      });
      console.log(`Socket ${socket.id} joined ${room} (${active.label})`);
    } catch (err) {
      console.error('join-tap-room error:', err?.message || err);
      socket.emit('tap-room-error', { error: 'Could not join Tap room' });
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

const { serveStorefrontHtml } = require('./lib/storefrontSeo');

// Storefront links need server-rendered Open Graph tags for WhatsApp, Snapchat, etc.
app.get('/order/:businessId', async (req, res, next) => {
  const served = await serveStorefrontHtml(req, res);
  if (!served) next();
});

app.get('/order/:businessId/:storefrontSlug', async (req, res, next) => {
  const served = await serveStorefrontHtml(req, res);
  if (!served) next();
});

app.get('/event/:businessId/:eventSlug', async (req, res, next) => {
  const served = await serveStorefrontHtml(req, res);
  if (!served) next();
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

// Start server ASAP (Railway/containers may kill apps that don't bind PORT quickly).
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ZURI] Server listening on 0.0.0.0:${PORT}`);
  if (process.env.NODE_ENV === 'production' && !parseFrontendOrigins()?.length) {
    console.warn(
      'FRONTEND_URL is unset: set it to your Vercel origin(s) so browsers can call this API (CORS).'
    );
  }
  attachSocketRedisAdapter().catch((err) => {
    console.error('[ZURI] Redis adapter init failed:', err?.message || err);
  });
});

// Initialize database in the background.
const db = require('./database');
db.init().catch((error) => {
  console.error('Failed to initialize database:', error);
});

// Subscription renewal reminders (Paystack invoice.create + Monnify prepaid scan).
const REMINDER_INTERVAL_MS = Math.max(
  3_600_000,
  Number(process.env.SUBSCRIPTION_REMINDER_INTERVAL_MS) || 6 * 3_600_000
);
function scheduleSubscriptionRenewalReminders() {
  if (process.env.SUBSCRIPTION_REMINDERS_ENABLED === 'false') return;
  const run = () => {
    try {
      const { isSupabaseCircuitOpen } = require('./lib/supabaseResilience');
      if (isSupabaseCircuitOpen()) {
        console.warn('[ZURI] Subscription reminder scan skipped — Supabase circuit open');
        return;
      }
      const { processUpcomingRenewalReminders } = require('./lib/paystack-subscription');
      processUpcomingRenewalReminders().catch((err) =>
        console.error('[ZURI] Subscription reminder scan error:', summarizeUpstreamError(err))
      );
    } catch (err) {
      console.error('[ZURI] Subscription reminder module error:', err);
    }
  };
  setTimeout(run, 30_000);
  setInterval(run, REMINDER_INTERVAL_MS);
}
scheduleSubscriptionRenewalReminders();

// Survival: sweep is recovery-only; prefer longer interval on free-tier compute.
const RECEIPT_SWEEP_INTERVAL_MS = Math.max(
  30_000,
  Number(process.env.ORDER_RECEIPT_SWEEP_INTERVAL_MS) || 90_000
);
function scheduleOrderReceiptSweep() {
  if (process.env.ORDER_RECEIPT_SWEEP_ENABLED === 'false') return;
  const run = () => {
    try {
      const { isSupabaseCircuitOpen, summarizeUpstreamError } = require('./lib/supabaseResilience');
      if (isSupabaseCircuitOpen()) {
        console.warn('[ZURI] Receipt sweep skipped — Supabase circuit open');
        return;
      }
      const { sweepPendingOrderReceipts } = require('./lib/orderReceiptSweep');
      sweepPendingOrderReceipts().catch((err) =>
        console.error('[ZURI] Receipt sweep error:', summarizeUpstreamError(err))
      );
    } catch (err) {
      console.error('[ZURI] Receipt sweep module error:', err);
    }
  };
  // First pass quickly after boot so deploy restarts do not strand paid tickets.
  // Sweep is a safety net only — primary delivery is immediate enqueue on pay.
  setTimeout(run, 5_000);
  setInterval(run, RECEIPT_SWEEP_INTERVAL_MS);
}
scheduleOrderReceiptSweep();

try {
  const { scheduleKeepAlive } = require('./lib/keepAlive');
  scheduleKeepAlive();
} catch (err) {
  console.warn('[ZURI] Keep-alive not started:', err?.message || err);
}

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[ZURI] ${signal} received — draining receipt queue before exit`);

  try {
    const { drainOrderReceiptQueueForShutdown } = require('./lib/orderReceiptQueue');
    await drainOrderReceiptQueueForShutdown(
      Math.max(5_000, Number(process.env.ORDER_RECEIPT_SHUTDOWN_DRAIN_MS) || 25_000)
    );
  } catch (err) {
    console.error('[ZURI] Receipt queue drain error:', err?.message || err);
  }

  server.close(() => {
    console.log('[ZURI] HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[ZURI] Forced exit after shutdown timeout');
    process.exit(1);
  }, 20_000).unref();
}

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
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

