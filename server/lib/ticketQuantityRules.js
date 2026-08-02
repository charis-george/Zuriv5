/** Ticketing purchase rules enforced on order creation. */



function getTicketStep(item) {

  const g = Number(item.group_size ?? item.groupSize);

  return Number.isFinite(g) && g > 1 ? Math.floor(g) : 1;

}



function getMinTicketQty(item) {

  const step = getTicketStep(item);

  const minOrder = Number(item.min_per_order ?? item.minPerOrder);

  const minFromOrder = Number.isFinite(minOrder) && minOrder > 1 ? Math.floor(minOrder) : 1;

  return Math.max(minFromOrder, step);

}



function getTicketCapacity(item) {

  const cap = item.stock_on_hand ?? item.stockOnHand ?? item.totalCapacity;

  if (cap == null || cap === '') return null;

  const n = Number(cap);

  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;

}



function getTicketsRemaining(item, ticketsSold = 0) {

  const cap = getTicketCapacity(item);

  if (cap == null) return null;

  const sold = Number(ticketsSold);

  const soldCount = Number.isFinite(sold) && sold >= 0 ? Math.floor(sold) : 0;

  return Math.max(0, cap - soldCount);

}



function getMaxTicketQty(item, ticketsSold = 0) {

  const max = Number(item.max_per_user ?? item.maxPerUser);

  const perUser = Number.isFinite(max) && max >= 1 ? Math.floor(max) : null;

  const remaining = getTicketsRemaining(item, ticketsSold);

  let effective = perUser != null ? perUser : 99;

  if (remaining != null) effective = Math.min(effective, remaining);

  return effective;

}



function isValidTicketQty(qty, item, ticketsSold = 0) {

  if (qty <= 0) return false;

  const remaining = getTicketsRemaining(item, ticketsSold);

  if (remaining != null && remaining <= 0) return false;

  const step = getTicketStep(item);

  const min = getMinTicketQty(item);

  const max = getMaxTicketQty(item, ticketsSold);

  if (max <= 0) return false;

  if (qty < min) return false;

  if (qty > max) return false;

  if (step > 1 && qty % step !== 0) return false;

  return true;

}



function validateOrderTicketQuantities(menuMap, items, ticketsSoldMap = {}) {

  for (const item of items) {

    const menuItem = menuMap[item.menuItemId];

    if (!menuItem) continue;

    const sold = ticketsSoldMap[item.menuItemId] || 0;

    const qty = Math.min(99, Math.max(1, parseInt(item.quantity, 10) || 1));

    if (isValidTicketQty(qty, menuItem, sold)) continue;



    const name = menuItem.name || 'Ticket';

    const min = getMinTicketQty(menuItem);

    const max = getMaxTicketQty(menuItem, sold);

    const step = getTicketStep(menuItem);

    const remaining = getTicketsRemaining(menuItem, sold);



    if (remaining != null && remaining <= 0) {

      return `${name} is sold out.`;

    }

    if (qty < min) {

      return `${name} requires at least ${min} ticket${min === 1 ? '' : 's'} per order.`;

    }

    if (qty > max) {

      const perUser = Number(menuItem.max_per_user ?? menuItem.maxPerUser);

      if (Number.isFinite(perUser) && perUser >= 1 && qty > perUser) {

        return `${name} is limited to ${Math.floor(perUser)} ticket${perUser === 1 ? '' : 's'} per buyer.`;

      }

      if (remaining != null && qty > remaining) {

        return `Only ${remaining} ticket${remaining === 1 ? '' : 's'} left for ${name}.`;

      }

      return `${name} is limited to ${max} ticket${max === 1 ? '' : 's'} per order.`;

    }

    if (step > 1) {

      return `${name} must be purchased in groups of ${step}.`;

    }

    return `${name} has an invalid ticket quantity.`;

  }

  return null;

}



/**

 * Sum ticket quantities sold per menu item (non-cancelled orders, paid or awaiting payment).

 */

async function getTicketsSoldMap(supabase, businessId, menuItemIds = []) {

  if (!businessId || !menuItemIds.length) return {};



  const { data: orders, error: orderErr } = await supabase

    .from('orders')

    .select('id')

    .eq('business_id', businessId)

    .neq('status', 'cancelled')

    .in('payment_status', ['paid', 'pending']);



  if (orderErr || !orders?.length) return {};



  const orderIds = orders.map((o) => o.id).filter(Boolean);

  const { data: lines, error: lineErr } = await supabase

    .from('order_items')

    .select('menu_item_id,quantity')

    .in('order_id', orderIds)

    .in('menu_item_id', menuItemIds);



  if (lineErr || !lines?.length) return {};



  const map = {};

  for (const line of lines) {

    const id = line.menu_item_id;

    if (!id) continue;

    map[id] = (map[id] || 0) + (Number(line.quantity) || 0);

  }

  return map;

}



module.exports = {

  getTicketStep,

  getMinTicketQty,

  getMaxTicketQty,

  getTicketsRemaining,

  isValidTicketQty,

  validateOrderTicketQuantities,

  getTicketsSoldMap

};

