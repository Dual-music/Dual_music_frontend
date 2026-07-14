
CREATE TABLE public.season_winners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID NOT NULL REFERENCES public.leaderboard_seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rank_position INTEGER NOT NULL,
  reward_status TEXT NOT NULL DEFAULT 'pending',
  distributed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(season_id, rank_position)
);

ALTER TABLE public.season_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view season winners"
ON public.season_winners FOR SELECT USING (true);

CREATE POLICY "Admins can manage season winners"
ON public.season_winners FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
