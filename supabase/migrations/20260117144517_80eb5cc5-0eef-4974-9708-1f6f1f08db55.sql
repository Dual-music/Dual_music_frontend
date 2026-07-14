-- Create table for push subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their push subscriptions"
ON public.push_subscriptions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create table for concert reminders
CREATE TABLE IF NOT EXISTS public.concert_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concert_id UUID NOT NULL,
  user_id UUID NOT NULL,
  reminder_type TEXT NOT NULL DEFAULT '30min',
  sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(concert_id, user_id, reminder_type)
);

-- Enable RLS
ALTER TABLE public.concert_reminders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can manage their concert reminders"
ON public.concert_reminders
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);