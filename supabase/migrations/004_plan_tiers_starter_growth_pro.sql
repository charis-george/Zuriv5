-- New plan tiers: starter, growth, pro (keep basic, advanced, zuri_plus, enterprise for backward compat)
-- Drop existing plan checks and re-add with new values

-- businesses.plan: allow new tiers
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_plan_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_plan_check
  CHECK (plan IN ('free', 'starter', 'growth', 'pro', 'basic', 'advanced', 'zuri_plus', 'enterprise'));

-- subscription_payments.plan: allow new tiers
ALTER TABLE subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_plan_check;
ALTER TABLE subscription_payments ADD CONSTRAINT subscription_payments_plan_check
  CHECK (plan IN ('starter', 'growth', 'pro', 'basic', 'advanced', 'zuri_plus'));

COMMENT ON COLUMN businesses.plan IS 'Subscription tier: free, starter, growth, pro, zuri_plus, enterprise (basic/advanced legacy)';
