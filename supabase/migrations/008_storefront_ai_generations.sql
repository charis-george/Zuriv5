-- Track how many times a business has used AI storefront generation.
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS storefront_ai_generations INTEGER NOT NULL DEFAULT 0;

