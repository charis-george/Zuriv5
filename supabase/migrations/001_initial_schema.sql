-- ZURI — full database schema derived from server/routes and lib/* (Supabase / PostgreSQL).
-- Apply to an empty project, or ensure you are not duplicating objects already created manually.
-- Storage: create a public bucket named "menu-items" in Dashboard → Storage (used for logos + menu images).

-- Extensions (Supabase usually has these; safe to re-run)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- businesses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  plan TEXT NOT NULL DEFAULT 'free',

  paystack_public_key TEXT,
  paystack_recipient_code TEXT,

  bank_code TEXT,
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,

  logo_url TEXT,

  storefront_config JSONB,
  storefront_details JSONB
);

-- If `businesses` already existed with fewer columns, add missing ones before indexes.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS paystack_public_key TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS bank_code TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS storefront_config JSONB;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS storefront_details JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_email_lower ON public.businesses (LOWER(email));

COMMENT ON COLUMN public.businesses.plan IS 'free | starter | growth | pro | zuri_plus | enterprise | basic | advanced';
COMMENT ON COLUMN public.businesses.storefront_config IS 'Published storefront theme JSON (BusinessStorefrontCustomizer).';
COMMENT ON COLUMN public.businesses.storefront_details IS 'Published storefront details: name, tagline, cuisineTags.';

-- -----------------------------------------------------------------------------
-- categories & menu_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_categories_business_id ON public.categories (business_id);

CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  image_url TEXT,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_business_id ON public.menu_items (business_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON public.menu_items (category_id);

-- -----------------------------------------------------------------------------
-- Zuri Network (cross-business customer identity for order stats)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zuri_network_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-existing `zuri_network_customers` tables may omit columns; CREATE TABLE IF NOT EXISTS does nothing.
ALTER TABLE public.zuri_network_customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.zuri_network_customers ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.zuri_network_customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public.zuri_network_customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_zuri_network_customers_email_lower ON public.zuri_network_customers (LOWER(email));

-- -----------------------------------------------------------------------------
-- orders & order_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,

  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),

  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  estimated_prep_time INTEGER NOT NULL DEFAULT 15,

  payment_status TEXT NOT NULL DEFAULT 'pending',

  zuri_customer_id UUID REFERENCES public.zuri_network_customers (id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  payout_status TEXT,
  payout_reference TEXT,
  payout_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_business_id ON public.orders (business_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_zuri_customer_id ON public.orders (zuri_customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_payout_reference ON public.orders (payout_reference)
  WHERE payout_reference IS NOT NULL;

COMMENT ON COLUMN public.orders.payout_status IS 'Paystack transfer lifecycle: success | processing | failed | skipped | null';
COMMENT ON COLUMN public.orders.payout_reference IS 'Paystack transfer reference, e.g. payout_<orderId>';

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items (id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 99),
  price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  special_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON public.order_items (menu_item_id);

-- -----------------------------------------------------------------------------
-- saved_cards (Paystack authorization reuse; upsert on email + business_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  authorization_code TEXT NOT NULL,
  last4 TEXT,
  card_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saved_cards_email_business_unique UNIQUE (email, business_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_cards_business_email ON public.saved_cards (business_id, email);

-- -----------------------------------------------------------------------------
-- Zuri Tap (customer accounts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zuri_tap_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  zuri_customer_id UUID REFERENCES public.zuri_network_customers (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.zuri_tap_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.zuri_tap_users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE public.zuri_tap_users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.zuri_tap_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.zuri_tap_users ADD COLUMN IF NOT EXISTS zuri_customer_id UUID REFERENCES public.zuri_network_customers (id) ON DELETE SET NULL;
ALTER TABLE public.zuri_tap_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_zuri_tap_users_email_lower ON public.zuri_tap_users (LOWER(email));

-- -----------------------------------------------------------------------------
-- reservations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  party_size INTEGER NOT NULL DEFAULT 1 CHECK (party_size >= 1 AND party_size <= 50),
  reserved_for TIMESTAMPTZ NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reservations_business_id ON public.reservations (business_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations (status);
CREATE INDEX IF NOT EXISTS idx_reservations_reserved_for ON public.reservations (reserved_for);

-- -----------------------------------------------------------------------------
-- reviews (one per paid order)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_email TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reviews_order_unique UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_business_id ON public.reviews (business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON public.reviews (rating);
