-- Add plan/tier column to businesses
-- Plans: free | basic | advanced | zuri_plus | enterprise
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free', 'basic', 'advanced', 'zuri_plus', 'enterprise'));

COMMENT ON COLUMN businesses.plan IS 'Subscription tier: free, basic, advanced, zuri_plus, enterprise';
