-- =============================================================================
-- ZURI demo account — run in Supabase SQL Editor (PostgreSQL)
-- =============================================================================
-- Login: demo@zuri.com / demo123
-- Business id is fixed so URLs and seeds stay stable.
--
-- Includes:
--   • businesses row: plan zuri_plus (dashboard shows "Zuri AI"), storefront theme
--   • categories + menu_items (demo menu)
--   • optional: reservations + one completed order (orders / order_items) for dashboard demos
--
-- Re-running: clears prior demo menu, orders, reservations, and reviews for THIS business only,
-- then re-seeds. If you changed the demo business id, replace all occurrences below.
--
-- Requires: run supabase/migrations (001_initial_schema, 002_row_level_security, optional 003 patches).
-- Tables: businesses, categories, menu_items, orders, order_items; reservations & reviews for DELETE + inserts in sections 5–6.
-- Comment out sections 5–6 if reservations / orders tables are missing or column names differ.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Remove old demo data for this business (order matters for FKs)
-- ---------------------------------------------------------------------------
DELETE FROM reviews WHERE business_id = 'a0000000-0000-4000-8000-0000000000a1'::uuid;
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE business_id = 'a0000000-0000-4000-8000-0000000000a1'::uuid
);
DELETE FROM orders WHERE business_id = 'a0000000-0000-4000-8000-0000000000a1'::uuid;
DELETE FROM reservations WHERE business_id = 'a0000000-0000-4000-8000-0000000000a1'::uuid;
DELETE FROM menu_items WHERE business_id = 'a0000000-0000-4000-8000-0000000000a1'::uuid;
DELETE FROM categories WHERE business_id = 'a0000000-0000-4000-8000-0000000000a1'::uuid;

-- ---------------------------------------------------------------------------
-- 2) Demo business: Zuri AI tier + published storefront (JSONB)
--    Password: demo123  (bcrypt)
-- ---------------------------------------------------------------------------
INSERT INTO public.businesses (
  id,
  name,
  email,
  password,
  phone,
  address,
  plan,
  storefront_config,
  storefront_details
)
VALUES (
  'a0000000-0000-4000-8000-0000000000a1'::uuid,
  'Demo Kitchen (Zuri AI)',
  'demo@zuri.com',
  '$2a$10$bPIkPJPBvlB0sU935FFrjOG03cQKIwcVw7vkY3VJqcBdOIEIrN7ou',
  '+2348000000000',
  '12 Admiralty Way, Lagos',
  'zuri_plus',
  '{
    "brandColor": "#ffbd59",
    "backgroundTone": "warm",
    "heroOverlay": "gradient",
    "priceTextColor": "#ffbd59",
    "fontFamily": "sans",
    "titleSize": 32,
    "menuItemFontScale": 1,
    "layout": "grid",
    "gridStyle": "two_col",
    "showPhotos": true,
    "showDescriptions": true,
    "showCalories": false,
    "showRatings": false,
    "cardSize": 1,
    "cardImageShape": "rounded",
    "cardGap": 14,
    "cardRadius": 16,
    "dividerStyle": "soft",
    "pillShape": "pill",
    "sectionTitleTreatment": "underlined",
    "shadowDepth": "soft",
    "categoryStripBorder": true,
    "heroHeight": 220
  }'::jsonb,
  '{
    "name": "Demo Kitchen",
    "tagline": "Fresh plates, fast pickup — powered by ZURI.",
    "cuisineTags": ["African", "Grill", "Fast food"]
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  password = EXCLUDED.password,
  phone = EXCLUDED.phone,
  address = EXCLUDED.address,
  plan = EXCLUDED.plan,
  storefront_config = EXCLUDED.storefront_config,
  storefront_details = EXCLUDED.storefront_details;

-- If your businesses table has no storefront_* columns yet, run migration 013 first, or use this
-- slimmer upsert instead (comment block):
--
-- INSERT INTO public.businesses (id, name, email, password, phone, address, plan)
-- VALUES (
--   'a0000000-0000-4000-8000-0000000000a1'::uuid,
--   'Demo Kitchen (Zuri AI)',
--   'demo@zuri.com',
--   '$2a$10$bPIkPJPBvlB0sU935FFrjOG03cQKIwcVw7vkY3VJqcBdOIEIrN7ou',
--   '+2348000000000',
--   '12 Admiralty Way, Lagos',
--   'zuri_plus'
-- )
-- ON CONFLICT (id) DO UPDATE SET
--   name = EXCLUDED.name,
--   email = EXCLUDED.email,
--   password = EXCLUDED.password,
--   phone = EXCLUDED.phone,
--   address = EXCLUDED.address,
--   plan = EXCLUDED.plan;

-- ---------------------------------------------------------------------------
-- 3) Categories (fixed UUIDs)
-- ---------------------------------------------------------------------------
INSERT INTO public.categories (id, business_id, name, display_order) VALUES
  ('b0000001-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-0000000000a1'::uuid, 'Popular picks', 0),
  ('b0000001-0000-4000-8000-000000000002'::uuid, 'a0000000-0000-4000-8000-0000000000a1'::uuid, 'Sides & extras', 1),
  ('b0000001-0000-4000-8000-000000000003'::uuid, 'a0000000-0000-4000-8000-0000000000a1'::uuid, 'Drinks', 2);

-- ---------------------------------------------------------------------------
-- 4) Menu items
-- ---------------------------------------------------------------------------
INSERT INTO public.menu_items (
  id, business_id, category_id, name, description, price, cost, image_url, available, display_order
) VALUES
  ('c0000001-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-0000000000a1'::uuid, 'b0000001-0000-4000-8000-000000000001'::uuid,
   'Jollof & grilled chicken', 'Smoky rice with house marinade.', 4500, 1800, NULL, true, 0),
  ('c0000001-0000-4000-8000-000000000002'::uuid, 'a0000000-0000-4000-8000-0000000000a1'::uuid, 'b0000001-0000-4000-8000-000000000001'::uuid,
   'Afro grain bowl', 'Greens, grains, and pepper sauce.', 5200, 2100, NULL, true, 1),
  ('c0000001-0000-4000-8000-000000000003'::uuid, 'a0000000-0000-4000-8000-0000000000a1'::uuid, 'b0000001-0000-4000-8000-000000000002'::uuid,
   'Plantain wedges', 'Crispy sweet plantain.', 1200, 400, NULL, true, 0),
  ('c0000001-0000-4000-8000-000000000004'::uuid, 'a0000000-0000-4000-8000-0000000000a1'::uuid, 'b0000001-0000-4000-8000-000000000002'::uuid,
   'Chef''s salad', 'Ask staff for today''s mix.', 2500, 900, NULL, true, 1),
  ('c0000001-0000-4000-8000-000000000005'::uuid, 'a0000000-0000-4000-8000-0000000000a1'::uuid, 'b0000001-0000-4000-8000-000000000003'::uuid,
   'Chapman', 'House fruit punch.', 800, 200, NULL, true, 0),
  ('c0000001-0000-4000-8000-000000000006'::uuid, 'a0000000-0000-4000-8000-0000000000a1'::uuid, 'b0000001-0000-4000-8000-000000000003'::uuid,
   'Ginger zobo', 'Chilled hibiscus drink.', 700, 150, NULL, true, 1);

-- ---------------------------------------------------------------------------
-- 5) Demo reservations (table 014)
-- ---------------------------------------------------------------------------
INSERT INTO public.reservations (
  id, business_id, customer_name, customer_phone, party_size, reserved_for, notes, status
) VALUES
  (
    'd0000001-0000-4000-8000-000000000001'::uuid,
    'a0000000-0000-4000-8000-0000000000a1'::uuid,
    'Ada Demo',
    '+2348012345678',
    4,
    (NOW() AT TIME ZONE 'utc') + INTERVAL '3 days',
    'Window seat if possible',
    'confirmed'
  ),
  (
    'd0000001-0000-4000-8000-000000000002'::uuid,
    'a0000000-0000-4000-8000-0000000000a1'::uuid,
    'Chidi Test',
    '+2348099988877',
    2,
    (NOW() AT TIME ZONE 'utc') + INTERVAL '5 days',
    NULL,
    'requested'
  );

-- ---------------------------------------------------------------------------
-- 6) One completed order + line items (for orders tab / analytics smoke test)
-- ---------------------------------------------------------------------------
INSERT INTO public.orders (
  id,
  business_id,
  customer_name,
  customer_phone,
  customer_email,
  status,
  total_amount,
  estimated_prep_time,
  payment_status
) VALUES (
  'e0000001-0000-4000-8000-000000000001'::uuid,
  'a0000000-0000-4000-8000-0000000000a1'::uuid,
  'Demo Customer',
  '+2348000111222',
  'demo.customer@example.com',
  'completed',
  6900,
  20,
  'paid'
);

INSERT INTO public.order_items (id, order_id, menu_item_id, quantity, price, special_notes) VALUES
  ('f0000001-0000-4000-8000-000000000001'::uuid, 'e0000001-0000-4000-8000-000000000001'::uuid, 'c0000001-0000-4000-8000-000000000001'::uuid, 1, 4500, NULL),
  ('f0000001-0000-4000-8000-000000000002'::uuid, 'e0000001-0000-4000-8000-000000000001'::uuid, 'c0000001-0000-4000-8000-000000000003'::uuid, 2, 1200, 'Extra crispy');

COMMIT;

-- =============================================================================
-- Notes
-- =============================================================================
-- • PLAN_LABELS in the app maps zuri_plus → "Zuri AI" (Business dashboard + AI tab).
-- • /api/ai/* is still a stub in this repo; the tier unlocks the UI for when you wire AI.
-- • If ON CONFLICT (id) fails, your businesses PK may differ — use INSERT ... WHERE NOT EXISTS
--   from seed_demo_business.sql for the row, then UPDATE plan / storefront separately.
-- • If another businesses row already uses demo@zuri.com with a different id, fix the email
--   conflict first or adjust this script.
-- =============================================================================
