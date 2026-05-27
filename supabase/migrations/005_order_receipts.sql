-- Add receipt delivery tracking so webhook/verify can be idempotent.
-- Safe to run multiple times.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS receipt_email_error TEXT;

