-- Add cover_image_url and social_links to manager_profiles
ALTER TABLE public.manager_profiles ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE public.manager_profiles ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}'::jsonb;