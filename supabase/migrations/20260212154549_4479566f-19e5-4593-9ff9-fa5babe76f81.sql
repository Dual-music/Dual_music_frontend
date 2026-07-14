
-- Add recording columns to artist_concerts
ALTER TABLE public.artist_concerts
ADD COLUMN IF NOT EXISTS recording_url text,
ADD COLUMN IF NOT EXISTS is_replay_available boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS ended_at timestamp with time zone;

-- Add recording columns to concerts
ALTER TABLE public.concerts
ADD COLUMN IF NOT EXISTS recording_url text,
ADD COLUMN IF NOT EXISTS is_replay_available boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS ended_at timestamp with time zone;
