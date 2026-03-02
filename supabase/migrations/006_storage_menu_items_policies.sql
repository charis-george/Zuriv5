-- Storage RLS policies for menu item images (bucket: menu-items)
-- Run this in Supabase SQL Editor if uploads fail with "row-level security policy".
-- The bucket must already exist (create it in Dashboard → Storage → New bucket, name: menu-items, public).

-- Allow backend (service_role) to upload to menu-items bucket
CREATE POLICY "Allow service role to upload menu items"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'menu-items');

-- Allow public read so storefront can show images via getPublicUrl()
CREATE POLICY "Allow public read menu items"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'menu-items');
