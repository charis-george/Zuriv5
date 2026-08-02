const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { requireBusinessAuth } = require('../middleware/auth');
const { normalizeUuid } = require('../lib/normalizeUuid');
const {
  verifyAtWebhook,
  getAtAgentNumber,
  normalizeMsisdn
} = require('../lib/africasTalking');
const {
  ingestForwardedSms,
  resolveBusinessForInbound
} = require('../lib/paymentAgent/matchEngine');
const { confirmMatch, emitAgentAlert } = require('../lib/paymentAgent/confirmMatch');

const MAX_SMS_TEXT_CHARS = 2000;

function db() {
  return getDb();
}

function normalizeAllowlist(raw) {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,;\s]+/)
      : [];
  const out = [];
  const invalid = [];
  for (const part of parts) {
    const trimmed = String(part || '').trim();
    if (!trimmed) continue;
    const norm = normalizeMsisdn(trimmed);
    if (norm) out.push(norm);
    else invalid.push(trimmed);
  }
  return { msisdns: [...new Set(out)], invalid };
}

/**
 * Africa's Talking inbound SMS webhook.
 * Typical fields: from, to, text, date, id
 */
router.post('/sms/inbound', async (req, res) => {
  try {
    if (!verifyAtWebhook(req)) {
      return res.status(401).json({ error: 'Unauthorized webhook' });
    }

    const from = req.body?.from || req.body?.sender || req.query?.from;
    const to = req.body?.to || req.query?.to;
    let text = req.body?.text || req.body?.message || req.query?.text;
    const date = req.body?.date || req.query?.date || new Date().toISOString();

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Missing SMS text' });
    }
    text = String(text).slice(0, MAX_SMS_TEXT_CHARS);
    if (!to) {
      return res.status(400).json({ error: 'Missing destination number (to)' });
    }

    const resolved = await resolveBusinessForInbound({
      toNumber: to,
      fromNumber: from
    });

    if (!resolved.ok) {
      if (resolved.code === 'unauthorized_from' && resolved.business) {
        await db().from('payment_alerts').insert({
          business_id: resolved.business.id,
          raw_text: String(text).slice(0, 500),
          source_msisdn: normalizeMsisdn(from) || String(from || '').slice(0, 32),
          alert_timestamp: new Date(date).toISOString(),
          match_status: 'unmatchable',
          flag_reason: 'unauthorized',
          parse_errors: 'Source MSISDN not on allowlist'
        });
        emitAgentAlert(req, resolved.business.id, {
          alertId: null,
          matchStatus: 'unmatchable',
          orderId: null,
          flagReason: 'unauthorized'
        });
      }
      const status =
        resolved.code === 'unauthorized_from'
          ? 403
          : resolved.code === 'ambiguous_business'
            ? 409
            : 404;
      return res.status(status).json({
        error: resolved.error,
        code: resolved.code
      });
    }

    const result = await ingestForwardedSms({
      req,
      business: resolved.business,
      rawText: String(text),
      sourceMsisdn: from,
      receivedAt: new Date(date)
    });

    // AT expects a quick 200; body is optional
    return res.status(200).json({
      ok: result.ok !== false,
      duplicate: Boolean(result.duplicate),
      alertId: result.alertId || result.alert?.id,
      decision: result.decision || result.matchStatus,
      orderId: result.orderId || null
    });
  } catch (err) {
    console.error('[ZURI] agent sms inbound:', err?.message || err);
    return res.status(500).json({ error: 'Inbound processing failed' });
  }
});

router.get('/alerts/pending-review', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { data: alerts, error } = await db()
      .from('payment_alerts')
      .select(
        'id, parsed_amount, parsed_sender_name, parsed_channel, parsed_bank_or_provider, alert_timestamp, received_at, match_status, confidence_score, flag_reason'
      )
      .eq('business_id', businessId)
      .eq('match_status', 'pending_review')
      .order('received_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const ids = (alerts || []).map((a) => a.id);
    let candidatesByAlert = {};
    if (ids.length) {
      const { data: cands } = await db()
        .from('match_candidates')
        .select('id, payment_alert_id, order_id, confidence_score, reason')
        .in('payment_alert_id', ids)
        .order('confidence_score', { ascending: false });

      const orderIds = [...new Set((cands || []).map((c) => c.order_id))];
      let orderMap = {};
      if (orderIds.length) {
        const { data: orders } = await db()
          .from('orders')
          .select('id, customer_name, total_amount, created_at, payment_status, status')
          .in('id', orderIds);
        orderMap = (orders || []).reduce((acc, o) => {
          acc[o.id] = o;
          return acc;
        }, {});
      }

      for (const c of cands || []) {
        if (!candidatesByAlert[c.payment_alert_id]) candidatesByAlert[c.payment_alert_id] = [];
        candidatesByAlert[c.payment_alert_id].push({
          id: c.id,
          orderId: c.order_id,
          confidenceScore: c.confidence_score,
          reason: c.reason,
          order: orderMap[c.order_id] || null
        });
      }
    }

    res.json({
      alerts: (alerts || []).map((a) => ({
        id: a.id,
        parsedAmount: a.parsed_amount,
        parsedSenderName: a.parsed_sender_name,
        parsedChannel: a.parsed_channel,
        parsedBankOrProvider: a.parsed_bank_or_provider,
        alertTimestamp: a.alert_timestamp,
        receivedAt: a.received_at,
        matchStatus: a.match_status,
        confidenceScore: a.confidence_score,
        flagReason: a.flag_reason,
        candidates: candidatesByAlert[a.id] || []
      }))
    });
  } catch (err) {
    console.error('[ZURI] pending-review:', err?.message || err);
    res.status(500).json({ error: 'Failed to load pending review' });
  }
});

router.get('/alerts/needs-attention', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { data: alerts, error } = await db()
      .from('payment_alerts')
      .select(
        'id, parsed_amount, parsed_sender_name, parsed_channel, parsed_bank_or_provider, alert_timestamp, received_at, match_status, confidence_score, flag_reason, parse_errors'
      )
      .eq('business_id', businessId)
      .eq('match_status', 'unmatchable')
      .order('received_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      alerts: (alerts || []).map((a) => ({
        id: a.id,
        parsedAmount: a.parsed_amount,
        parsedSenderName: a.parsed_sender_name,
        parsedChannel: a.parsed_channel,
        parsedBankOrProvider: a.parsed_bank_or_provider,
        alertTimestamp: a.alert_timestamp,
        receivedAt: a.received_at,
        matchStatus: a.match_status,
        confidenceScore: a.confidence_score,
        flagReason: a.flag_reason,
        parseErrors: a.parse_errors
      }))
    });
  } catch (err) {
    console.error('[ZURI] needs-attention:', err?.message || err);
    res.status(500).json({ error: 'Failed to load needs-attention queue' });
  }
});

router.post('/alerts/:alertId/confirm', requireBusinessAuth, async (req, res) => {
  try {
    const alertId = normalizeUuid(req.params.alertId) || req.params.alertId;
    const orderId = normalizeUuid(req.body?.order_id || req.body?.orderId) || req.body?.order_id || req.body?.orderId;
    if (!orderId) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    const result = await confirmMatch({
      req,
      alertId,
      orderId,
      businessId: req.businessId,
      confirmedBy: 'staff'
    });

    if (!result.ok) {
      const status = result.error === 'Order already paid' ? 409 : 400;
      return res.status(status).json({ error: result.error });
    }

    res.json({
      ok: true,
      alreadyConfirmed: Boolean(result.alreadyConfirmed),
      orderId,
      alertId,
      matchStatus: result.matchStatus
    });
  } catch (err) {
    console.error('[ZURI] alert confirm:', err?.message || err);
    res.status(500).json({ error: 'Confirm failed' });
  }
});

/**
 * Enable / update Zuri Assist payment agent for the authenticated business.
 * Body: { enabled?, allowedMsisdns?, staffMsisdn?, matchWindowMinutes? }
 */
router.post('/enable', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const {
      enabled,
      allowedMsisdns,
      staffMsisdn,
      matchWindowMinutes
    } = req.body || {};

    const updates = {};
    if (enabled !== undefined) {
      updates.payment_agent_enabled = Boolean(enabled);
    }

    if (allowedMsisdns !== undefined) {
      const { msisdns, invalid } = normalizeAllowlist(allowedMsisdns);
      if (invalid.length) {
        return res.status(400).json({
          error: `Invalid phone number(s): ${invalid.slice(0, 3).join(', ')}. Use Nigerian numbers like 0803… or +234…`
        });
      }
      updates.agent_allowed_msisdns = msisdns;
    }

    if (staffMsisdn !== undefined) {
      if (!staffMsisdn || !String(staffMsisdn).trim()) {
        updates.agent_staff_msisdn = null;
      } else {
        const norm = normalizeMsisdn(staffMsisdn);
        if (!norm) {
          return res.status(400).json({
            error: 'Staff SMS number is invalid. Use a Nigerian number like 0803… or +234…'
          });
        }
        updates.agent_staff_msisdn = norm;
      }
    }

    if (matchWindowMinutes !== undefined) {
      const w = Number(matchWindowMinutes);
      if (!Number.isFinite(w) || w < 5 || w > 180) {
        return res.status(400).json({ error: 'matchWindowMinutes must be 5–180' });
      }
      updates.match_window_minutes = Math.round(w);
    }

    const defaultNumber = getAtAgentNumber();
    if (updates.payment_agent_enabled === true) {
      const { data: existing } = await db()
        .from('businesses')
        .select('agent_forwarding_number, agent_allowed_msisdns')
        .eq('id', businessId)
        .maybeSingle();

      const nextAllow =
        updates.agent_allowed_msisdns ?? existing?.agent_allowed_msisdns ?? [];
      if (!nextAllow.length) {
        return res.status(400).json({
          error: 'Add at least one allowlisted phone that will forward SMS alerts'
        });
      }

      if (!defaultNumber && !existing?.agent_forwarding_number) {
        return res.status(400).json({
          error: 'Forwarding number is not configured yet. Contact Zuri support.'
        });
      }
      updates.agent_forwarding_number = defaultNumber || existing.agent_forwarding_number;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data, error } = await db()
      .from('businesses')
      .update(updates)
      .eq('id', businessId)
      .select(
        'id, payment_agent_enabled, agent_forwarding_number, match_window_minutes, agent_staff_msisdn, agent_allowed_msisdns'
      )
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      paymentAgentEnabled: data.payment_agent_enabled,
      agentForwardingNumber: data.agent_forwarding_number,
      matchWindowMinutes: data.match_window_minutes,
      agentStaffMsisdn: data.agent_staff_msisdn,
      agentAllowedMsisdns: data.agent_allowed_msisdns || []
    });
  } catch (err) {
    console.error('[ZURI] agent enable:', err?.message || err);
    res.status(500).json({ error: 'Failed to update agent settings' });
  }
});

router.get('/settings', requireBusinessAuth, async (req, res) => {
  try {
    const { data, error } = await db()
      .from('businesses')
      .select(
        'payment_agent_enabled, agent_forwarding_number, match_window_minutes, agent_staff_msisdn, agent_allowed_msisdns'
      )
      .eq('id', req.businessId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json({
      paymentAgentEnabled: data.payment_agent_enabled,
      agentForwardingNumber: data.agent_forwarding_number || getAtAgentNumber(),
      matchWindowMinutes: data.match_window_minutes ?? 20,
      agentStaffMsisdn: data.agent_staff_msisdn,
      agentAllowedMsisdns: data.agent_allowed_msisdns || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load agent settings' });
  }
});

module.exports = router;
