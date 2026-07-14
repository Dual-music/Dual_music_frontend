-- Add views_count column to blogs if not exists
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;

-- Create artist followers table
CREATE TABLE IF NOT EXISTS public.artist_followers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID NOT NULL,
  follower_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(artist_id, follower_id)
);

-- Enable RLS on artist_followers
ALTER TABLE public.artist_followers ENABLE ROW LEVEL SECURITY;

-- Policies for artist_followers
CREATE POLICY "Anyone can view followers" ON public.artist_followers FOR SELECT USING (true);
CREATE POLICY "Users can follow artists" ON public.artist_followers FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON public.artist_followers FOR DELETE USING (auth.uid() = follower_id);

-- Create duel chat messages table
CREATE TABLE IF NOT EXISTS public.duel_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  duel_id UUID NOT NULL REFERENCES public.duels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_moderated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on duel_chat_messages
ALTER TABLE public.duel_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for duel_chat_messages
CREATE POLICY "Anyone can view non-moderated messages" ON public.duel_chat_messages FOR SELECT USING (is_moderated = false);
CREATE POLICY "Authenticated users can post messages" ON public.duel_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can moderate messages" ON public.duel_chat_messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Enable realtime for duel_chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.duel_chat_messages;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_artist_followers_artist ON public.artist_followers(artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_followers_follower ON public.artist_followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_duel_chat_messages_duel ON public.duel_chat_messages(duel_id);
CREATE INDEX IF NOT EXISTS idx_blogs_views ON public.blogs(views_count DESC);