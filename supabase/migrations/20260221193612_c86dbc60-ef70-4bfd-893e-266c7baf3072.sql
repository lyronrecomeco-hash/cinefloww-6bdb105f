
-- Add is_kids flag to user_profiles for kids mode
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_kids boolean NOT NULL DEFAULT false;
