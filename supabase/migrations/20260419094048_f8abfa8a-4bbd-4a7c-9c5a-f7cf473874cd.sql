-- Table for per-stream bans (lives, concerts, duels)
CREATE TABLE IF NOT EXISTS public.stream_bans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_type TEXT NOT NULL CHECK (stream_type IN ('live', 'concert', 'duel')),
  stream_id UUID NOT NULL,
  banned_user_id UUID NOT NULL,
  banned_by UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (stream_type, stream_id, banned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_stream_bans_lookup
  ON public.stream_bans (stream_type, stream_id, banned_user_id);

ALTER TABLE public.stream_bans ENABLE ROW LEVEL SECURITY;

-- Everyone can view bans (needed to enforce on client-side filters)
CREATE POLICY "Everyone can view stream bans"
ON public.stream_bans FOR SELECT
USING (true);

-- Live host (artist) can ban
CREATE POLICY "Live host can ban users"
ON public.stream_bans FOR INSERT
WITH CHECK (
  auth.uid() = banned_by
  AND (
    (stream_type = 'live' AND EXISTS (
      SELECT 1 FROM public.artist_lives al
      WHERE al.id = stream_bans.stream_id AND al.artist_id = auth.uid()
    ))
    OR (stream_type = 'concert' AND EXISTS (
      SELECT 1 FROM public.artist_concerts ac
      WHERE ac.id = stream_bans.stream_id AND ac.artist_id = auth.uid()
    ))
    OR (stream_type = 'duel' AND EXISTS (
      SELECT 1 FROM public.duels d
      WHERE d.id = stream_bans.stream_id
        AND (d.manager_id = auth.uid() OR d.artist1_id = auth.uid() OR d.artist2_id = auth.uid())
    ))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Hosts can unban
CREATE POLICY "Hosts can remove bans"
ON public.stream_bans FOR DELETE
USING (
  auth.uid() = banned_by
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (stream_type = 'live' AND EXISTS (
    SELECT 1 FROM public.artist_lives al
    WHERE al.id = stream_bans.stream_id AND al.artist_id = auth.uid()
  ))
  OR (stream_type = 'concert' AND EXISTS (
    SELECT 1 FROM public.artist_concerts ac
    WHERE ac.id = stream_bans.stream_id AND ac.artist_id = auth.uid()
  ))
  OR (stream_type = 'duel' AND EXISTS (
    SELECT 1 FROM public.duels d
    WHERE d.id = stream_bans.stream_id AND d.manager_id = auth.uid()
  ))
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_bans;