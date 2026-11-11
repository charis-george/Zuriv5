-- Track AI menu digitization usage per business (quota + token cost monitoring).
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS menu_digitize_uses INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS menu_digitize_tokens_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS menu_digitize_last_at TIMESTAMPTZ;
