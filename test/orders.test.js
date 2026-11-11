const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGuestContact, prepareOrderLines } = require('../server/lib/orderDraft');

const jollof = {
  id: 'item-jollof',
  name: 'Jollof',
  price: 3500,
  estimated_prep_time: 20,
  pricing_type: 'fixed'
};
const water = {
  id: 'item-water',
  name: 'Water',
  price: 500,
  estimated_prep_time: 2,
  pricing_type: 'fixed'
};

test('guest contact is required before an order is accepted', () => {
  assert.equal(validateGuestContact({ customerName: 'A', customerPhone: '08012345678', customerEmail: 'a@b.co' }), 'Name is required');
  assert.equal(
    validateGuestContact({ customerName: 'Ada', customerPhone: '123', customerEmail: 'ada@example.com' }),
    'A valid phone number is required'
  );
  assert.equal(
    validateGuestContact({ customerName: 'Ada', customerPhone: '08012345678', customerEmail: 'not-an-email' }),
    'A valid email is required'
  );
  assert.equal(
    validateGuestContact({ customerName: 'Ada', customerPhone: '+234 801 234 5678', customerEmail: 'ada@example.com' }),
    null
  );
});

test('order lines use menu prices, clamp quantity, and reject unknown items', () => {
  const menu = { [jollof.id]: jollof, [water.id]: water };

  const missing = prepareOrderLines([{ menuItemId: 'nope', quantity: 1 }], menu, { activeMode: 'menu' });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 400);

  const empty = prepareOrderLines([], menu, { activeMode: 'menu' });
  assert.equal(empty.ok, false);

  const draft = prepareOrderLines(
    [
      { menuItemId: jollof.id, quantity: 2, specialNotes: 'no pepper' },
      { menuItemId: water.id, quantity: 0 }
    ],
    menu,
    { activeMode: 'menu' }
  );
  assert.equal(draft.ok, true);
  assert.equal(draft.totalAmount, 3500 * 2 + 500);
  assert.equal(draft.isFreeOrder, false);
  assert.equal(draft.lines[1].quantity, 1);
  assert.equal(draft.lines[0].specialNotes, 'no pepper');
  assert.equal(draft.estimatedPrepTime, Math.round((20 * 2 + 2) / 3));

  const huge = prepareOrderLines([{ menuItemId: water.id, quantity: 500 }], menu, { activeMode: 'menu' });
  assert.equal(huge.lines[0].quantity, 99);
});

test('invite-only tickets and sold-out quantities are rejected', () => {
  const vip = {
    id: 'vip',
    name: 'VIP',
    price: 15000,
    pricing_type: 'invite_only',
    max_per_user: 2
  };
  const ga = {
    id: 'ga',
    name: 'General',
    price: 5000,
    pricing_type: 'fixed',
    stock_on_hand: 1,
    max_per_user: 4
  };
  const menu = { vip, ga };

  const invite = prepareOrderLines([{ menuItemId: 'vip', quantity: 1 }], menu, { activeMode: 'ticketing' });
  assert.equal(invite.ok, false);
  assert.equal(invite.status, 403);

  const soldOut = prepareOrderLines([{ menuItemId: 'ga', quantity: 2 }], menu, {
    activeMode: 'ticketing',
    ticketsSoldMap: { ga: 1 }
  });
  assert.equal(soldOut.ok, false);
  assert.match(soldOut.error, /sold out|left/i);
});
