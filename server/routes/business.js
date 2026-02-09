const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');

const supabase = getDb();

// Register business
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if email already exists
    const { data: existingBusiness } = await supabase
      .from('businesses')
      .select('id')
      .eq('email', email)
      .single();

    if (existingBusiness) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const businessId = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Create business
    const { data, error } = await supabase
      .from('businesses')
      .insert({
        id: businessId,
        name,
        email,
        password: hashedPassword,
        phone: phone || null,
        address: address || null
      })
      .select()
      .single();

    if (error) {
      console.error('Registration error:', error);
      return res.status(500).json({ error: 'Failed to register business' });
    }

    res.json({
      id: data.id,
      name: data.name,
      email: data.email,
      message: 'Business registered successfully'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register business' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get business by email
    const { data: business, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !business) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    if (!bcrypt.compareSync(password, business.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Remove password from response
    const { password: _, ...businessData } = business;
    res.json(businessData);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get business by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: business, error } = await supabase
      .from('businesses')
      .select('id, name, email, phone, address, created_at')
      .eq('id', id)
      .single();

    if (error || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json({
      id: business.id,
      name: business.name,
      email: business.email,
      phone: business.phone,
      address: business.address,
      createdAt: business.created_at
    });
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
