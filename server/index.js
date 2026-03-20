const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const socketCorsOrigin = process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL
  : '*';
const io = socketIo(server, {
  cors: {
    origin: socketCorsOrigin,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Webhook needs raw body for signature verification (must be before express.json())
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// CORS: in production restrict to FRONTEND_URL when set
const corsOrigin = process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL
  : undefined;
app.use(cors(corsOrigin ? { origin: corsOrigin } : {}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/dist')));

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

// Import routes
const businessRoutes = require('./routes/business');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/order');
const analyticsRoutes = require('./routes/analytics');
const qrRoutes = require('./routes/qr');
const paymentRoutes = require('./routes/payment');
const contactRoutes = require('./routes/contact');
const subscriptionRoutes = require('./routes/subscription');
const aiRoutes = require('./routes/ai');
const banksRoutes = require('./routes/banks');
const tapRoutes = require('./routes/tap');
const tapAuthRoutes = require('./routes/tap-auth');
const networkRoutes = require('./routes/network');
const reservationRoutes = require('./routes/reservations');
const reviewRoutes = require('./routes/reviews');

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

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Initialize database and start server
const db = require('./database');

db.init()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
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

