/**
 * Pure payment-alert ↔ order scoring for Zuri Assist.
 * Weights: amount 0.6, time 0.2, sender-name 0.2.
 */

const AMOUNT_WEIGHT = 0.6;
const TIME_WEIGHT = 0.2;
const NAME_WEIGHT = 0.2;
const AMOUNT_TOLERANCE_NAIRA = 1;
const AUTO_THRESHOLD = 0.85;
const TIE_DELTA = 0.05;
const GENERIC_SCORE_CAP = 0.85;

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function normalizeName(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein distance. */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) dp[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return null;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (!maxLen) return null;
  const dist = levenshtein(na, nb);
  return clamp01(1 - dist / maxLen);
}

/**
 * @param {object} alert - { parsed_amount, alert_timestamp, parsed_sender_name, parsed_bank_or_provider }
 * @param {object} order - { total_amount | totalAmount, created_at | createdAt, customer_name | customerName }
 * @param {{ matchWindowMinutes?: number }} [opts]
 * @returns {{ score: number, reasons: string[], amountDelta: number|null, flags: { partial?: boolean, overpayment?: boolean, outsideWindow?: boolean } }}
 */
function scoreMatch(alert, order, opts = {}) {
  const reasons = [];
  const flags = {};
  const windowMin = Number(opts.matchWindowMinutes) > 0 ? Number(opts.matchWindowMinutes) : 20;
  const windowMs = windowMin * 60 * 1000;

  const alertAmount = Number(alert.parsed_amount ?? alert.parsedAmount);
  const orderAmount = Number(order.total_amount ?? order.totalAmount);
  const alertTs = new Date(alert.alert_timestamp ?? alert.alertTimestamp ?? Date.now()).getTime();
  const orderTs = new Date(order.created_at ?? order.createdAt ?? Date.now()).getTime();
  const sender = alert.parsed_sender_name ?? alert.parsedSenderName ?? null;
  const customer = order.customer_name ?? order.customerName ?? null;
  const provider = String(alert.parsed_bank_or_provider ?? alert.parsedBankOrProvider ?? 'unknown').toLowerCase();

  let amountScore = 0;
  let amountDelta = null;
  if (Number.isFinite(alertAmount) && Number.isFinite(orderAmount)) {
    amountDelta = Math.round((alertAmount - orderAmount) * 100) / 100;
    const absDelta = Math.abs(amountDelta);
    if (absDelta <= AMOUNT_TOLERANCE_NAIRA) {
      amountScore = 1;
      reasons.push('amount exact match');
    } else if (alertAmount < orderAmount) {
      flags.partial = true;
      amountScore = 0;
      reasons.push(`partial_payment: alert ₦${alertAmount} < order ₦${orderAmount}`);
    } else {
      flags.overpayment = true;
      amountScore = 0;
      reasons.push(`overpayment: alert ₦${alertAmount} > order ₦${orderAmount}`);
    }
  } else {
    reasons.push('missing amount on alert or order');
  }

  let timeScore = 0;
  if (Number.isFinite(alertTs) && Number.isFinite(orderTs)) {
    const deltaMs = Math.abs(alertTs - orderTs);
    if (deltaMs > windowMs) {
      flags.outsideWindow = true;
      timeScore = 0;
      reasons.push('outside match window');
    } else {
      timeScore = 1 - deltaMs / windowMs;
      reasons.push(`time proximity ${(timeScore * 100).toFixed(0)}%`);
    }
  }

  let nameScore = 0;
  let nameWeightUsed = 0;
  const sim = nameSimilarity(sender, customer);
  if (sim != null) {
    nameScore = sim;
    nameWeightUsed = NAME_WEIGHT;
    reasons.push(sim >= 0.85 ? 'strong name match' : sim >= 0.5 ? 'weak name match' : 'name mismatch');
  } else {
    reasons.push('no name signal');
  }

  // Redistribute name weight to amount+time when no name signal
  const amountW = nameWeightUsed === 0 ? AMOUNT_WEIGHT + NAME_WEIGHT * 0.5 : AMOUNT_WEIGHT;
  const timeW = nameWeightUsed === 0 ? TIME_WEIGHT + NAME_WEIGHT * 0.5 : TIME_WEIGHT;

  let score = amountW * amountScore + timeW * timeScore + nameWeightUsed * nameScore;

  if (provider === 'unknown') {
    // Cap well below AUTO_THRESHOLD so generic parses never auto-match.
    score = Math.min(score, GENERIC_SCORE_CAP) * 0.85;
    flags.genericParser = true;
    reasons.push('generic parser confidence cap');
  }

  score = Math.round(clamp01(score) * 100) / 100;

  return { score, reasons, amountDelta, flags };
}

/**
 * Decide auto vs review from scored candidates.
 * Never auto-matches generic/unknown provider parses — staff must confirm.
 * @param {Array<{ order: object, score: number, reasons: string[], flags: object }>} scored
 * @param {{ allowAuto?: boolean, provider?: string }} [opts]
 */
function decideMatchOutcome(scored, opts = {}) {
  const usable = (scored || []).filter((c) => !c.flags?.outsideWindow);
  if (!usable.length) {
    return { decision: 'unmatchable', top: null, candidates: scored || [] };
  }

  const sorted = [...usable].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const tied = sorted.filter((c) => Math.abs(c.score - top.score) <= TIE_DELTA && c.score >= AUTO_THRESHOLD);
  const provider = String(opts.provider || '').toLowerCase();
  const allowAuto =
    opts.allowAuto !== false &&
    provider !== 'unknown' &&
    !top.flags?.genericParser;

  if (top.flags?.partial || top.flags?.overpayment) {
    return { decision: 'pending_review', top, candidates: sorted, reviewReason: top.flags.partial ? 'partial_payment' : 'overpayment' };
  }

  if (!allowAuto && top.score >= AUTO_THRESHOLD) {
    return {
      decision: 'pending_review',
      top,
      candidates: sorted,
      reviewReason: provider === 'unknown' || top.flags?.genericParser ? 'generic_parser' : 'auto_disabled'
    };
  }

  if (allowAuto && top.score >= AUTO_THRESHOLD && tied.length === 1) {
    return { decision: 'auto_matched', top, candidates: sorted };
  }

  if (top.score >= AUTO_THRESHOLD && tied.length > 1) {
    return { decision: 'pending_review', top, candidates: sorted, reviewReason: 'ambiguous_tie' };
  }

  return { decision: 'pending_review', top, candidates: sorted, reviewReason: 'low_confidence' };
}

module.exports = {
  scoreMatch,
  decideMatchOutcome,
  nameSimilarity,
  AUTO_THRESHOLD,
  TIE_DELTA,
  AMOUNT_TOLERANCE_NAIRA,
  GENERIC_SCORE_CAP
};
