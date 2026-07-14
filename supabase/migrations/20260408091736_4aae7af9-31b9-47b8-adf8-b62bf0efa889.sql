
CREATE TABLE public.replay_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  replay_id UUID NOT NULL REFERENCES public.replay_videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(replay_id, user_id)
);

ALTER TABLE public.replay_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view replay likes" ON public.replay_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like replays" ON public.replay_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike replays" ON public.replay_likes FOR DELETE USING (auth.uid() = user_id);
