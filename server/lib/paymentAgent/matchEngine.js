const { getDb } = require('../../database');
const { parsePaymentSms } = require('./parsers');
const { scoreMatch, decideMatchOutcome } = require('./scoreMatch');
const { confirmMatch, emitAgentAlert, sendAndLog } = require('./confirmMatch');
const { renderStaffAmbiguous, renderStaffNeedsAttention } = require('../agentSmsTemplates');
const { normalizeMsisdn, msisdnInAllowlist, msisdnEqual } = require('../africasTalking');

function db() {
  return getDb();
}

function textSimilarity(a, b) {
  if (!a || !b) return 0;
  const na = String(a).toLowerCase().replace(/\s+/g, ' ').trim();
  const nb = String(b).toLowerCase().replace(/\s+/g, ' ').trim();
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  // cheap token overlap
  const ta = new Set(na.split(' ').filter(Boolean));
  const tb = new Set(nb.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

/**
 * Dedupe: same business, amount, timestamp within 60s, similar raw text.
 */
async function findDuplicateAlert(businessId, parsed, rawText, alertTimestamp) {
  if (parsed.amount == null) return null;
  const ts = new Date(alertTimestamp).getTime();
  const from = new Date(ts - 60_000).toISOString();
  const to = new Date(ts + 60_000).toISOString();

  const { data: rows } = await db()
    .from('payment_alerts')
    .select('id, raw_text, parsed_amount, alert_timestamp, match_status')
    .eq('business_id', businessId)
    .eq('parsed_amount', parsed.amount)
    .gte('alert_timestamp', from)
    .lte('alert_timestamp', to)
    .limit(20);

  for (const row of rows || []) {
    if (textSimilarity(row.raw_text, rawText) >= 0.85) {
      return row;
    }
  }
  return null;
}

async function loadPendingOrders(businessId, alertTimestamp, windowMinutes) {
  const ts = new Date(alertTimestamp).getTime();
  const windowMs = (Number(windowMinutes) || 20) * 60 * 1000;
  // Fetch a slightly wider band then let scoreMatch flag outsideWindow
  const from = new Date(ts - windowMs * 2).toISOString();
  const to = new Date(ts + windowMs).toISOString();

  const { data, error } = await db()
    .from('orders')
    .select(
      'id, business_id, total_amount, created_at, customer_name, customer_phone, payment_status, status'
    )
    .eq('business_id', businessId)
    .eq('payment_status', 'pending')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[ZURI] loadPendingOrders:', error.message || error);
    return [];
  }
  return data || [];
}

/**
 * Process a newly inserted alert: score, auto-confirm or queue for review.
 */
async function runMatchingForAlert({ req, alert, business }) {
  const windowMinutes = business.match_window_minutes || 20;
  const orders = await loadPendingOrders(
    business.id,
    alert.alert_timestamp,
    windowMinutes
  );

  const scored = orders.map((order) => {
    const result = scoreMatch(alert, order, { matchWindowMinutes: windowMinutes });
    return { order, ...result };
  });

  // Prefer candidates inside window for decision; keep all for storage when reviewing.
  // Generic/unknown parsers never auto-match.
  const outcome = decideMatchOutcome(scored, {
    provider: alert.parsed_bank_or_provider
  });

  if (outcome.decision === 'auto_matched' && outcome.top?.order) {
    const confirmed = await confirmMatch({
      req,
      alertId: alert.id,
      orderId: outcome.top.order.id,
      businessId: business.id,
      confirmedBy: 'agent_auto',
      confidenceScore: outcome.top.score
    });
    return {
      decision: 'auto_matched',
      alertId: alert.id,
      orderId: outcome.top.order.id,
      score: outcome.top.score,
      confirmed
    };
  }

  const matchStatus =
    outcome.decision === 'unmatchable' ? 'unmatchable' : 'pending_review';
  const flagReason =
    outcome.reviewReason ||
    (outcome.decision === 'unmatchable' ? 'no_candidates' : null);

  // Check stale: all candidates outside window or alert much older
  const anyOutside = (scored || []).every((c) => c.flags?.outsideWindow);
  const finalFlag =
    matchStatus === 'unmatchable' && anyOutside && scored.length
      ? 'old_alert'
      : flagReason;

  await db()
    .from('payment_alerts')
    .update({
      match_status: matchStatus,
      confidence_score: outcome.top?.score ?? null,
      flag_reason: finalFlag,
      parse_errors: alert.parse_errors
    })
    .eq('id', alert.id);

  await db().from('match_candidates').delete().eq('payment_alert_id', alert.id);

  const toStore = (outcome.candidates || scored)
    .filter((c) => c.order && !c.flags?.outsideWindow)
    .slice(0, 10);

  if (toStore.length && matchStatus === 'pending_review') {
    await db().from('match_candidates').insert(
      toStore.map((c) => ({
        payment_alert_id: alert.id,
        order_id: c.order.id,
        confidence_score: c.score,
        reason: (c.reasons || []).join('; ')
      }))
    );
  }

  emitAgentAlert(req, business.id, {
    alertId: alert.id,
    matchStatus,
    orderId: null
  });

  const staffPhone = business.agent_staff_msisdn || business.phone;
  if (staffPhone && alert.parsed_amount != null) {
    if (matchStatus === 'pending_review') {
      await sendAndLog({
        businessId: business.id,
        orderId: null,
        paymentAlertId: alert.id,
        recipientType: 'staff',
        to: staffPhone,
        message: renderStaffAmbiguous({ amount: alert.parsed_amount })
      });
    } else if (matchStatus === 'unmatchable') {
      await sendAndLog({
        businessId: business.id,
        orderId: null,
        paymentAlertId: alert.id,
        recipientType: 'staff',
        to: staffPhone,
        message: renderStaffNeedsAttention({
          amount: alert.parsed_amount,
          reason: finalFlag
        })
      });
    }
  }

  return {
    decision: matchStatus,
    alertId: alert.id,
    score: outcome.top?.score ?? null,
    candidates: toStore.map((c) => ({
      orderId: c.order.id,
      score: c.score,
      reasons: c.reasons
    })),
    flagReason: finalFlag
  };
}

/**
 * Ingest forwarded SMS for a business.
 */
async function ingestForwardedSms({
  req,
  business,
  rawText,
  sourceMsisdn,
  receivedAt = new Date()
}) {
  const parsed = parsePaymentSms(rawText, receivedAt);
  const alertTimestamp = parsed.timestamp || receivedAt;

  const dup = await findDuplicateAlert(
    business.id,
    parsed,
    rawText,
    alertTimestamp
  );
  if (dup) {
    return {
      ok: true,
      duplicate: true,
      alertId: dup.id,
      matchStatus: dup.match_status
    };
  }

  const row = {
    business_id: business.id,
    raw_text: rawText,
    source_msisdn: normalizeMsisdn(sourceMsisdn) || sourceMsisdn || null,
    parsed_amount: parsed.amount,
    parsed_sender_name: parsed.sender_name,
    parsed_channel: parsed.channel,
    parsed_bank_or_provider: parsed.bank_or_provider,
    alert_timestamp: new Date(alertTimestamp).toISOString(),
    received_at: new Date(receivedAt).toISOString(),
    match_status: parsed.amount == null ? 'unmatchable' : 'unmatched',
    parse_errors: parsed.parse_errors,
    flag_reason: parsed.amount == null ? 'parse_failed' : null
  };

  const { data: alert, error } = await db()
    .from('payment_alerts')
    .insert(row)
    .select('*')
    .single();

  if (error || !alert) {
    console.error('[ZURI] payment_alerts insert:', error?.message || error);
    return { ok: false, error: error?.message || 'insert failed' };
  }

  if (parsed.amount == null) {
    emitAgentAlert(req, business.id, {
      alertId: alert.id,
      matchStatus: 'unmatchable',
      orderId: null
    });
    const staffPhone = business.agent_staff_msisdn || business.phone;
    if (staffPhone) {
      await sendAndLog({
        businessId: business.id,
        orderId: null,
        paymentAlertId: alert.id,
        recipientType: 'staff',
        to: staffPhone,
        message: renderStaffNeedsAttention({
          amount: '?',
          reason: 'unparseable SMS'
        })
      });
    }
    return { ok: true, alert, decision: 'unmatchable', parseFailed: true };
  }

  const result = await runMatchingForAlert({ req, alert, business });
  return { ok: true, alert, ...result };
}

/**
 * Resolve business from inbound AT "to" number + fraud allowlist check.
 * When multiple businesses share one forwarding number, resolve by allowlisted `from` first (fail closed on ambiguity).
 */
async function resolveBusinessForInbound({ toNumber, fromNumber }) {
  const toNorm = normalizeMsisdn(toNumber);
  const toRaw = String(toNumber || '').trim();

  const { data: enabled, error } = await db()
    .from('businesses')
    .select(
      'id, name, phone, payment_agent_enabled, agent_forwarding_number, match_window_minutes, agent_staff_msisdn, agent_allowed_msisdns'
    )
    .eq('payment_agent_enabled', true)
    .limit(100);

  if (error) {
    return { ok: false, error: error.message };
  }

  const byForwarding = (enabled || []).filter((b) => {
    const fwd = b.agent_forwarding_number;
    if (!fwd) return false;
    return (
      msisdnEqual(fwd, toNorm || toRaw) ||
      String(fwd).replace(/\D/g, '') === String(toRaw).replace(/\D/g, '')
    );
  });

  if (!byForwarding.length) {
    return { ok: false, error: 'No enabled business for this forwarding number', code: 'unknown_to' };
  }

  const fromAllowlisted = byForwarding.filter((b) =>
    msisdnInAllowlist(fromNumber, b.agent_allowed_msisdns || [])
  );

  if (fromAllowlisted.length === 1) {
    return { ok: true, business: fromAllowlisted[0] };
  }

  if (fromAllowlisted.length > 1) {
    return {
      ok: false,
      error: 'Ambiguous business routing — source number allowlisted on multiple businesses',
      code: 'ambiguous_business'
    };
  }

  // Source not on any allowlist for this forwarding number
  return {
    ok: false,
    error: 'Source number not on allowlist',
    code: 'unauthorized_from',
    business: byForwarding[0]
  };
}

module.exports = {
  ingestForwardedSms,
  runMatchingForAlert,
  findDuplicateAlert,
  resolveBusinessForInbound,
  loadPendingOrders
};
