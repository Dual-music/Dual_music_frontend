ALTER TABLE public.duels
ADD COLUMN IF NOT EXISTS current_timer_ends_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS current_timer_target_id UUID;