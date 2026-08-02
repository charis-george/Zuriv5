/**
 * Zuri Assist SMS templates — keep wording here for A/B / localization later.
 */

function formatNaira(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? '');
  return n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function orderShortId(orderId) {
  if (!orderId) return '?';
  const s = String(orderId);
  return s.length > 8 ? s.slice(0, 8) : s;
}

const templates = {
  staffAutoMatch({ orderNumber, itemSummary, amount, channel }) {
    const items = itemSummary ? ` (${itemSummary})` : '';
    return `Zuri: Order #${orderNumber}${items} — ₦${formatNaira(amount)} confirmed paid via ${channel || 'SMS'}. Marked PAID on dashboard.`;
  },

  staffAmbiguous({ amount }) {
    return `Zuri: ₦${formatNaira(amount)} payment received, unsure which order. Reply with order number, or check dashboard to confirm.`;
  },

  customerConfirm({ amount, businessName }) {
    return `Your payment of ₦${formatNaira(amount)} at ${businessName || 'the venue'} is confirmed. Your order is being prepared. — Zuri`;
  },

  staffNeedsAttention({ amount, reason }) {
    const why = reason ? ` (${reason})` : '';
    return `Zuri: ₦${formatNaira(amount)} alert needs attention${why}. Check dashboard Needs Attention queue.`;
  }
};

function renderStaffAutoMatch(vars) {
  return templates.staffAutoMatch({
    orderNumber: vars.orderNumber || orderShortId(vars.orderId),
    itemSummary: vars.itemSummary || '',
    amount: vars.amount,
    channel: vars.channel
  });
}

function renderStaffAmbiguous(vars) {
  return templates.staffAmbiguous({ amount: vars.amount });
}

function renderCustomerConfirm(vars) {
  return templates.customerConfirm({
    amount: vars.amount,
    businessName: vars.businessName
  });
}

function renderStaffNeedsAttention(vars) {
  return templates.staffNeedsAttention({
    amount: vars.amount,
    reason: vars.reason
  });
}

module.exports = {
  templates,
  formatNaira,
  orderShortId,
  renderStaffAutoMatch,
  renderStaffAmbiguous,
  renderCustomerConfirm,
  renderStaffNeedsAttention
};
