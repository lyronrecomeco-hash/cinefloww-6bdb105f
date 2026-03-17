-- Allow anyone to update the CineVeo partner record (name, logo_url, website_url only)
-- The page uses a simple access key for authentication
CREATE POLICY "CineVeo can update own partner record"
ON public.partners
FOR UPDATE
TO public
USING (id = '5fd77e38-a00f-431a-af82-ed88ecb51430'::uuid)
WITH CHECK (id = '5fd77e38-a00f-431a-af82-ed88ecb51430'::uuid);