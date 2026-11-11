const { validateOrderTicketQuantities } = require('./ticketQuantityRules');

function validateGuestContact({ customerName, customerPhone, customerEmail }) {
  const name = customerName ? String(customerName).trim() : '';
  const phone = customerPhone ? String(customerPhone).trim() : '';
  const email = customerEmail ? String(customerEmail).trim() : '';
  if (!name || name.length < 2) return 'Name is required';
  if (!phone || phone.replace(/\D/g, '').length < 7) return 'A valid phone number is required';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'A valid email is required';
  return null;
}

function prepareOrderLines(items, menuMap, { activeMode, ticketsSoldMap } = {}) {
  const list = Array.isArray(items) ? items : [];
  const menuItemIds = [...new Set(list.map((item) => item.menuItemId).filter(Boolean))];
  if (menuItemIds.length === 0) {
    return { ok: false, status: 400, error: 'Valid menu item IDs are required' };
  }

  const missingIds = menuItemIds.filter((id) => !menuMap[id]);
  if (missingIds.length > 0) {
    return {
      ok: false,
      status: 400,
      error: 'One or more items are not on the menu or do not belong to this business'
    };
  }

  const inviteOnlyIds = menuItemIds.filter((id) => menuMap[id]?.pricing_type === 'invite_only');
  if (inviteOnlyIds.length > 0) {
    return {
      ok: false,
      status: 403,
      error: 'One or more tickets are invite-only. Ask the organizer to send you an invite link.'
    };
  }

  if (activeMode === 'ticketing') {
    const ticketRuleErr = validateOrderTicketQuantities(menuMap, list, ticketsSoldMap || {});
    if (ticketRuleErr) return { ok: false, status: 400, error: ticketRuleErr };
  }

  let totalAmount = 0;
  let prepWeightedSum = 0;
  let prepWeightedQty = 0;
  const lines = [];

  for (const item of list) {
    const menuItem = menuMap[item.menuItemId];
    if (!menuItem) continue;
    const qty = Math.min(99, Math.max(1, parseInt(item.quantity, 10) || 1));
    const price = Number(menuItem.price) || 0;
    totalAmount += price * qty;

    const itemPrep = Number(menuItem.estimated_prep_time);
    const safeItemPrep = Number.isFinite(itemPrep) ? itemPrep : 15;
    prepWeightedSum += safeItemPrep * qty;
    prepWeightedQty += qty;

    lines.push({
      menuItemId: item.menuItemId,
      quantity: qty,
      price,
      specialNotes: typeof item.specialNotes === 'string' ? item.specialNotes.slice(0, 500) : null,
      name: menuItem.name || 'Unknown Item'
    });
  }

  if (lines.length === 0) {
    return { ok: false, status: 400, error: 'Order must have at least one item' };
  }

  return {
    ok: true,
    lines,
    totalAmount,
    isFreeOrder: totalAmount <= 0,
    estimatedPrepTime: prepWeightedQty > 0 ? Math.round(prepWeightedSum / prepWeightedQty) : 15
  };
}

module.exports = { validateGuestContact, prepareOrderLines };
