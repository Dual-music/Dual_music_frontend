-- ============================================
-- DUAL MUSIC - DATABASE SCHEMA
-- Complete SQL for creating all tables
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'artist', 'fan', 'manager');
CREATE TYPE public.duel_status AS ENUM ('upcoming', 'live', 'ended');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_role app_role, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================
-- TABLES
-- ============================================

-- Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  bio text,
  phone text,
  country_code text DEFAULT 'FR',
  phone_country_code text DEFAULT '+33',
  social_links jsonb DEFAULT '{}'::jsonb,
  is_public boolean DEFAULT false,
  is_banned boolean DEFAULT false,
  banned_at timestamptz,
  banned_reason text,
  referral_code text UNIQUE,
  referred_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Referrals table
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id),
  referred_id uuid NOT NULL REFERENCES auth.users(id),
  referral_code text NOT NULL,
  status text DEFAULT 'pending',
  reward_claimed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(referrer_id, referred_id)
);

-- User roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

-- User wallets table
CREATE TABLE public.user_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Artist profiles table
CREATE TABLE public.artist_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_name text,
  bio text,
  avatar_url text,
  cover_image_url text,
  social_links jsonb DEFAULT '{}'::jsonb,
  is_public boolean DEFAULT true,
  total_earnings numeric DEFAULT 0,
  available_balance numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Manager profiles table
CREATE TABLE public.manager_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  bio text,
  experience text,
  avatar_url text,
  is_public boolean DEFAULT true,
  commission_rate numeric DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Artist requests table
CREATE TABLE public.artist_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description text NOT NULL,
  social_links jsonb DEFAULT '{}'::jsonb,
  justification_document_url text,
  status text DEFAULT 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Manager requests table
CREATE TABLE public.manager_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bio text NOT NULL,
  experience text NOT NULL,
  status text DEFAULT 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Artist followers table
CREATE TABLE public.artist_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(artist_id, follower_id)
);

-- Duels table
CREATE TABLE public.duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist1_id uuid NOT NULL REFERENCES auth.users(id),
  artist2_id uuid NOT NULL REFERENCES auth.users(id),
  manager_id uuid REFERENCES auth.users(id),
  status duel_status DEFAULT 'upcoming',
  scheduled_time timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  winner_id uuid REFERENCES auth.users(id),
  room_id text,
  created_at timestamptz DEFAULT now()
);

-- Duel requests table
CREATE TABLE public.duel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id),
  opponent_id uuid NOT NULL REFERENCES auth.users(id),
  proposed_date timestamptz,
  message text,
  manager_id uuid REFERENCES auth.users(id),
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Duel votes table
CREATE TABLE public.duel_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid REFERENCES duels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  artist_id uuid NOT NULL REFERENCES auth.users(id),
  amount numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Duel chat messages table
CREATE TABLE public.duel_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  parent_id uuid REFERENCES duel_chat_messages(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_moderated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Concert chat messages table
CREATE TABLE public.concert_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  parent_id uuid REFERENCES concert_chat_messages(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_moderated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Virtual gifts table
CREATE TABLE public.virtual_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now()
);

-- User gifts (purchased gifts)
CREATE TABLE public.user_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  gift_id uuid REFERENCES virtual_gifts(id),
  quantity integer DEFAULT 1,
  purchased_at timestamptz DEFAULT now()
);

-- Gift transactions table
CREATE TABLE public.gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid REFERENCES duels(id) ON DELETE SET NULL,
  from_user_id uuid NOT NULL REFERENCES auth.users(id),
  to_user_id uuid NOT NULL REFERENCES auth.users(id),
  gift_id uuid REFERENCES virtual_gifts(id),
  created_at timestamptz DEFAULT now()
);

-- Concerts table
CREATE TABLE public.concerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_name text NOT NULL,
  title text NOT NULL,
  description text,
  scheduled_date timestamptz NOT NULL,
  scheduled_time text NOT NULL,
  location text NOT NULL,
  ticket_price numeric NOT NULL,
  max_tickets integer,
  image_url text,
  stream_url text,
  status text DEFAULT 'upcoming',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Concert tickets table
CREATE TABLE public.concert_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  price_paid numeric NOT NULL,
  ticket_code text NOT NULL,
  qr_code_url text,
  validated_at timestamptz,
  validated_by uuid REFERENCES auth.users(id),
  purchased_at timestamptz DEFAULT now()
);

-- Artist concerts table
CREATE TABLE public.artist_concerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  description text,
  scheduled_date timestamptz NOT NULL,
  ticket_price numeric DEFAULT 0,
  max_tickets integer,
  tickets_sold integer DEFAULT 0,
  revenue numeric DEFAULT 0,
  status text DEFAULT 'upcoming',
  stream_url text,
  cover_image_url text,
  created_at timestamptz DEFAULT now()
);

-- Replay videos table
CREATE TABLE public.replay_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid REFERENCES duels(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  video_url text NOT NULL,
  thumbnail_url text,
  duration text NOT NULL,
  recorded_date timestamptz NOT NULL,
  views_count integer DEFAULT 0,
  is_premium boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Replay access table
CREATE TABLE public.replay_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_id uuid NOT NULL REFERENCES replay_videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  unlocked_at timestamptz DEFAULT now()
);

-- Lifestyle videos table
CREATE TABLE public.lifestyle_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES auth.users(id),
  artist_name text NOT NULL,
  title text NOT NULL,
  description text,
  video_url text NOT NULL,
  thumbnail_url text,
  duration text NOT NULL,
  views_count integer DEFAULT 0,
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Blogs table
CREATE TABLE public.blogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id),
  author_name text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  excerpt text,
  image_url text,
  category text DEFAULT 'news',
  published boolean DEFAULT false,
  views_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Comments table
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  content text NOT NULL,
  likes_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Comment likes table
CREATE TABLE public.comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Video interactions table
CREATE TABLE public.video_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES lifestyle_videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  interaction_type text NOT NULL,
  comment_text text,
  created_at timestamptz DEFAULT now()
);

-- Fan subscriptions table
CREATE TABLE public.fan_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  subscription_type text DEFAULT 'free',
  stripe_subscription_id text,
  stripe_customer_id text,
  is_active boolean DEFAULT true,
  price_amount numeric DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Withdrawal requests table
CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  amount numeric NOT NULL,
  payment_method text,
  payment_details jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending',
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Gift conversions table
CREATE TABLE public.gift_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  gift_value numeric NOT NULL,
  cash_value numeric NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Duel ads table
CREATE TABLE public.duel_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid REFERENCES duels(id) ON DELETE SET NULL,
  content_url text NOT NULL,
  duration_seconds integer DEFAULT 30,
  scheduled_time timestamptz,
  played_at timestamptz,
  created_by uuid REFERENCES auth.users(id)
);

-- ============================================
-- VIEWS
-- ============================================

CREATE OR REPLACE VIEW public.artist_leaderboard AS
SELECT 
  ap.user_id,
  ap.stage_name,
  ap.avatar_url,
  p.full_name,
  COALESCE(SUM(dv.amount), 0) as total_votes,
  COALESCE(COUNT(DISTINCT gt.id), 0) as total_gifts,
  COALESCE(COUNT(DISTINCT CASE WHEN d.winner_id = ap.user_id THEN d.id END), 0) as total_wins,
  COALESCE(SUM(dv.amount), 0) + COALESCE(COUNT(DISTINCT gt.id), 0) * 10 + COALESCE(COUNT(DISTINCT CASE WHEN d.winner_id = ap.user_id THEN d.id END), 0) * 100 as score
FROM artist_profiles ap
LEFT JOIN profiles p ON p.id = ap.user_id
LEFT JOIN duel_votes dv ON dv.artist_id = ap.user_id
LEFT JOIN gift_transactions gt ON gt.to_user_id = ap.user_id
LEFT JOIN duels d ON d.winner_id = ap.user_id
GROUP BY ap.user_id, ap.stage_name, ap.avatar_url, p.full_name
ORDER BY score DESC;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_artist_profiles_updated_at
  BEFORE UPDATE ON artist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_manager_profiles_updated_at
  BEFORE UPDATE ON manager_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_concerts_updated_at
  BEFORE UPDATE ON concerts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blogs_updated_at
  BEFORE UPDATE ON blogs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ENABLE REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.duel_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.duel_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE duels ENABLE ROW LEVEL SECURITY;
ALTER TABLE duel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE duel_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE duel_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE virtual_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE concerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concert_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_concerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE replay_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE replay_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifestyle_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE duel_ads ENABLE ROW LEVEL SECURITY;

-- RLS Policies (examples - customize as needed)

-- Profiles
CREATE POLICY "Public profiles viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE USING (has_role('admin', auth.uid()));
CREATE POLICY "Admins can delete profiles" ON profiles FOR DELETE USING (has_role('admin', auth.uid()));

-- User roles
CREATE POLICY "Users can view own roles" ON user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON user_roles FOR ALL USING (has_role('admin', auth.uid()));

-- Duels
CREATE POLICY "Everyone can view duels" ON duels FOR SELECT USING (true);
CREATE POLICY "Admins and managers can create duels" ON duels FOR INSERT WITH CHECK (has_role('admin', auth.uid()) OR has_role('manager', auth.uid()));
CREATE POLICY "Participants can update duels" ON duels FOR UPDATE USING (auth.uid() IN (artist1_id, artist2_id, manager_id) OR has_role('admin', auth.uid()));
CREATE POLICY "Admins can delete duels" ON duels FOR DELETE USING (has_role('admin', auth.uid()));

-- Concerts
CREATE POLICY "Everyone can view concerts" ON concerts FOR SELECT USING (true);
CREATE POLICY "Admins can manage concerts" ON concerts FOR ALL USING (has_role('admin', auth.uid()));
CREATE POLICY "Admins can delete concerts" ON concerts FOR DELETE USING (has_role('admin', auth.uid()));

-- Blogs
CREATE POLICY "Everyone can view published blogs" ON blogs FOR SELECT USING (published = true);
CREATE POLICY "Admins can manage blogs" ON blogs FOR ALL USING (has_role('admin', auth.uid()) OR has_role('moderator', auth.uid()));
CREATE POLICY "Admins can delete blogs" ON blogs FOR DELETE USING (has_role('admin', auth.uid()));

-- Comments
CREATE POLICY "Everyone can view comments" ON comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can post" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON comments FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can delete comments" ON comments FOR DELETE USING (has_role('admin', auth.uid()));

-- Virtual gifts
CREATE POLICY "Everyone can view gifts" ON virtual_gifts FOR SELECT USING (true);
CREATE POLICY "Admins can manage gifts" ON virtual_gifts FOR ALL USING (has_role('admin', auth.uid()));

-- Notifications
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System can create notifications" ON notifications FOR INSERT WITH CHECK (true);

-- Artist followers
CREATE POLICY "Anyone can view followers" ON artist_followers FOR SELECT USING (true);
CREATE POLICY "Users can follow artists" ON artist_followers FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON artist_followers FOR DELETE USING (auth.uid() = follower_id);

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default virtual gifts
INSERT INTO virtual_gifts (name, price, image_url) VALUES
('Rose', 10, '🌹'),
('Coeur', 25, '❤️'),
('Étoile', 50, '⭐'),
('Diamant', 100, '💎'),
('Couronne', 250, '👑'),
('Fusée', 500, '🚀'),
('Trophée', 1000, '🏆');
