-- Create concerts table for Lives section
CREATE TABLE public.concerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_time TEXT NOT NULL,
  location TEXT NOT NULL,
  ticket_price NUMERIC NOT NULL,
  max_tickets INTEGER,
  image_url TEXT,
  stream_url TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'ended')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create concert tickets table
CREATE TABLE public.concert_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concert_id UUID NOT NULL REFERENCES public.concerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  purchased_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  price_paid NUMERIC NOT NULL,
  ticket_code TEXT NOT NULL UNIQUE
);

-- Create lifestyle videos table
CREATE TABLE public.lifestyle_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID NOT NULL,
  artist_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration TEXT NOT NULL,
  views_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create video interactions table (likes, comments)
CREATE TABLE public.video_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.lifestyle_videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('like', 'comment')),
  comment_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(video_id, user_id, interaction_type)
);

-- Create replay videos table
CREATE TABLE public.replay_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  duel_id UUID REFERENCES public.duels(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration TEXT NOT NULL,
  recorded_date TIMESTAMP WITH TIME ZONE NOT NULL,
  views_count INTEGER NOT NULL DEFAULT 0,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create replay access table
CREATE TABLE public.replay_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  replay_id UUID NOT NULL REFERENCES public.replay_videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  unlocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(replay_id, user_id)
);

-- Enable RLS
ALTER TABLE public.concerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concert_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifestyle_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replay_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replay_access ENABLE ROW LEVEL SECURITY;

-- RLS Policies for concerts
CREATE POLICY "Everyone can view concerts" ON public.concerts FOR SELECT USING (true);
CREATE POLICY "Admins can manage concerts" ON public.concerts FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for concert tickets
CREATE POLICY "Users can view their own tickets" ON public.concert_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can purchase tickets" ON public.concert_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for lifestyle videos
CREATE POLICY "Everyone can view lifestyle videos" ON public.lifestyle_videos FOR SELECT USING (true);
CREATE POLICY "Artists can manage their videos" ON public.lifestyle_videos FOR ALL USING (auth.uid() = artist_id OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for video interactions
CREATE POLICY "Everyone can view interactions" ON public.video_interactions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can interact" ON public.video_interactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their interactions" ON public.video_interactions FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for replay videos
CREATE POLICY "Everyone can view replay info" ON public.replay_videos FOR SELECT USING (true);
CREATE POLICY "Admins can manage replays" ON public.replay_videos FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for replay access
CREATE POLICY "Users can view their own access" ON public.replay_access FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can unlock replays" ON public.replay_access FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_concerts_status ON public.concerts(status);
CREATE INDEX idx_concerts_scheduled_date ON public.concerts(scheduled_date);
CREATE INDEX idx_concert_tickets_user ON public.concert_tickets(user_id);
CREATE INDEX idx_concert_tickets_concert ON public.concert_tickets(concert_id);
CREATE INDEX idx_lifestyle_videos_artist ON public.lifestyle_videos(artist_id);
CREATE INDEX idx_video_interactions_video ON public.video_interactions(video_id);
CREATE INDEX idx_video_interactions_user ON public.video_interactions(user_id);
CREATE INDEX idx_replay_access_user ON public.replay_access(user_id);
CREATE INDEX idx_replay_access_replay ON public.replay_access(replay_id);

-- Insert sample data for concerts
INSERT INTO public.concerts (artist_name, title, description, scheduled_date, scheduled_time, location, ticket_price, max_tickets, image_url, status) VALUES
('Afrobeat Legend', 'Concert Exclusif', 'Une soirée unique avec les plus grands hits afrobeat', '2025-12-15', '21:00', 'Virtual Stage', 5000, 1000, 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800', 'upcoming'),
('Hip Hop Star', 'Live Performance', 'Performance live explosive avec des invités surprises', '2025-12-20', '20:00', 'Main Arena', 7500, 500, 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800', 'upcoming'),
('Soul Diva', 'Intimate Show', 'Un spectacle intimiste et émouvant', '2025-12-25', '19:00', 'Cozy Hall', 10000, 300, 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800', 'upcoming');

-- Insert sample data for lifestyle videos
INSERT INTO public.lifestyle_videos (artist_id, artist_name, title, description, video_url, thumbnail_url, duration, views_count, likes_count, comments_count) VALUES
(gen_random_uuid(), 'DJ Kora', 'Studio Session', 'Dans les coulisses de mon dernier album', 'https://example.com/video1.mp4', 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400', '2:34', 45000, 12000, 234),
(gen_random_uuid(), 'MC Flow', 'Behind the Scenes', 'Préparation avant le concert', 'https://example.com/video2.mp4', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400', '1:45', 67000, 18000, 456),
(gen_random_uuid(), 'Soul Singer', 'Morning Routine', 'Ma routine matinale d''artiste', 'https://example.com/video3.mp4', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400', '3:12', 23000, 8000, 123),
(gen_random_uuid(), 'Rap Master', 'Freestyle Challenge', 'Freestyle improvisé avec mes potes', 'https://example.com/video4.mp4', 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=400', '2:05', 89000, 25000, 789),
(gen_random_uuid(), 'Afrobeat King', 'Dance Tutorial', 'Apprends mes pas de danse signature', 'https://example.com/video5.mp4', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400', '4:20', 34000, 11000, 234),
(gen_random_uuid(), 'Hip Hop Queen', 'Day in Life', 'Une journée dans ma vie d''artiste', 'https://example.com/video6.mp4', 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400', '5:30', 56000, 15000, 345);

-- Insert sample data for replay videos
INSERT INTO public.replay_videos (title, description, video_url, thumbnail_url, duration, recorded_date, views_count, is_premium) VALUES
('Battle Épique: MC Flow vs DJ Kora', 'Un duel légendaire qui a marqué l''histoire', 'https://example.com/replay1.mp4', 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800', '45:30', '2025-01-15 20:00:00+00', 125000, false),
('Clash des Titans: Round 2', 'Le retour tant attendu', 'https://example.com/replay2.mp4', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800', '52:15', '2025-02-10 21:00:00+00', 98000, true),
('Finale Saison 1', 'La grande finale avec des moments inoubliables', 'https://example.com/replay3.mp4', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800', '1:15:20', '2025-03-01 19:30:00+00', 234000, true),
('Street Battle: Urban Edition', 'Les meilleurs freestyles de rue', 'https://example.com/replay4.mp4', 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=800', '38:45', '2025-01-20 18:00:00+00', 67000, false),
('Afrobeat Special', 'Spéciale afrobeat avec invités surprise', 'https://example.com/replay5.mp4', 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800', '1:02:30', '2025-02-14 20:00:00+00', 145000, true),
('Nouveaux Talents', 'Découverte des artistes émergents', 'https://example.com/replay6.mp4', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400', '42:10', '2025-03-05 21:00:00+00', 54000, false);