-- One QR token per purchased ticket (supports multi-ticket orders).
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.order_ticket_qrs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  ticket_number INTEGER NOT NULL CHECK (ticket_number >= 1),
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES public.businesses (id) ON DELETE SET NULL,
  CONSTRAINT order_ticket_qrs_order_ticket_unique UNIQUE (order_id, ticket_number),
  CONSTRAINT order_ticket_qrs_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_order_ticket_qrs_order_id
  ON public.order_ticket_qrs (order_id);

CREATE INDEX IF NOT EXISTS idx_order_ticket_qrs_token
  ON public.order_ticket_qrs (token);

CREATE INDEX IF NOT EXISTS idx_order_ticket_qrs_used_at
  ON public.order_ticket_qrs (used_at)
  WHERE used_at IS NOT NULL;
