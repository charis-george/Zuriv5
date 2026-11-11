-- One-time QR validation for paid ticket receipts.
-- Safe to run multiple times.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ticket_receipt_qr_token TEXT,
  ADD COLUMN IF NOT EXISTS ticket_receipt_qr_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ticket_receipt_qr_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ticket_receipt_qr_used_by UUID REFERENCES public.businesses (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_ticket_receipt_qr_token
  ON public.orders (ticket_receipt_qr_token)
  WHERE ticket_receipt_qr_token IS NOT NULL AND ticket_receipt_qr_token <> '';

CREATE INDEX IF NOT EXISTS idx_orders_ticket_receipt_qr_used_at
  ON public.orders (ticket_receipt_qr_used_at)
  WHERE ticket_receipt_qr_used_at IS NOT NULL;
