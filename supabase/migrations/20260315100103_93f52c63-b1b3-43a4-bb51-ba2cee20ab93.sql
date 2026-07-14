
-- Remove overly permissive policy that lets everyone see ALL replays (including private)
DROP POLICY IF EXISTS "Everyone can view replay info" ON public.replay_videos;

-- Add policy for managers to manage replays of duels they managed
CREATE POLICY "Managers can manage their duel replays"
ON public.replay_videos
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.duels d
    WHERE d.id = replay_videos.duel_id
    AND d.manager_id = auth.uid()
  )
);

-- Add policy for concert ticket holders to view replays of concerts they attended (free access)
CREATE POLICY "Ticket holders can view event replays"
ON public.replay_videos
FOR SELECT
TO authenticated
USING (
  -- Duel ticket holders
  (duel_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.duel_tickets dt WHERE dt.duel_id = replay_videos.duel_id AND dt.user_id = auth.uid()
  ))
  OR
  -- Concert ticket holders
  (concert_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.concert_tickets ct WHERE ct.concert_id = replay_videos.concert_id AND ct.user_id = auth.uid()
  ))
);

-- Add column for artist_id on replay_videos to track who owns concert replays
ALTER TABLE public.replay_videos ADD COLUMN IF NOT EXISTS artist_id uuid;
