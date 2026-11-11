-- Latest Paystack transaction reference per order (unique per checkout attempt; order id stays in metadata)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paystack_payment_reference TEXT;
