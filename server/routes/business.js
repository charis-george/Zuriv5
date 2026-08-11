const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { getBusinessPlan, canAddBusinessLogo, effectivePlanFromRow } = require('../lib/plans');
const { signBusinessToken, requireBusinessAuth, verifyBusinessToken } = require('../middleware/auth');
const { sendResendEmail, isResendConfigured } = require('../lib/resendMail');
const { queueBusinessWelcomeEmail } = require('../lib/welcomeEmail');
const {
  createPasswordResetToken,
  consumePasswordResetToken,
  purgeExpiredPasswordResetTokens,
  validateNewPassword
} = require('../lib/passwordResetTokens');
const { verifyBankAccount } = require('../lib/bankVerification');
const { ensurePaystackSubaccount } = require('../lib/paystack-subaccount');
const { getManagePaymentUrlForBusiness } = require('../lib/paystack-subscription');
const { normalizeAccountStatus } = require('../lib/businessStatus');
const { invalidateBusinessReads } = require('../lib/publicReadCache');
const {
  allocateUniquePublicSlug,
  isPublicSlugAvailable,
  normalizePublicSlug
} = require('../lib/publicSlug');
const { normalizeReceiptEmailConfig } = require('../lib/receiptEmailConfig');

const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getDb();
      return client[prop];
    }
  }
);

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
    const { name, email, password, phone, address, businessMode, contactName } = req.body;
    const { normalizeBusinessMode } = require('../lib/businessMode');
    const normalizedBusinessMode = normalizeBusinessMode(businessMode);

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const emailNorm = normalizeBusinessEmail(email);
    if (!emailNorm) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
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
        contact_name: contactName ? String(contactName).trim().slice(0, 80) : null,
        business_mode: normalizedBusinessMode,
        account_status: 'under_review'
      })
      .select()
      .single();

    if (error) {
      console.error('Registration error:', error);
      return res.status(500).json({ error: 'Failed to register business' });
    }

    let publicSlug = null;
    try {
      publicSlug = await allocateUniquePublicSlug(supabase, name, { excludeBusinessId: businessId });
      const { error: slugErr } = await supabase
        .from('businesses')
        .update({ public_slug: publicSlug })
        .eq('id', businessId);
      if (slugErr) {
        console.warn('[ZURI] Could not assign public_slug on register', {
          businessId,
          cause: slugErr.message || String(slugErr)
        });
        publicSlug = null;
      }
    } catch (slugAssignErr) {
      console.warn('[ZURI] public_slug assign skipped', {
        businessId,
        cause: slugAssignErr?.message || String(slugAssignErr)
      });
    }

    queueBusinessWelcomeEmail({ email: data.email, name: data.name });

    res.json({
      id: data.id,
      name: data.name,
      email: data.email,
      businessMode: data.business_mode || 'menu',
      publicSlug,
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
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
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

    await purgeExpiredPasswordResetTokens();
    let token;
    try {
      token = await createPasswordResetToken('business', business.id);
    } catch {
      return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again later.' });
    }

    const baseUrl = req.get('origin') || process.env.BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${baseUrl}/business/reset-password?token=${token}`;

    const subject = 'Reset your ZURI business password';
    const text = `You requested a password reset for your ZURI business account. Click the link below to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`;
    const html = `<p>You requested a password reset for your ZURI business account.</p><p><a href="${resetLink}">Set a new password</a> (link valid for 1 hour).</p><p>If you didn't request this, you can ignore this email.</p>`;

    // Best-effort: send email async; never block the HTTP response.
    setImmediate(() => {
      if (!isResendConfigured()) {
        console.warn('[ZURI] Password reset email skipped: set RESEND_API_KEY and RESEND_FROM.');
        return;
      }
      sendResendEmail(
        { to: toEmail, subject, text, html },
        { timeoutMs: 8000 }
      ).catch((err) => console.error('Password reset email error:', err?.message || err));
    });

    const response = {
      success: true,
      message: 'If an account exists with this email, you will receive reset instructions.'
    };
    if (process.env.NODE_ENV !== 'production' && !isResendConfigured()) {
      response.resetLink = resetLink;
    }
    return res.json(response);
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
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const businessId = await consumePasswordResetToken('business', token.trim());
    if (!businessId) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword.trim(), 10);
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ password: hashedPassword })
      .eq('id', businessId);
    if (updateError) return res.status(500).json({ error: 'Failed to update password' });
    res.json({ success: true, message: 'Password updated. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Public slug availability (owners pass Bearer to exclude themselves when renaming)
router.get('/slug-available', async (req, res) => {
  try {
    const raw = String(req.query.slug || '').trim();
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const authPayload = verifyBusinessToken(bearerToken);
    const excludeBusinessId = authPayload?.sub || undefined;
    const result = await isPublicSlugAvailable(supabase, raw, { excludeBusinessId });
    res.json(result);
  } catch (err) {
    console.error('slug-available error:', err);
    res.status(500).json({ available: false, slug: null, reason: 'error' });
  }
});

// Resolve business id by public slug (guest storefront)
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const normalized = normalizePublicSlug(req.params.slug);
    if (!normalized) return res.status(404).json({ error: 'Storefront not found' });
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, public_slug, logo_url, business_mode, account_status')
      .ilike('public_slug', normalized)
      .maybeSingle();
    if (error) {
      if (/public_slug/i.test(error.message || '')) {
        return res.status(404).json({ error: 'Storefront not found' });
      }
      console.error('by-slug error:', error);
      return res.status(500).json({ error: 'Failed to resolve storefront' });
    }
    if (!data?.id) return res.status(404).json({ error: 'Storefront not found' });
    res.json({
      id: data.id,
      name: data.name,
      publicSlug: data.public_slug,
      logoUrl: data.logo_url || null,
      businessMode: data.business_mode || 'menu',
      accountStatus: normalizeAccountStatus(data.account_status)
    });
  } catch (err) {
    console.error('by-slug error:', err);
    res.status(500).json({ error: 'Failed to resolve storefront' });
  }
});

// Get business by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: business, error } = await supabase
      .from('businesses')
      .select('id, name, email, phone, address, contact_name, account_status, bank_verified_at, created_at, plan, subscription_status, subscription_interval, subscription_current_period_end, subscription_cancelled_at, paystack_subscription_code, paystack_public_key, payment_provider, bank_code, bank_name, account_number, account_name, logo_url, storefront_config, storefront_details, storefront_profiles, business_mode, storefront_ai_generations, menu_digitize_uses, menu_digitize_tokens_total, business_group_id, kyc_doc_requested_at, moderation_notes, payment_agent_enabled, agent_forwarding_number, match_window_minutes, agent_staff_msisdn, agent_allowed_msisdns, paystack_terminal_id, public_slug, receipt_email_config')
      .eq('id', id)
      .single();

    if (error || !business) {
      // Fallback if new columns are not migrated yet
      if (error && /public_slug|receipt_email_config/i.test(error.message || '')) {
        const { data: legacy, error: legacyErr } = await supabase
          .from('businesses')
          .select('id, name, email, phone, address, contact_name, account_status, bank_verified_at, created_at, plan, subscription_status, subscription_interval, subscription_current_period_end, subscription_cancelled_at, paystack_subscription_code, paystack_public_key, payment_provider, bank_code, bank_name, account_number, account_name, logo_url, storefront_config, storefront_details, storefront_profiles, business_mode, storefront_ai_generations, menu_digitize_uses, menu_digitize_tokens_total, business_group_id, kyc_doc_requested_at, moderation_notes, payment_agent_enabled, agent_forwarding_number, match_window_minutes, agent_staff_msisdn, agent_allowed_msisdns, paystack_terminal_id')
          .eq('id', id)
          .single();
        if (legacyErr || !legacy) return res.status(404).json({ error: 'Business not found' });
        return res.json(await buildBusinessPayload(req, legacy));
      }
      return res.status(404).json({ error: 'Business not found' });
    }

    return res.json(await buildBusinessPayload(req, business));
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Failed to load business' });
  }
});

async function buildBusinessPayload(req, business) {
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const authPayload = verifyBusinessToken(bearerToken);
    const isOwner = authPayload && authPayload.sub === business.id;

    const paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY || business.paystack_public_key || null;
    const effectivePlan = effectivePlanFromRow(business);
    const { normalizeStorefrontProfiles } = require('../lib/storefrontProfiles');
    const { ensureCatalogPresetsForProfiles } = require('../lib/menuPresets');
    let storefrontProfiles = normalizeStorefrontProfiles(business);
    if (isOwner) {
      const withPresets = await ensureCatalogPresetsForProfiles(
        business.id,
        storefrontProfiles,
        business.business_mode || 'menu'
      );
      const before = JSON.stringify(storefrontProfiles);
      storefrontProfiles = withPresets;
      if (JSON.stringify(withPresets) !== before) {
        await supabase
          .from('businesses')
          .update({ storefront_profiles: withPresets })
          .eq('id', business.id);
      }
    }

    const brandFallback =
      business.storefront_config && typeof business.storefront_config === 'object'
        ? business.storefront_config.brandColor
        : '#ffbd59';

    const payload = {
      id: business.id,
      name: business.name,
      address: business.address,
      createdAt: business.created_at,
      plan: effectivePlan,
      storedPlan: business.plan || 'free',
      paystackPublicKey,
      paymentProvider: business.payment_provider === 'monnify' ? 'monnify' : 'paystack',
      logoUrl: business.logo_url || null,
      storefrontConfig: business.storefront_config || null,
      storefrontDetails: business.storefront_details || null,
      storefrontProfiles,
      businessMode: business.business_mode || 'menu',
      storefrontAiGenerations: Number(business.storefront_ai_generations || 0),
      menuDigitizeUses: Number(business.menu_digitize_uses || 0),
      menuDigitizeTokensTotal: Number(business.menu_digitize_tokens_total || 0),
      businessGroupId: business.business_group_id || null,
      accountStatus: normalizeAccountStatus(business.account_status),
      bankVerifiedAt: business.bank_verified_at || null,
      kycDocRequestedAt: business.kyc_doc_requested_at || null,
      publicSlug: business.public_slug || null,
      receiptEmailConfig: normalizeReceiptEmailConfig(business.receipt_email_config, brandFallback)
    };
    if (isOwner) {
      payload.email = business.email || null;
      payload.phone = business.phone || null;
      payload.contactName = business.contact_name || null;
      payload.moderationNotes = business.moderation_notes || null;
      payload.subscriptionStatus = business.subscription_status || 'none';
      payload.subscriptionInterval = business.subscription_interval || null;
      payload.subscriptionCurrentPeriodEnd = business.subscription_current_period_end || null;
      payload.subscriptionCancelledAt = business.subscription_cancelled_at || null;
      payload.renewsAutomatically = Boolean(business.paystack_subscription_code) && business.subscription_status === 'active';
      payload.paymentAgentEnabled = Boolean(business.payment_agent_enabled);
      payload.agentForwardingNumber = business.agent_forwarding_number || null;
      payload.matchWindowMinutes = business.match_window_minutes ?? 20;
      payload.agentStaffMsisdn = business.agent_staff_msisdn || null;
      payload.agentAllowedMsisdns = business.agent_allowed_msisdns || [];
      payload.paystackTerminalId = business.paystack_terminal_id || null;
      if (payload.renewsAutomatically) {
        try {
          const manage = await getManagePaymentUrlForBusiness(business.id);
          if (manage.ok) payload.managePaymentUrl = manage.link;
        } catch {
          /* non-blocking */
        }
      }
    }
    if (business.bank_name || business.account_name) {
      payload.bankAccount = {
        bankName: business.bank_name || null,
        accountNumberMasked: business.account_number ? `****${business.account_number.slice(-4)}` : null,
        accountName: business.account_name || null
      };
    }
    return payload;
}

// Update business (bank details, logo) — requires business auth
router.patch('/:id', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.businessId) {
      return res.status(403).json({ error: 'You can only update your own business' });
    }
    const { bank_code, bank_name, account_number, account_name, logo_url, password, name, contactName, businessMode, businessGroupId, paymentProvider, publicSlug, receiptEmailConfig } = req.body;
    const updates = {};
    if (name !== undefined) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed) return res.status(400).json({ error: 'Business name cannot be empty' });
      if (trimmed.length > 80) return res.status(400).json({ error: 'Business name is too long' });
      updates.name = trimmed;
    }
    if (publicSlug !== undefined) {
      const normalized = normalizePublicSlug(publicSlug);
      if (!normalized) {
        return res.status(400).json({ error: 'That storefront URL is invalid or reserved. Try another name.' });
      }
      const avail = await isPublicSlugAvailable(supabase, normalized, { excludeBusinessId: id });
      if (!avail.available) {
        return res.status(409).json({ error: 'That storefront URL is already taken.', reason: avail.reason });
      }
      updates.public_slug = normalized;
    }
    if (receiptEmailConfig !== undefined) {
      const { data: rowForBrand } = await supabase
        .from('businesses')
        .select('storefront_config')
        .eq('id', id)
        .maybeSingle();
      const brandFallback =
        rowForBrand?.storefront_config && typeof rowForBrand.storefront_config === 'object'
          ? rowForBrand.storefront_config.brandColor
          : '#ffbd59';
      updates.receipt_email_config = normalizeReceiptEmailConfig(receiptEmailConfig, brandFallback);
    }
    if (contactName !== undefined) {
      updates.contact_name = contactName ? String(contactName).trim().slice(0, 80) : null;
    }
    if (bank_code !== undefined) updates.bank_code = bank_code || null;
    if (bank_name !== undefined) updates.bank_name = bank_name || null;
    if (account_number !== undefined) updates.account_number = account_number ? String(account_number).trim() : null;
    // Validate account number format if provided (8–16 digits)
    if (updates.account_number) {
      const digits = updates.account_number.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 16) {
        return res.status(400).json({ error: 'Account number must be 8–16 digits' });
      }
      updates.account_number = digits;
    }

    const isBankUpdate = Object.keys(updates).some(k => ['bank_code', 'bank_name', 'account_number'].includes(k));
    if (isBankUpdate) {
      if (!password || typeof password !== 'string' || !password.trim()) {
        return res.status(400).json({ error: 'Your Zuri business account password is required to save bank details.' });
      }
      const { data: biz } = await supabase.from('businesses').select('password, payment_provider').eq('id', id).single();
      if (!biz || !biz.password) {
        return res.status(500).json({ error: 'Could not verify account.' });
      }
      if (!bcrypt.compareSync(password.trim(), biz.password)) {
        return res.status(401).json({ error: 'Incorrect password. Enter your Zuri business account password.' });
      }

      const bankCode = updates.bank_code || null;
      const acctNum = updates.account_number || null;
      if (!bankCode || !acctNum) {
        return res.status(400).json({ error: 'Bank and account number are required' });
      }

      try {
        const provider = biz.payment_provider === 'monnify' ? 'monnify' : 'paystack';
        const verified = await verifyBankAccount({
          accountNumber: acctNum,
          bankCode,
          provider
        });
        updates.account_name = verified.accountName;
        updates.bank_verified_at = new Date().toISOString();
        updates.paystack_recipient_code = null;
        updates.paystack_subaccount_code = null;
      } catch (verifyErr) {
        return res.status(verifyErr.status || 400).json({ error: verifyErr.message || 'Could not verify bank account' });
      }
    }

    if (logo_url !== undefined) {
      const plan = await getBusinessPlan(id);
      if (!canAddBusinessLogo(plan)) return res.status(403).json({ error: 'Business logo is available on Starter plan and above.' });
      updates.logo_url = logo_url || null;
    }
    if (businessMode !== undefined) {
      const { normalizeBusinessMode } = require('../lib/businessMode');
      const raw = String(businessMode || '').trim().toLowerCase();
      const allowed = new Set([
        'menu',
        'ticketing',
        'shop',
        'ticket',
        'tickets',
        'event',
        'events',
        'shops',
        'catalog',
        'retail',
        'store',
        ''
      ]);
      if (!allowed.has(raw)) {
        return res.status(400).json({ error: 'Invalid business mode' });
      }
      updates.business_mode = normalizeBusinessMode(businessMode);
    }
    if (businessGroupId !== undefined) {
      const v = businessGroupId && String(businessGroupId).trim() ? String(businessGroupId).trim().slice(0, 80) : null;
      updates.business_group_id = v;
    }
    if (paymentProvider !== undefined) {
      const v = String(paymentProvider).toLowerCase();
      if (v !== 'paystack' && v !== 'monnify') {
        return res.status(400).json({ error: 'paymentProvider must be paystack or monnify' });
      }
      if (v === 'monnify') {
        const { isMonnifyConfigured } = require('../lib/monnify');
        if (!isMonnifyConfigured()) {
          return res.status(503).json({ error: 'Monnify payouts aren’t available right now. Contact Zuri support or choose Paystack.' });
        }
      }
      updates.payment_provider = v;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

    const { data, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', id)
      .select('id, name, contact_name, bank_name, bank_code, account_number, account_name, bank_verified_at, logo_url, business_mode, business_group_id, payment_provider, paystack_subaccount_code, public_slug, receipt_email_config')
      .single();
    if (error) return res.status(500).json({ error: 'Update failed' });

    if (isBankUpdate && data.bank_verified_at && data.payment_provider !== 'monnify') {
      ensurePaystackSubaccount(id).catch((err) =>
        console.error('Subaccount provisioning after bank verify', id, err)
      );
    }
    try {
      const io = req.app && req.app.get ? req.app.get('io') : null;
      if (io && updates.business_mode !== undefined) {
        invalidateBusinessReads(id);
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
      contactName: data.contact_name || null,
      bankAccount: data.account_number ? {
        bankName: data.bank_name,
        accountNumberMasked: `****${String(data.account_number).slice(-4)}`,
        accountName: data.account_name,
        verifiedAt: data.bank_verified_at || null
      } : null,
      bankVerifiedAt: data.bank_verified_at || null,
      logoUrl: data.logo_url || null,
      businessMode: data.business_mode || 'menu',
      businessGroupId: data.business_group_id || null,
      publicSlug: data.public_slug || null,
      receiptEmailConfig: normalizeReceiptEmailConfig(data.receipt_email_config, '#ffbd59')
    });
  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
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
    const passwordError = validateNewPassword(new_password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
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
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
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
          invalidateBusinessReads(businessId);
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
        invalidateBusinessReads(businessId);
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

    const { config, details, profileId, profiles: profilesBody } = req.body || {};

    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('id, plan, name, business_mode, storefront_config, storefront_details, storefront_profiles')
      .eq('id', id)
      .single();
    if (bizErr || !biz) return res.status(404).json({ error: 'Business not found' });
    if (!isGrowthPlus(biz.plan || 'free')) {
      return res.status(403).json({ error: 'Upgrade to Growth to customize storefront.' });
    }

    const {
      normalizeStorefrontProfiles,
      legacyColumnsFromProfiles,
      updateProfileInList,
      dedupeProfileSlugs
    } = require('../lib/storefrontProfiles');
    const { ensureCatalogPresetsForProfiles } = require('../lib/menuPresets');

    let profiles = normalizeStorefrontProfiles(biz);

    if (Array.isArray(profilesBody) && profilesBody.length > 0) {
      profiles = dedupeProfileSlugs(
        normalizeStorefrontProfiles({ name: biz.name, storefront_profiles: profilesBody })
      );
      if (!profiles.some((p) => p.isDefault)) profiles[0].isDefault = true;
    } else {
      if (!config || typeof config !== 'object') {
        return res.status(400).json({ error: 'config is required' });
      }
      if (!details || typeof details !== 'object') {
        return res.status(400).json({ error: 'details is required' });
      }
      const targetId = profileId || profiles.find((p) => p.isDefault)?.id || profiles[0]?.id;
      if (!targetId) {
        return res.status(400).json({ error: 'No storefront profile to update' });
      }
      profiles = updateProfileInList(profiles, targetId, { config, details });
    }

    profiles = await ensureCatalogPresetsForProfiles(id, profiles, biz.business_mode || 'menu');

    const legacy = legacyColumnsFromProfiles(profiles);

    const { data, error } = await supabase
      .from('businesses')
      .update({
        storefront_profiles: profiles,
        storefront_config: legacy.storefront_config,
        storefront_details: legacy.storefront_details
      })
      .eq('id', id)
      .select('storefront_config, storefront_details, storefront_profiles')
      .single();

    if (error) {
      console.error('Storefront update error:', error);
      return res.status(500).json({ error: 'Failed to publish storefront changes' });
    }

    const savedProfiles = normalizeStorefrontProfiles(data);
    const activeProfile =
      savedProfiles.find((p) => p.id === profileId) ||
      savedProfiles.find((p) => p.isDefault) ||
      savedProfiles[0];

    // Broadcast live updates to public storefront viewers
    try {
      const io = req.app && req.app.get ? req.app.get('io') : null;
      if (io) {
        invalidateBusinessReads(id);
        io.to(`storefront-${id}`).emit('storefront-updated', {
          businessId: id,
          profileId: activeProfile?.id || null,
          profiles: savedProfiles,
          config: activeProfile?.config || data.storefront_config || null,
          details: activeProfile?.details || data.storefront_details || null
        });
      }
    } catch (e) {
      console.error('Storefront socket broadcast error:', e);
    }

    res.json({
      success: true,
      storefrontProfiles: savedProfiles,
      storefrontConfig: activeProfile?.config || data.storefront_config || null,
      storefrontDetails: activeProfile?.details || data.storefront_details || null
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
    if (!plan) {
      return res.status(403).json({ error: 'Could not verify your plan.' });
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
        invalidateBusinessReads(id);
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

/** Public VAPID key for browser push subscription. */
router.get('/push/vapid-public-key', requireBusinessAuth, (req, res) => {
  const { getVapidPublicKey } = require('../lib/webPush');
  const publicKey = getVapidPublicKey();
  res.json({ publicKey });
});

/** Save a browser push subscription for new-order alerts. */
router.post('/:id/push-subscription', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.businessId) return res.status(403).json({ error: 'Forbidden' });

    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';
    const p256dh = req.body?.keys?.p256dh;
    const auth = req.body?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: 'Invalid push subscription payload' });
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        business_id: id,
        endpoint,
        p256dh: String(p256dh),
        auth: String(auth),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 300) || null
      },
      { onConflict: 'business_id,endpoint' }
    );

    if (error) {
      console.error('[ZURI] push-subscription upsert error:', error);
      return res.status(500).json({ error: 'Failed to save push subscription' });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[ZURI] push-subscription error:', e);
    res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

/** Remove a browser push subscription. */
router.delete('/:id/push-subscription', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.businessId) return res.status(403).json({ error: 'Forbidden' });

    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });

    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('business_id', id)
      .eq('endpoint', endpoint);

    res.json({ success: true });
  } catch (e) {
    console.error('[ZURI] push-subscription delete error:', e);
    res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

module.exports = router;
