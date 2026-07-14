
-- Badges system for top donors
CREATE TABLE public.user_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  badge_type TEXT NOT NULL, -- 'top1_monthly', 'top3_monthly', 'top10_monthly', 'generous', 'super_generous', 'legendary_donor'
  badge_name TEXT NOT NULL,
  badge_icon TEXT NOT NULL, -- emoji or icon identifier
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  month_year TEXT, -- '2026-02' format for monthly badges
  is_active BOOLEAN DEFAULT true
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view badges" ON public.user_badges FOR SELECT USING (true);
CREATE POLICY "System can create badges" ON public.user_badges FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage badges" ON public.user_badges FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Lives system (TikTok-style spontaneous lives)
CREATE TABLE public.artist_lives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'live', -- 'live', 'ended'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  viewer_count INTEGER DEFAULT 0,
  room_id TEXT,
  stream_url TEXT,
  recording_url TEXT,
  is_replay_available BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.artist_lives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view lives" ON public.artist_lives FOR SELECT USING (true);
CREATE POLICY "Artists can manage their lives" ON public.artist_lives FOR ALL USING (auth.uid() = artist_id);

-- Live join requests from fans
CREATE TABLE public.live_join_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  live_id UUID NOT NULL REFERENCES public.artist_lives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'ended'
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.live_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view join requests" ON public.live_join_requests FOR SELECT USING (true);
CREATE POLICY "Users can create join requests" ON public.live_join_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Artists can update requests for their lives" ON public.live_join_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.artist_lives WHERE id = live_id AND artist_id = auth.uid())
  OR auth.uid() = user_id
);

-- Live chat messages
CREATE TABLE public.live_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  live_id UUID NOT NULL REFERENCES public.artist_lives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_moderated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view non-moderated live messages" ON public.live_chat_messages FOR SELECT USING (is_moderated = false);
CREATE POLICY "Authenticated users can post live messages" ON public.live_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can moderate live messages" ON public.live_chat_messages FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can delete their live messages" ON public.live_chat_messages FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for lives
ALTER PUBLICATION supabase_realtime ADD TABLE public.artist_lives;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_join_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_messages;
