const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/dist')));

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

// Socket.io for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-business', (businessId) => {
    socket.join(`business-${businessId}`);
    console.log(`Socket ${socket.id} joined business-${businessId}`);
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
const { agentLog } = require('./debug-log');

db.init()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      agentLog({ location: 'index.js', message: 'Server started', data: { port: PORT }, hypothesisId: 'H1' });
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

