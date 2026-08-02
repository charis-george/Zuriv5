const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { requireAdminAuth } = require('../middleware/adminAuth');
const { normalizeAccountStatus } = require('../lib/businessStatus');
const { ensurePaystackSubaccount } = require('../lib/paystack-subaccount');
const { refundOrderPayment } = require('../lib/paystack-refund');

const supabase = getDb();

router.use(requireAdminAuth);

/** List venues for post-onboarding review */
router.get('/venues', async (req, res) => {
  try {
    const status = req.query.status;
    let query = supabase
      .from('businesses')
      .select('id, name, email, phone, contact_name, account_status, bank_verified_at, paystack_subaccount_code, created_at, reviewed_at, moderation_notes, kyc_doc_requested_at, business_mode')
      .order('created_at', { ascending: false })
      .limit(100);
    if (status) query = query.eq('account_status', normalizeAccountStatus(status));
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Failed to list venues' });
    res.json(data || []);
  } catch (err) {
    console.error('Admin list venues error:', err);
    res.status(500).json({ error: 'Failed to list venues' });
  }
});

/** Update venue moderation status */
router.patch('/venues/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { accountStatus, moderationNotes, requestKycDocs } = req.body || {};
    const updates = {};
    if (accountStatus !== undefined) {
      updates.account_status = normalizeAccountStatus(accountStatus);
      if (updates.account_status === 'active') {
        updates.reviewed_at = new Date().toISOString();
      }
    }
    if (moderationNotes !== undefined) {
      updates.moderation_notes = moderationNotes ? String(moderationNotes).slice(0, 2000) : null;
    }
    if (requestKycDocs) {
      updates.kyc_doc_requested_at = new Date().toISOString();
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    const { data, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', id)
      .select('id, name, account_status, reviewed_at, moderation_notes, kyc_doc_requested_at')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Venue not found' });
    res.json(data);
  } catch (err) {
    console.error('Admin update venue status error:', err);
    res.status(500).json({ error: 'Failed to update venue' });
  }
});

/** Provision Paystack subaccount after bank verification */
router.post('/venues/:id/provision-subaccount', async (req, res) => {
  try {
    const result = await ensurePaystackSubaccount(req.params.id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ subaccountCode: result.subaccountCode });
  } catch (err) {
    console.error('Admin provision subaccount error:', err);
    res.status(500).json({ error: 'Failed to provision subaccount' });
  }
});

/** Process refund for a paid order (venue-initiated cancellation, disputes) */
router.post('/orders/:orderId/refund', async (req, res) => {
  try {
    const { amountNaira, reason } = req.body || {};
    const result = await refundOrderPayment(req.params.orderId, { amountNaira, reason });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('Admin refund error:', err);
    res.status(500).json({ error: 'Refund failed' });
  }
});

/** List open disputes */
router.get('/disputes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('disputes')
      .select('*, orders(id, total_amount, customer_name, customer_email, payment_status)')
      .eq('status', req.query.status || 'open')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: 'Failed to list disputes' });
    res.json(data || []);
  } catch (err) {
    console.error('Admin list disputes error:', err);
    res.status(500).json({ error: 'Failed to list disputes' });
  }
});

/** Create dispute ticket (platform mediation) */
router.post('/disputes', async (req, res) => {
  try {
    const { orderId, businessId, raisedBy, reason } = req.body || {};
    if (!orderId || !businessId) {
      return res.status(400).json({ error: 'orderId and businessId are required' });
    }
    const { data, error } = await supabase
      .from('disputes')
      .insert({
        order_id: orderId,
        business_id: businessId,
        raised_by: ['guest', 'venue', 'platform'].includes(raisedBy) ? raisedBy : 'guest',
        reason: reason ? String(reason).slice(0, 1000) : null
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to create dispute' });
    res.json(data);
  } catch (err) {
    console.error('Admin create dispute error:', err);
    res.status(500).json({ error: 'Failed to create dispute' });
  }
});

/** Resolve dispute */
router.patch('/disputes/:id', async (req, res) => {
  try {
    const { status, resolutionNotes } = req.body || {};
    const updates = {};
    if (status) updates.status = status;
    if (resolutionNotes !== undefined) updates.resolution_notes = resolutionNotes;
    if (status === 'resolved' || status === 'closed') {
      updates.resolved_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('disputes')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ error: 'Dispute not found' });
    res.json(data);
  } catch (err) {
    console.error('Admin resolve dispute error:', err);
    res.status(500).json({ error: 'Failed to update dispute' });
  }
});

module.exports = router;
