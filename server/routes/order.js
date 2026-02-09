const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');

const db = getDb();

// Create order
router.post('/', (req, res) => {
  const { businessId, customerName, customerPhone, customerEmail, items, estimatedPrepTime } = req.body;

  if (!businessId || !items || items.length === 0) {
    return res.status(400).json({ error: 'Business ID and items are required' });
  }

  const orderId = uuidv4();
  let totalAmount = 0;

  // Calculate total
  items.forEach(item => {
    totalAmount += item.price * item.quantity;
  });

  db.serialize(() => {
    // Insert order
    db.run(
      `INSERT INTO orders (id, businessId, customerName, customerPhone, customerEmail, totalAmount, estimatedPrepTime)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orderId, businessId, customerName || null, customerPhone || null, customerEmail || null, totalAmount, estimatedPrepTime || 15],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to create order' });
        }

        // Insert order items
        const stmt = db.prepare(
          `INSERT INTO order_items (id, orderId, menuItemId, quantity, price, specialNotes)
           VALUES (?, ?, ?, ?, ?, ?)`
        );

        items.forEach(item => {
          const itemId = uuidv4();
          stmt.run(itemId, orderId, item.menuItemId, item.quantity, item.price, item.specialNotes || null);
        });

        stmt.finalize((err) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to create order items' });
          }

          // Get full order details
          db.get(
            `SELECT * FROM orders WHERE id = ?`,
            [orderId],
            (err, order) => {
              if (err) {
                return res.status(500).json({ error: 'Failed to retrieve order' });
              }

              // Emit real-time notification to business
              const io = req.app.get('io');
              if (io) {
                io.to(`business-${businessId}`).emit('new-order', order);
              }

              res.json(order);
            }
          );
        });
      }
    );
  });
});

// Get orders for a business
router.get('/business/:businessId', (req, res) => {
  const { businessId } = req.params;
  const { status, limit = 50 } = req.query;

  let query = `
    SELECT o.*, 
           GROUP_CONCAT(oi.menuItemId || ':' || oi.quantity || ':' || oi.price || ':' || COALESCE(oi.specialNotes, '')) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.orderId
    WHERE o.businessId = ?
  `;
  const params = [businessId];

  if (status) {
    query += ' AND o.status = ?';
    params.push(status);
  }

  query += ' GROUP BY o.id ORDER BY o.createdAt DESC LIMIT ?';
  params.push(parseInt(limit));

  db.all(query, params, (err, orders) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Parse items and get menu item names
    const ordersWithItems = orders.map(order => {
      const items = order.items ? order.items.split(',').map(item => {
        const [menuItemId, quantity, price, specialNotes] = item.split(':');
        return { menuItemId, quantity: parseInt(quantity), price: parseFloat(price), specialNotes };
      }) : [];
      return { ...order, items };
    });

    // Get menu item names for each order
    const promises = ordersWithItems.map(order => {
      return new Promise((resolve) => {
        if (!order.items || order.items.length === 0) {
          resolve(order);
          return;
        }
        const itemIds = order.items.map(item => item.menuItemId);
        const placeholders = itemIds.map(() => '?').join(',');
        db.all(
          `SELECT id, name FROM menu_items WHERE id IN (${placeholders})`,
          itemIds,
          (err, menuItems) => {
            if (err) {
              resolve(order);
              return;
            }
            const menuItemMap = {};
            menuItems.forEach(item => {
              menuItemMap[item.id] = item.name;
            });
            order.items = order.items.map(item => ({
              ...item,
              menuItemName: menuItemMap[item.menuItemId] || 'Unknown Item'
            }));
            resolve(order);
          }
        );
      });
    });

    Promise.all(promises).then(results => {
      res.json(results);
    });
  });
});

// Get order details
router.get('/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    db.all(
      `SELECT oi.*, m.name as menuItemName
       FROM order_items oi
       LEFT JOIN menu_items m ON oi.menuItemId = m.id
       WHERE oi.orderId = ?`,
      [id],
      (err, items) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ ...order, items });
      }
    );
  });
});

// Update order status
router.patch('/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'preparing', 'ready', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const updateFields = ['status = ?'];
  const values = [status];

  if (status === 'completed') {
    updateFields.push('completedAt = CURRENT_TIMESTAMP');
  }

  db.run(
    `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
    [...values, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update order' });
      }

      // Get updated order
      db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        // Emit real-time update
        const io = req.app.get('io');
        if (io && order) {
          io.to(`business-${order.businessId}`).emit('order-updated', order);
        }

        res.json(order);
      });
    }
  );
});

module.exports = router;
