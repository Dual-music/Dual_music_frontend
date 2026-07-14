-- Allow artists to delete join requests for their own lives (used when kicking a guest
-- so the user returns to the initial state and can re-request to join).
CREATE POLICY "Artists can delete join requests for their lives"
ON public.live_join_requests
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.artist_lives
    WHERE artist_lives.id = live_join_requests.live_id
      AND artist_lives.artist_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own join requests"
ON public.live_join_requests
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);