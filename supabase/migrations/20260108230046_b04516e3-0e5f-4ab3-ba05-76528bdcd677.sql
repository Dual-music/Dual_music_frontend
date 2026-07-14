-- Table for concert ticket QR codes
ALTER TABLE concert_tickets ADD COLUMN IF NOT EXISTS qr_code_url TEXT;
ALTER TABLE concert_tickets ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE concert_tickets ADD COLUMN IF NOT EXISTS validated_by UUID;

-- Table for referral system
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL,
  referred_id UUID NOT NULL UNIQUE,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reward_claimed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their referrals" ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE POLICY "Users can create referrals" ON public.referrals
  FOR INSERT WITH CHECK (auth.uid() = referred_id);

-- Add referral_code to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID;

-- Concert chat messages table (similar to duel chat)
CREATE TABLE IF NOT EXISTS public.concert_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  parent_id UUID REFERENCES public.concert_chat_messages(id) ON DELETE CASCADE,
  is_moderated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.concert_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view non-moderated concert messages" ON public.concert_chat_messages
  FOR SELECT USING (is_moderated = false);

CREATE POLICY "Authenticated users can post concert messages" ON public.concert_chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their concert messages" ON public.concert_chat_messages
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their concert messages" ON public.concert_chat_messages
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can moderate concert messages" ON public.concert_chat_messages
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Add parent_id to duel_chat_messages for replies
ALTER TABLE duel_chat_messages ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES duel_chat_messages(id) ON DELETE CASCADE;

-- Add policy for users to update their duel messages
CREATE POLICY "Users can update their duel messages" ON public.duel_chat_messages
  FOR UPDATE USING (auth.uid() = user_id);

-- Add policy for users to delete their duel messages
CREATE POLICY "Users can delete their duel messages" ON public.duel_chat_messages
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for concert_chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.concert_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.referrals;