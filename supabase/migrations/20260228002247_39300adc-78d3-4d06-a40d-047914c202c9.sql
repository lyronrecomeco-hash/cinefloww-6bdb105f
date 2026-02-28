-- Add attachment_url column to ticket_messages
ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS attachment_url text;

-- Create storage bucket for ticket attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload to ticket-attachments
CREATE POLICY "Authenticated users upload ticket attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments');

-- Anyone can read ticket attachments (public bucket)
CREATE POLICY "Public read ticket attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ticket-attachments');

-- Admins can delete ticket attachments
CREATE POLICY "Admins delete ticket attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'ticket-attachments' AND EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
));