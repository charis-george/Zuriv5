/**
 * Shared business mode helpers — menu | ticketing | shop.
 */

function normalizeBusinessMode(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'ticketing' || v === 'ticket' || v === 'tickets' || v === 'event' || v === 'events') {
    return 'ticketing';
  }
  if (v === 'shop' || v === 'shops' || v === 'catalog' || v === 'retail' || v === 'store') {
    return 'shop';
  }
  return 'menu';
}

function isTicketingMode(mode) {
  return normalizeBusinessMode(mode) === 'ticketing';
}

function isShopMode(mode) {
  return normalizeBusinessMode(mode) === 'shop';
}

/** Catalog noun for UI: menu | catalog | tickets */
function catalogNounForMode(mode) {
  const m = normalizeBusinessMode(mode);
  if (m === 'ticketing') return 'tickets';
  if (m === 'shop') return 'catalog';
  return 'menu';
}

function catalogLabelForMode(mode) {
  const m = normalizeBusinessMode(mode);
  if (m === 'ticketing') return 'Tickets';
  if (m === 'shop') return 'Catalog';
  return 'Menu';
}

module.exports = {
  normalizeBusinessMode,
  isTicketingMode,
  isShopMode,
  catalogNounForMode,
  catalogLabelForMode
};
