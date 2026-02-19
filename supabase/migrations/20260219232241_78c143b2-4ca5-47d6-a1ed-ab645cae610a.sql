
-- Fix infinite recursion in watch_room_participants SELECT policy
-- The current policy references watch_room_participants inside itself, causing recursion

DROP POLICY IF EXISTS "Read room participants" ON public.watch_room_participants;

-- New policy: users can read participants if they are a participant in that room (using user_profiles directly)
CREATE POLICY "Read room participants" 
ON public.watch_room_participants 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
    AND up.id = watch_room_participants.profile_id
  )
  OR
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
    AND up.id IN (
      SELECT wrp.profile_id FROM public.watch_room_participants wrp
      WHERE wrp.room_id = watch_room_participants.room_id
    )
  )
);
