
-- Create requests table for user content requests
CREATE TABLE public.content_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id integer NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('movie', 'series')),
  title text NOT NULL,
  original_title text,
  poster_path text,
  backdrop_path text,
  overview text,
  release_date text,
  vote_average numeric DEFAULT 0,
  requester_name text NOT NULL,
  requester_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can create requests
CREATE POLICY "Anyone can create requests"
ON public.content_requests
FOR INSERT
WITH CHECK (true);

-- Anyone can read requests (to see their own)
CREATE POLICY "Anyone can read requests"
ON public.content_requests
FOR SELECT
USING (true);

-- Only admins can update requests
CREATE POLICY "Admins can update requests"
ON public.content_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete requests
CREATE POLICY "Admins can delete requests"
ON public.content_requests
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create watch progress table
CREATE TABLE public.watch_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  tmdb_id integer NOT NULL,
  content_type text NOT NULL,
  season integer,
  episode integer,
  progress_seconds numeric NOT NULL DEFAULT 0,
  duration_seconds numeric NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(device_id, tmdb_id, content_type, season, episode)
);

-- Enable RLS
ALTER TABLE public.watch_progress ENABLE ROW LEVEL SECURITY;

-- Anyone can manage their own watch progress (using device_id)
CREATE POLICY "Anyone can read watch progress"
ON public.watch_progress
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert watch progress"
ON public.watch_progress
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update watch progress"
ON public.watch_progress
FOR UPDATE
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_content_requests_updated_at
BEFORE UPDATE ON public.content_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_watch_progress_updated_at
BEFORE UPDATE ON public.watch_progress
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
