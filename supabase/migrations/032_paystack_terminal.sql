-- Paystack Terminal support for Zuri Assist (push pending orders to a linked terminal).

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS paystack_terminal_id TEXT;

COMMENT ON COLUMN public.businesses.paystack_terminal_id IS
  'Paystack Terminal device ID used by Zuri Assist to push in-person charges.';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS terminal_offline_reference TEXT;

COMMENT ON COLUMN public.orders.terminal_offline_reference IS
  'Paystack payment-request offline_reference for a Terminal push; used to reconcile webhooks.';

CREATE INDEX IF NOT EXISTS idx_orders_terminal_offline_reference
  ON public.orders (terminal_offline_reference)
  WHERE terminal_offline_reference IS NOT NULL;
