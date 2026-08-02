/**
 * Venue account status helpers.
 */

const ACTIVE_STATUSES = new Set(['active', 'under_review']);

function normalizeAccountStatus(value) {
  const v = String(value || 'active').toLowerCase();
  if (v === 'under_review' || v === 'suspended' || v === 'disabled') return v;
  return 'active';
}

function canAcceptOrders(status) {
  return ACTIVE_STATUSES.has(normalizeAccountStatus(status));
}

function canAcceptPayments(status) {
  return normalizeAccountStatus(status) === 'active';
}

function statusMessage(status) {
  const s = normalizeAccountStatus(status);
  if (s === 'suspended') return 'This venue is temporarily suspended. Please contact the venue or ZURI support.';
  if (s === 'disabled') return 'This venue is no longer available on ZURI.';
  if (s === 'under_review') return 'This venue is under review. Ordering may be limited — please try again shortly.';
  return null;
}

module.exports = {
  ACTIVE_STATUSES,
  normalizeAccountStatus,
  canAcceptOrders,
  canAcceptPayments,
  statusMessage
};
