const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');

const db = getDb();

// Get menu for a business
router.get('/business/:businessId', (req, res) => {
  const { businessId } = req.params;

  db.all(
    `SELECT c.id as categoryId, c.name as categoryName, c.displayOrder as categoryOrder,
            m.id, m.name, m.description, m.price, m.cost, m.imageUrl, m.available, m.displayOrder
     FROM menu_items m
     LEFT JOIN categories c ON m.categoryId = c.id
     WHERE m.businessId = ?
     ORDER BY c.displayOrder, m.displayOrder`,
    [businessId],
    (err, items) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      // Group items by category
      const menu = {};
      items.forEach(item => {
        const catId = item.categoryId || 'uncategorized';
        const catName = item.categoryName || 'Other';
        
        if (!menu[catId]) {
          menu[catId] = {
            id: catId,
            name: catName,
            items: []
          };
        }
        
        menu[catId].items.push({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          cost: item.cost,
          imageUrl: item.imageUrl,
          available: item.available === 1
        });
      });

      res.json(Object.values(menu));
    }
  );
});

// Get all categories for a business
router.get('/categories/:businessId', (req, res) => {
  const { businessId } = req.params;

  db.all(
    'SELECT id, name, displayOrder FROM categories WHERE businessId = ? ORDER BY displayOrder',
    [businessId],
    (err, categories) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(categories);
    }
  );
});

// Create category
router.post('/category', (req, res) => {
  const { businessId, name, displayOrder } = req.body;
  const categoryId = uuidv4();

  db.run(
    'INSERT INTO categories (id, businessId, name, displayOrder) VALUES (?, ?, ?, ?)',
    [categoryId, businessId, name, displayOrder || 0],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create category' });
      }
      res.json({ id: categoryId, businessId, name, displayOrder: displayOrder || 0 });
    }
  );
});

// Create menu item
router.post('/item', (req, res) => {
  const { businessId, categoryId, name, description, price, cost, imageUrl, displayOrder } = req.body;
  const itemId = uuidv4();

  db.run(
    `INSERT INTO menu_items (id, businessId, categoryId, name, description, price, cost, imageUrl, displayOrder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [itemId, businessId, categoryId || null, name, description || null, price, cost || 0, imageUrl || null, displayOrder || 0],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create menu item' });
      }
      res.json({ 
        id: itemId, 
        businessId, 
        categoryId, 
        name, 
        description, 
        price, 
        cost, 
        imageUrl,
        displayOrder 
      });
    }
  );
});

// Update menu item
router.put('/item/:id', (req, res) => {
  const { id } = req.params;
  const { name, description, price, cost, imageUrl, available, displayOrder, categoryId } = req.body;

  const updates = [];
  const values = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (price !== undefined) { updates.push('price = ?'); values.push(price); }
  if (cost !== undefined) { updates.push('cost = ?'); values.push(cost); }
  if (imageUrl !== undefined) { updates.push('imageUrl = ?'); values.push(imageUrl); }
  if (available !== undefined) { updates.push('available = ?'); values.push(available ? 1 : 0); }
  if (displayOrder !== undefined) { updates.push('displayOrder = ?'); values.push(displayOrder); }
  if (categoryId !== undefined) { updates.push('categoryId = ?'); values.push(categoryId || null); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(id);

  db.run(
    `UPDATE menu_items SET ${updates.join(', ')} WHERE id = ?`,
    values,
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update menu item' });
      }
      res.json({ message: 'Menu item updated successfully' });
    }
  );
});

// Delete menu item
router.delete('/item/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM menu_items WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete menu item' });
    }
    res.json({ message: 'Menu item deleted successfully' });
  });
});

module.exports = router;
