
CREATE POLICY "users read own food photos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'food-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users upload own food photos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'food-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users delete own food photos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'food-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
