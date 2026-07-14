-- Table for artist validation requests
CREATE TABLE public.artist_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  justification_document_url TEXT,
  description TEXT NOT NULL,
  social_links JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID
);

-- Table for manager validation requests
CREATE TABLE public.manager_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  experience TEXT NOT NULL,
  bio TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID
);

-- Table for duel requests between artists
CREATE TABLE public.duel_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'admin_pending', 'approved')),
  proposed_date TIMESTAMP WITH TIME ZONE,
  message TEXT,
  manager_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Extended artist profiles for public display
CREATE TABLE public.artist_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  cover_image_url TEXT,
  social_links JSONB DEFAULT '{}',
  is_public BOOLEAN DEFAULT true,
  total_earnings NUMERIC DEFAULT 0,
  available_balance NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Manager profiles for public display
CREATE TABLE public.manager_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  bio TEXT,
  experience TEXT,
  avatar_url TEXT,
  is_public BOOLEAN DEFAULT true,
  commission_rate NUMERIC DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Withdrawal requests for artists
CREATE TABLE public.withdrawal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  payment_method TEXT,
  payment_details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID
);

-- Fan subscriptions
CREATE TABLE public.fan_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_type TEXT NOT NULL DEFAULT 'free' CHECK (subscription_type IN ('free', 'premium', 'premium_plus')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);

-- Artist concerts management
CREATE TABLE public.artist_concerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  ticket_price NUMERIC NOT NULL DEFAULT 0,
  max_tickets INTEGER,
  tickets_sold INTEGER DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'ended', 'cancelled')),
  stream_url TEXT,
  cover_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Artist gift conversions
CREATE TABLE public.gift_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_value NUMERIC NOT NULL,
  cash_value NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Duel advertisements
CREATE TABLE public.duel_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  duel_id UUID REFERENCES public.duels(id) ON DELETE CASCADE,
  content_url TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 30,
  scheduled_time TIMESTAMP WITH TIME ZONE,
  played_at TIMESTAMP WITH TIME ZONE,
  created_by UUID
);

-- Enable RLS on all new tables
ALTER TABLE public.artist_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fan_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_concerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duel_ads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for artist_requests
CREATE POLICY "Users can view their own requests" ON public.artist_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own requests" ON public.artist_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all requests" ON public.artist_requests FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update requests" ON public.artist_requests FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for manager_requests
CREATE POLICY "Users can view their own manager requests" ON public.manager_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own manager requests" ON public.manager_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all manager requests" ON public.manager_requests FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update manager requests" ON public.manager_requests FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for duel_requests
CREATE POLICY "Artists can view their duel requests" ON public.duel_requests FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = opponent_id);
CREATE POLICY "Artists can create duel requests" ON public.duel_requests FOR INSERT WITH CHECK (auth.uid() = requester_id AND has_role(auth.uid(), 'artist'));
CREATE POLICY "Artists can update their duel requests" ON public.duel_requests FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = opponent_id);
CREATE POLICY "Admins can view all duel requests" ON public.duel_requests FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all duel requests" ON public.duel_requests FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for artist_profiles
CREATE POLICY "Public artist profiles are viewable" ON public.artist_profiles FOR SELECT USING (is_public = true);
CREATE POLICY "Artists can view their own profile" ON public.artist_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Artists can update their own profile" ON public.artist_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Artists can insert their own profile" ON public.artist_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for manager_profiles
CREATE POLICY "Public manager profiles are viewable" ON public.manager_profiles FOR SELECT USING (is_public = true);
CREATE POLICY "Managers can view their own profile" ON public.manager_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Managers can update their own profile" ON public.manager_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Managers can insert their own profile" ON public.manager_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for withdrawal_requests
CREATE POLICY "Users can view their own withdrawals" ON public.withdrawal_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create withdrawal requests" ON public.withdrawal_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all withdrawals" ON public.withdrawal_requests FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update withdrawals" ON public.withdrawal_requests FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for fan_subscriptions
CREATE POLICY "Users can view their subscription" ON public.fan_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their subscription" ON public.fan_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their subscription" ON public.fan_subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for artist_concerts
CREATE POLICY "Everyone can view artist concerts" ON public.artist_concerts FOR SELECT USING (true);
CREATE POLICY "Artists can manage their concerts" ON public.artist_concerts FOR ALL USING (auth.uid() = artist_id);

-- RLS Policies for gift_conversions
CREATE POLICY "Users can view their conversions" ON public.gift_conversions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create conversions" ON public.gift_conversions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage conversions" ON public.gift_conversions FOR ALL USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for duel_ads
CREATE POLICY "Everyone can view duel ads" ON public.duel_ads FOR SELECT USING (true);
CREATE POLICY "Admins can manage duel ads" ON public.duel_ads FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Add columns to existing profiles table for social links
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;