
-- Add room_mode column to watch_rooms (chat or call)
ALTER TABLE public.watch_rooms 
ADD COLUMN room_mode text NOT NULL DEFAULT 'chat';

-- Add muted_by_host column to watch_room_participants for host-muted state
ALTER TABLE public.watch_room_participants 
ADD COLUMN muted_by_host boolean NOT NULL DEFAULT false;
