const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { getBusinessPlan, canAddBusinessLogo } = require('../lib/plans');
const { signBusinessToken, requireBusinessAuth } = require('../middleware/auth');

const supabase = getDb();
const BUCKET = 'menu-items';
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Only images allowed'), ok);
  }
});

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
    const token = signBusinessToken(business.id);
    res.json({ ...businessData, token });
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
      .select('id, name, email, phone, address, created_at, plan, paystack_public_key, bank_code, bank_name, account_number, account_name, logo_url')
      .eq('id', id)
      .single();

    if (error || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY || business.paystack_public_key || null;
    const payload = {
      id: business.id,
      name: business.name,
      email: business.email,
      phone: business.phone,
      address: business.address,
      createdAt: business.created_at,
      plan: business.plan || 'free',
      paystackPublicKey,
      logoUrl: business.logo_url || null
    };
    if (business.bank_name || business.account_name) {
      payload.bankAccount = {
        bankName: business.bank_name || null,
        accountNumberMasked: business.account_number ? `****${business.account_number.slice(-4)}` : null,
        accountName: business.account_name || null
      };
    }
    res.json(payload);
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update business (bank details, logo) — requires business auth
router.patch('/:id', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.businessId) {
      return res.status(403).json({ error: 'You can only update your own business' });
    }
    const { bank_code, bank_name, account_number, account_name, logo_url, password } = req.body;
    const updates = {};
    if (bank_code !== undefined) updates.bank_code = bank_code || null;
    if (bank_name !== undefined) updates.bank_name = bank_name || null;
    if (account_number !== undefined) updates.account_number = account_number ? String(account_number).trim() : null;
    if (account_name !== undefined) updates.account_name = account_name || null;
    // Validate account number format if provided (8–16 digits)
    if (updates.account_number) {
      const digits = updates.account_number.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 16) {
        return res.status(400).json({ error: 'Account number must be 8–16 digits' });
      }
      updates.account_number = digits;
    }

    const isBankUpdate = Object.keys(updates).some(k => ['bank_code', 'bank_name', 'account_number', 'account_name'].includes(k));
    if (isBankUpdate) {
      if (!password || typeof password !== 'string' || !password.trim()) {
        return res.status(400).json({ error: 'Your Zuri business account password is required to save bank details.' });
      }
      const { data: biz } = await supabase.from('businesses').select('password').eq('id', id).single();
      if (!biz || !biz.password) {
        return res.status(500).json({ error: 'Could not verify account.' });
      }
      if (!bcrypt.compareSync(password.trim(), biz.password)) {
        return res.status(401).json({ error: 'Incorrect password. Enter your Zuri business account password.' });
      }
    }

    if (logo_url !== undefined) {
      const plan = await getBusinessPlan(id);
      if (!canAddBusinessLogo(plan)) return res.status(403).json({ error: 'Business logo is available on Starter plan and above.' });
      updates.logo_url = logo_url || null;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

    const { data, error } = await supabase.from('businesses').update(updates).eq('id', id).select('id, bank_name, bank_code, account_number, account_name, logo_url').single();
    if (error) return res.status(500).json({ error: 'Update failed' });
    res.json({
      id: data.id,
      bankAccount: data.account_number ? {
        bankName: data.bank_name,
        accountNumberMasked: `****${String(data.account_number).slice(-4)}`,
        accountName: data.account_name
      } : null,
      logoUrl: data.logo_url || null
    });
  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Change password — requires business auth
router.patch('/:id/change-password', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.businessId) {
      return res.status(403).json({ error: 'You can only change password for your own business' });
    }
    const { current_password, new_password } = req.body;
    if (!current_password || typeof current_password !== 'string' || !current_password.trim()) {
      return res.status(400).json({ error: 'Current password is required' });
    }
    if (!new_password || typeof new_password !== 'string' || !new_password.trim()) {
      return res.status(400).json({ error: 'New password is required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const { data: biz, error: fetchError } = await supabase.from('businesses').select('password').eq('id', id).single();
    if (fetchError || !biz || !biz.password) {
      return res.status(500).json({ error: 'Could not verify account.' });
    }
    if (!bcrypt.compareSync(current_password.trim(), biz.password)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(new_password.trim(), 10);
    const { error: updateError } = await supabase.from('businesses').update({ password: hashedPassword }).eq('id', id);
    if (updateError) return res.status(500).json({ error: 'Failed to update password' });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Upload business logo (Starter+) — requires business auth
router.post('/:id/upload-logo', requireBusinessAuth, logoUpload.single('logo'), async (req, res) => {
  try {
    const { id: businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only upload logo for your own business' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!canAddBusinessLogo(plan)) return res.status(403).json({ error: 'Business logo is available on Starter plan and above.' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'No image file provided' });

    const ext = path.extname(req.file.originalname) || '.jpg';
    const safeExt = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : '.jpg';
    const filePath = `business-logos/${businessId}/${uuidv4()}${safeExt}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    });
    if (uploadError) {
      console.error('Logo upload error:', uploadError);
      return res.status(500).json({ error: uploadError.message || 'Failed to upload logo' });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const { error: updateError } = await supabase.from('businesses').update({ logo_url: urlData.publicUrl }).eq('id', businessId);
    if (updateError) return res.status(500).json({ error: 'Failed to save logo' });

    res.json({ logoUrl: urlData.publicUrl });
  } catch (err) {
    if (err.message && err.message.includes('Only images')) return res.status(400).json({ error: err.message });
    console.error('Upload logo error:', err);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

module.exports = router;
