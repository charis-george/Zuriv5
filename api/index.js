// Vercel serverless function entry point
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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

// Import routes
const businessRoutes = require('../server/routes/business');
const menuRoutes = require('../server/routes/menu');
const orderRoutes = require('../server/routes/order');
const analyticsRoutes = require('../server/routes/analytics');
const qrRoutes = require('../server/routes/qr');
const paymentRoutes = require('../server/routes/payment');
const contactRoutes = require('../server/routes/contact');
const subscriptionRoutes = require('../server/routes/subscription');
const aiRoutes = require('../server/routes/ai');
const banksRoutes = require('../server/routes/banks');
const tapRoutes = require('../server/routes/tap');
const tapAuthRoutes = require('../server/routes/tap-auth');

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
app.use('/api/tap', tapRoutes);
app.use('/api/tap-auth', tapAuthRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel' : 'local'
  });
});

// Export for Vercel
module.exports = app;

