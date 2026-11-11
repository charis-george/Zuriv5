-- Payment gateway preference per business (customer checkout + payouts)
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'paystack'
    CHECK (payment_provider IN ('paystack', 'monnify'));

-- Track which provider collected payment for each order (for correct payout routing)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider TEXT
    CHECK (payment_provider IS NULL OR payment_provider IN ('paystack', 'monnify'));

-- Latest Monnify paymentReference for verify/retry (order id stays in redirect URL)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS monnify_payment_reference TEXT;
