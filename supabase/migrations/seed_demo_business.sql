-- One-time seed: demo business login (demo@zuri.com / demo123)
-- Run in Supabase SQL Editor if this account does not exist yet.

INSERT INTO public.businesses (id, name, email, password, phone, address)
SELECT
  'a0000000-0000-4000-8000-0000000000a1'::uuid,
  'Demo Business',
  'demo@zuri.com',
  '$2a$10$bPIkPJPBvlB0sU935FFrjOG03cQKIwcVw7vkY3VJqcBdOIEIrN7ou',
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.businesses WHERE email = 'demo@zuri.com'
);
