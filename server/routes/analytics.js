const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

const db = getDb();

// Get sales summary
router.get('/sales/:businessId', (req, res) => {
  const { businessId } = req.params;
  const { period = 'day' } = req.query; // day, week, month

  let dateFilter = '';
  if (period === 'day') {
    dateFilter = "DATE(createdAt) = DATE('now')";
  } else if (period === 'week') {
    dateFilter = "DATE(createdAt) >= DATE('now', '-7 days')";
  } else if (period === 'month') {
    dateFilter = "DATE(createdAt) >= DATE('now', '-30 days')";
  }

  db.all(
    `SELECT 
      COUNT(*) as totalOrders,
      SUM(totalAmount) as totalRevenue,
      AVG(totalAmount) as averageOrderValue,
      SUM(CASE WHEN status = 'completed' THEN totalAmount ELSE 0 END) as completedRevenue
     FROM orders
     WHERE businessId = ? AND ${dateFilter}`,
    [businessId],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(result[0] || { totalOrders: 0, totalRevenue: 0, averageOrderValue: 0, completedRevenue: 0 });
    }
  );
});

// Get sales by date
router.get('/sales-by-date/:businessId', (req, res) => {
  const { businessId } = req.params;
  const { days = 30 } = req.query;

  db.all(
    `SELECT 
      DATE(createdAt) as date,
      COUNT(*) as orderCount,
      SUM(totalAmount) as revenue,
      SUM(CASE WHEN status = 'completed' THEN totalAmount ELSE 0 END) as completedRevenue
     FROM orders
     WHERE businessId = ? AND DATE(createdAt) >= DATE('now', '-${days} days')
     GROUP BY DATE(createdAt)
     ORDER BY date DESC`,
    [businessId],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(results);
    }
  );
});

// Get most ordered items
router.get('/popular-items/:businessId', (req, res) => {
  const { businessId } = req.params;
  const { limit = 10, days = 30 } = req.query;

  db.all(
    `SELECT 
      m.id,
      m.name,
      m.price,
      SUM(oi.quantity) as totalQuantity,
      SUM(oi.quantity * oi.price) as totalRevenue,
      COUNT(DISTINCT oi.orderId) as orderCount
     FROM order_items oi
     JOIN menu_items m ON oi.menuItemId = m.id
     JOIN orders o ON oi.orderId = o.id
     WHERE m.businessId = ? AND DATE(o.createdAt) >= DATE('now', '-${days} days')
     GROUP BY m.id, m.name, m.price
     ORDER BY totalQuantity DESC
     LIMIT ?`,
    [businessId, parseInt(limit)],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(results);
    }
  );
});

// Get peak hours
router.get('/peak-hours/:businessId', (req, res) => {
  const { businessId } = req.params;
  const { days = 30 } = req.query;

  db.all(
    `SELECT 
      strftime('%H', createdAt) as hour,
      COUNT(*) as orderCount,
      SUM(totalAmount) as revenue
     FROM orders
     WHERE businessId = ? AND DATE(createdAt) >= DATE('now', '-${days} days')
     GROUP BY strftime('%H', createdAt)
     ORDER BY hour`,
    [businessId],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(results);
    }
  );
});

// Get profit margins
router.get('/profit-margins/:businessId', (req, res) => {
  const { businessId } = req.params;
  const { days = 30 } = req.query;

  db.all(
    `SELECT 
      m.id,
      m.name,
      m.price,
      m.cost,
      SUM(oi.quantity) as totalQuantity,
      SUM(oi.quantity * oi.price) as totalRevenue,
      SUM(oi.quantity * COALESCE(m.cost, 0)) as totalCost,
      SUM(oi.quantity * oi.price) - SUM(oi.quantity * COALESCE(m.cost, 0)) as profit,
      CASE 
        WHEN SUM(oi.quantity * oi.price) > 0 
        THEN ((SUM(oi.quantity * oi.price) - SUM(oi.quantity * COALESCE(m.cost, 0))) / SUM(oi.quantity * oi.price)) * 100
        ELSE 0
      END as marginPercentage
     FROM order_items oi
     JOIN menu_items m ON oi.menuItemId = m.id
     JOIN orders o ON oi.orderId = o.id
     WHERE m.businessId = ? AND DATE(o.createdAt) >= DATE('now', '-${days} days')
     GROUP BY m.id, m.name, m.price, m.cost
     ORDER BY profit DESC`,
    [businessId],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(results);
    }
  );
});

module.exports = router;
