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

// Routes
app.use('/business', businessRoutes);
app.use('/menu', menuRoutes);
app.use('/order', orderRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/qr', qrRoutes);
app.use('/payment', paymentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel' : 'local'
  });
});

// Export for Vercel
module.exports = app;

