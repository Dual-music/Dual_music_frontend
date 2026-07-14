-- Allow artists to see replays where they are the artist
CREATE POLICY "Artists can view their replays"
ON public.replay_videos
FOR ALL
TO authenticated
USING (auth.uid() = artist_id);

-- Allow artists to see replays from duels they participated in
CREATE POLICY "Duel artists can view their replays"
ON public.replay_videos
FOR SELECT
TO authenticated
USING (
  duel_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.duels d
    WHERE d.id = replay_videos.duel_id
    AND (d.artist1_id = auth.uid() OR d.artist2_id = auth.uid())
  )
);