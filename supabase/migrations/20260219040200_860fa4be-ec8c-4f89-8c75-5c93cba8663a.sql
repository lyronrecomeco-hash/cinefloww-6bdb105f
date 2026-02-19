
-- Create content_reports table for user-submitted reports
CREATE TABLE public.content_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  page_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can submit reports
CREATE POLICY "Anyone can insert reports"
ON public.content_reports FOR INSERT
WITH CHECK (true);

-- Anyone can read their own reports (by visitor_id)
CREATE POLICY "Anyone can read own reports"
ON public.content_reports FOR SELECT
USING (true);

-- Admins can manage all reports
CREATE POLICY "Admins can manage reports"
ON public.content_reports FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for reports
ALTER PUBLICATION supabase_realtime ADD TABLE public.content_reports;
