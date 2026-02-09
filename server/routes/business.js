const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');

const db = getDb();

// Register business
router.post('/register', (req, res) => {
  const { name, email, password, phone, address } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const businessId = uuidv4();

  db.run(
    `INSERT INTO businesses (id, name, email, password, phone, address) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [businessId, name, email, hashedPassword, phone || null, address || null],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'Email already registered' });
        }
        return res.status(500).json({ error: 'Failed to register business' });
      }
      res.json({ 
        id: businessId, 
        name, 
        email, 
        message: 'Business registered successfully' 
      });
    }
  );
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get(
    'SELECT * FROM businesses WHERE email = ?',
    [email],
    (err, business) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!business) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!bcrypt.compareSync(password, business.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Remove password from response
      const { password: _, ...businessData } = business;
      res.json(businessData);
    }
  );
});

// Get business by ID
router.get('/:id', (req, res) => {
  const { id } = req.params;

  db.get(
    'SELECT id, name, email, phone, address, createdAt FROM businesses WHERE id = ?',
    [id],
    (err, business) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }
      res.json(business);
    }
  );
});

module.exports = router;
