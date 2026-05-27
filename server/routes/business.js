const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { getBusinessPlan, canAddBusinessLogo } = require('../lib/plans');
const { signBusinessToken, requireBusinessAuth } = require('../middleware/auth');
const { getTransporter, sendMailWithTimeout } = require('../lib/email');
const { queueBusinessWelcomeEmail } = require('../lib/welcomeEmail');

const supabase = getDb();

const RESEND_FROM =
  process.env.RESEND_FROM || process.env.SMTP_FROM || 'ZURI <onboarding@resend.dev>';

function getResendApiKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key || typeof key !== 'string' || !key.trim()) return null;
  return key.trim();
}

async function sendViaResendApi(apiKey, payload, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const err = new Error(
        `Resend API ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`
      );
      err.code = `RESEND_HTTP_${response.status}`;
      throw err;
    }
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBusinessEmail(email) {
  if (email == null || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function isGrowthPlus(plan) {
  return (
    plan === 'growth' ||
    plan === 'scale' ||
    plan === 'pro' ||
    plan === 'zuri_plus' ||
    plan === 'enterprise' ||
    plan === 'basic' ||
    plan === 'advanced'
  );
}

// In-memory store for password reset tokens (use DB + email in production)
const businessResetTokens = new Map();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function purgeExpiredBusinessTokens() {
  const now = Date.now();
  for (const [token, data] of businessResetTokens.entries()) {
    if (data.expiresAt < now) businessResetTokens.delete(token);
  }
}
const BUCKET = 'menu-items';
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Only images allowed'), ok);
  }
});

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Only images allowed'), ok);
  }
});

// Register business
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, address, businessMode } = req.body;
    const normalizedBusinessMode = businessMode === 'ticketing' ? 'ticketing' : 'menu';


    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const emailNorm = normalizeBusinessEmail(email);
    if (!emailNorm) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    // Check if email already exists
    const { data: existingBusiness } = await supabase
      .from('businesses')
      .select('id')
      .eq('email', emailNorm)
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
        email: emailNorm,
        password: hashedPassword,
        phone: phone || null,
        address: address || null,
        business_mode: normalizedBusinessMode
      })
      .select()
      .single();

    if (error) {
      console.error('Registration error:', error);
      return res.status(500).json({ error: 'Failed to register business' });
    }

    queueBusinessWelcomeEmail({ email: data.email, name: data.name });

    res.json({
      id: data.id,
      name: data.name,
      email: data.email,
      businessMode: data.business_mode || 'menu',
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

    const emailNorm = normalizeBusinessEmail(email);
    if (!emailNorm) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    // Get business by email
    const { data: business, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('email', emailNorm)
      .single();

    if (error || !business) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const storedHash = business.password;
    if (storedHash == null || typeof storedHash !== 'string' || !storedHash.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    let passwordOk = false;
    try {
      passwordOk = bcrypt.compareSync(String(password), storedHash);
    } catch {
      passwordOk = false;
    }
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Remove password from response; expose camelCase for clients
    const { password: _, business_mode, ...businessData } = business;
    const token = signBusinessToken(business.id);
    res.json({ ...businessData, businessMode: business_mode || 'menu', token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Forgot password — request reset link (in production, send link by email)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const toEmail = email.trim().toLowerCase();

    const { data: business, error } = await supabase
      .from('businesses')
      .select('id')
      .eq('email', toEmail)
      .single();

    if (error || !business) {
      return res.json({ success: true, message: 'If an account exists with this email, you will receive reset instructions.' });
    }

    purgeExpiredBusinessTokens();
    const token = crypto.randomBytes(32).toString('hex');
    businessResetTokens.set(token, { businessId: business.id, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });

    const baseUrl = req.get('origin') || process.env.BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${baseUrl}/business/reset-password?token=${token}`;

    const subject = 'Reset your ZURI business password';
    const text = `You requested a password reset for your ZURI business account. Click the link below to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`;
    const html = `<p>You requested a password reset for your ZURI business account.</p><p><a href="${resetLink}">Set a new password</a> (link valid for 1 hour).</p><p>If you didn't request this, you can ignore this email.</p>`;

    // Best-effort: send email async; never block the HTTP response.
    setImmediate(() => {
      const resendApiKey = getResendApiKey();
      if (resendApiKey) {
        sendViaResendApi(
          resendApiKey,
          { from: RESEND_FROM, to: [toEmail], subject, text, html },
          8000
        ).catch((err) => console.error('Password reset email error (resend):', err));
        return;
      }

      const transporter = getTransporter();
      if (!transporter) {
        console.warn('[ZURI] Password reset email skipped: set RESEND_API_KEY or SMTP_* env vars.');
        return;
      }

      sendMailWithTimeout(
        transporter,
        {
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: toEmail,
          subject,
          text,
          html
        },
        8000
      ).catch((err) => console.error('Password reset email error (smtp):', err));
    });

    return res.json({ success: true, message: 'If an account exists with this email, you will receive reset instructions.' });

    // No SMTP configured: return reset link for dev/testing only (do not expose in production)
    if (process.env.NODE_ENV !== 'production') {
      return res.json({ success: true, message: 'If an account exists with this email, you will receive reset instructions.', resetLink });
    }
    res.json({ success: true, message: 'If an account exists with this email, you will receive reset instructions.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Reset password — with token from forgot-password flow
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'Reset token is required' });
    }
    if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
      return res.status(400).json({ error: 'New password is required' });
    }
    if (newPassword.trim().length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const data = businessResetTokens.get(token.trim());
    if (!data || data.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword.trim(), 10);
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ password: hashedPassword })
      .eq('id', data.businessId);
    if (updateError) return res.status(500).json({ error: 'Failed to update password' });

    businessResetTokens.delete(token.trim());
    res.json({ success: true, message: 'Password updated. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Get business by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: business, error } = await supabase
      .from('businesses')
      .select('id, name, email, phone, address, created_at, plan, paystack_public_key, bank_code, bank_name, account_number, account_name, logo_url, storefront_config, storefront_details, business_mode, storefront_ai_generations, business_group_id')
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
      logoUrl: business.logo_url || null,
      storefrontConfig: business.storefront_config || null,
      storefrontDetails: business.storefront_details || null,
      businessMode: business.business_mode || 'menu',
      storefrontAiGenerations: Number(business.storefront_ai_generations || 0),
      businessGroupId: business.business_group_id || null
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
    const { bank_code, bank_name, account_number, account_name, logo_url, password, name, businessMode, businessGroupId } = req.body;
    const updates = {};
    if (name !== undefined) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed) return res.status(400).json({ error: 'Business name cannot be empty' });
      if (trimmed.length > 80) return res.status(400).json({ error: 'Business name is too long' });
      updates.name = trimmed;
    }
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
    if (businessMode !== undefined) {
      if (businessMode !== 'menu' && businessMode !== 'ticketing') {
        return res.status(400).json({ error: 'Invalid business mode' });
      }
      updates.business_mode = businessMode;
    }
    if (businessGroupId !== undefined) {
      const v = businessGroupId && String(businessGroupId).trim() ? String(businessGroupId).trim().slice(0, 80) : null;
      updates.business_group_id = v;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

    const { data, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', id)
      .select('id, name, bank_name, bank_code, account_number, account_name, logo_url, business_mode, business_group_id')
      .single();
    if (error) return res.status(500).json({ error: 'Update failed' });
    try {
      const io = req.app && req.app.get ? req.app.get('io') : null;
      if (io && updates.business_mode !== undefined) {
        io.to(`storefront-${id}`).emit('storefront-updated', {
          businessId: id,
          businessMode: data.business_mode || 'menu'
        });
      }
    } catch (e) {
      console.error('Storefront businessMode broadcast error:', e);
    }
    res.json({
      id: data.id,
      name: data.name,
      bankAccount: data.account_number ? {
        bankName: data.bank_name,
        accountNumberMasked: `****${String(data.account_number).slice(-4)}`,
        accountName: data.account_name
      } : null,
      logoUrl: data.logo_url || null,
      businessMode: data.business_mode || 'menu',
      businessGroupId: data.business_group_id || null
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

// Upload storefront hero banner (Growth+) — merges `heroBannerUrl` into storefront_config
router.post(
  '/:id/upload-storefront-banner',
  requireBusinessAuth,
  bannerUpload.single('banner'),
  async (req, res) => {
    try {
      const { id: businessId } = req.params;
      if (businessId !== req.businessId) {
        return res.status(403).json({ error: 'You can only update your own business' });
      }
      const plan = await getBusinessPlan(businessId);
      if (!isGrowthPlus(plan)) {
        return res.status(403).json({ error: 'Hero banner is available on Growth plan and above.' });
      }
      if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'No image file provided' });

      const ext = path.extname(req.file.originalname) || '.jpg';
      const safeExt = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : '.jpg';
      const filePath = `storefront-banners/${businessId}/${uuidv4()}${safeExt}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });
      if (uploadError) {
        console.error('Banner upload error:', uploadError);
        return res.status(500).json({ error: uploadError.message || 'Failed to upload banner' });
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
      const bannerUrl = urlData.publicUrl;

      const { data: row, error: fetchErr } = await supabase
        .from('businesses')
        .select('storefront_config')
        .eq('id', businessId)
        .single();
      if (fetchErr || !row) return res.status(500).json({ error: 'Could not load storefront settings' });

      const prevCfg = row.storefront_config && typeof row.storefront_config === 'object' ? row.storefront_config : {};
      const nextCfg = { ...prevCfg, heroBannerUrl: bannerUrl };

      const { data: updated, error: updateError } = await supabase
        .from('businesses')
        .update({ storefront_config: nextCfg })
        .eq('id', businessId)
        .select('storefront_config')
        .single();
      if (updateError) return res.status(500).json({ error: 'Failed to save banner' });

      try {
        const io = req.app && req.app.get ? req.app.get('io') : null;
        if (io) {
          io.to(`storefront-${businessId}`).emit('storefront-updated', {
            businessId,
            config: updated.storefront_config || null
          });
        }
      } catch (e) {
        console.error('Storefront socket broadcast error:', e);
      }

      res.json({ heroBannerUrl: bannerUrl, storefrontConfig: updated.storefront_config || nextCfg });
    } catch (err) {
      if (err.message && err.message.includes('Only images')) return res.status(400).json({ error: err.message });
      console.error('Upload storefront banner error:', err);
      res.status(500).json({ error: 'Failed to upload banner' });
    }
  }
);

router.delete('/:id/storefront-banner', requireBusinessAuth, async (req, res) => {
  try {
    const { id: businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only update your own business' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!isGrowthPlus(plan)) {
      return res.status(403).json({ error: 'Hero banner is available on Growth plan and above.' });
    }

    const { data: row, error: fetchErr } = await supabase
      .from('businesses')
      .select('storefront_config')
      .eq('id', businessId)
      .single();
    if (fetchErr || !row) return res.status(404).json({ error: 'Business not found' });

    const prevCfg = row.storefront_config && typeof row.storefront_config === 'object' ? { ...row.storefront_config } : {};
    delete prevCfg.heroBannerUrl;

    const { data: updated, error: updateError } = await supabase
      .from('businesses')
      .update({ storefront_config: prevCfg })
      .eq('id', businessId)
      .select('storefront_config')
      .single();
    if (updateError) return res.status(500).json({ error: 'Failed to remove banner' });

    try {
      const io = req.app && req.app.get ? req.app.get('io') : null;
      if (io) {
        io.to(`storefront-${businessId}`).emit('storefront-updated', {
          businessId,
          config: updated.storefront_config || null
        });
      }
    } catch (e) {
      console.error('Storefront socket broadcast error:', e);
    }

    res.json({ success: true, storefrontConfig: updated.storefront_config || prevCfg });
  } catch (err) {
    console.error('Remove storefront banner error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Storefront customizer (Growth+) — save published storefront config/details
router.patch('/:id/storefront', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.businessId) {
      return res.status(403).json({ error: 'You can only update your own business' });
    }

    const { config, details } = req.body || {};
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'config is required' });
    }
    if (!details || typeof details !== 'object') {
      return res.status(400).json({ error: 'details is required' });
    }

    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('id, plan')
      .eq('id', id)
      .single();
    if (bizErr || !biz) return res.status(404).json({ error: 'Business not found' });
    if (!isGrowthPlus(biz.plan || 'free')) {
      return res.status(403).json({ error: 'Upgrade to Growth to customize storefront.' });
    }

    const { data, error } = await supabase
      .from('businesses')
      .update({
        storefront_config: config,
        storefront_details: details
      })
      .eq('id', id)
      .select('storefront_config, storefront_details')
      .single();

    if (error) {
      console.error('Storefront update error:', error);
      return res.status(500).json({ error: 'Failed to publish storefront changes' });
    }

    // Broadcast live updates to public storefront viewers
    try {
      const io = req.app && req.app.get ? req.app.get('io') : null;
      if (io) {
        io.to(`storefront-${id}`).emit('storefront-updated', {
          businessId: id,
          config: data.storefront_config || null,
          details: data.storefront_details || null
        });
      }
    } catch (e) {
      console.error('Storefront socket broadcast error:', e);
    }

    res.json({
      success: true,
      storefrontConfig: data.storefront_config || null,
      storefrontDetails: data.storefront_details || null
    });
  } catch (err) {
    console.error('Storefront update error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// AI guest menu toggles + optional menu translations (Growth+) — merges into storefront JSON
router.patch('/:id/ai-menu-settings', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.businessId) {
      return res.status(403).json({ error: 'You can only update your own business' });
    }
    const { aiGuest, menuTranslations } = req.body || {};
    if (aiGuest !== undefined && (typeof aiGuest !== 'object' || aiGuest === null)) {
      return res.status(400).json({ error: 'aiGuest must be an object when provided' });
    }
    if (menuTranslations !== undefined && (typeof menuTranslations !== 'object' || menuTranslations === null)) {
      return res.status(400).json({ error: 'menuTranslations must be an object when provided' });
    }
    if (aiGuest === undefined && menuTranslations === undefined) {
      return res.status(400).json({ error: 'Provide aiGuest and/or menuTranslations' });
    }

    const plan = await getBusinessPlan(id);
    if (!isGrowthPlus(plan || 'free')) {
      return res.status(403).json({ error: 'Upgrade to Growth to use AI guest menu controls.' });
    }

    const { data: row, error: fetchErr } = await supabase
      .from('businesses')
      .select('storefront_config, storefront_details')
      .eq('id', id)
      .single();
    if (fetchErr || !row) return res.status(404).json({ error: 'Business not found' });

    const prevCfg = row.storefront_config && typeof row.storefront_config === 'object' ? row.storefront_config : {};
    const prevDet = row.storefront_details && typeof row.storefront_details === 'object' ? row.storefront_details : {};

    const nextCfg =
      aiGuest !== undefined
        ? { ...prevCfg, aiGuest: { ...(prevCfg.aiGuest && typeof prevCfg.aiGuest === 'object' ? prevCfg.aiGuest : {}), ...aiGuest } }
        : prevCfg;
    const nextDet =
      menuTranslations !== undefined
        ? { ...prevDet, menuTranslations: { ...(prevDet.menuTranslations || {}), ...menuTranslations } }
        : prevDet;

    const { data, error } = await supabase
      .from('businesses')
      .update({ storefront_config: nextCfg, storefront_details: nextDet })
      .eq('id', id)
      .select('storefront_config, storefront_details')
      .single();

    if (error) {
      console.error('ai-menu-settings update error:', error);
      return res.status(500).json({ error: 'Failed to save AI menu settings' });
    }

    try {
      const io = req.app && req.app.get ? req.app.get('io') : null;
      if (io) {
        io.to(`storefront-${id}`).emit('storefront-updated', {
          businessId: id,
          config: data.storefront_config || null,
          details: data.storefront_details || null
        });
      }
    } catch (e) {
      console.error('Storefront socket broadcast error:', e);
    }

    res.json({
      success: true,
      storefrontConfig: data.storefront_config || null,
      storefrontDetails: data.storefront_details || null
    });
  } catch (err) {
    console.error('ai-menu-settings error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;
