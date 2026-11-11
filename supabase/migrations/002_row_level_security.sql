-- RLS: the Node API uses the Supabase service role, which bypasses RLS.
-- anon and authenticated get no policies, so PostgREST cannot read or write these tables.

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zuri_network_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zuri_tap_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "businesses_service_all" ON public.businesses;
DROP POLICY IF EXISTS "categories_service_all" ON public.categories;
DROP POLICY IF EXISTS "menu_items_service_all" ON public.menu_items;
DROP POLICY IF EXISTS "zuri_network_customers_service_all" ON public.zuri_network_customers;
DROP POLICY IF EXISTS "orders_service_all" ON public.orders;
DROP POLICY IF EXISTS "order_items_service_all" ON public.order_items;
DROP POLICY IF EXISTS "saved_cards_service_all" ON public.saved_cards;
DROP POLICY IF EXISTS "zuri_tap_users_service_all" ON public.zuri_tap_users;
DROP POLICY IF EXISTS "reservations_service_all" ON public.reservations;
DROP POLICY IF EXISTS "reviews_service_all" ON public.reviews;

-- Legacy policy names from older repo migrations (drop if present)
DROP POLICY IF EXISTS "Reservations viewable by service role" ON public.reservations;
DROP POLICY IF EXISTS "Reviews viewable by service role" ON public.reviews;

-- No replacement policies. Service role bypasses RLS. Anon stays denied.
