-- Concurrency-safe receipt delivery: in-flight lock + attempt counter for retries.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS receipt_sending_at TIMESTAMPTZ;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS receipt_send_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_receipt_pending
  ON public.orders (created_at DESC)
  WHERE payment_status = 'paid' AND receipt_sent_at IS NULL;
