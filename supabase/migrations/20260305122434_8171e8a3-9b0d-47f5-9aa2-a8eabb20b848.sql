-- Function to safely fetch display profiles (name + avatar) bypassing RLS
-- This only exposes non-sensitive fields: id, full_name, avatar_url
CREATE OR REPLACE FUNCTION public.get_display_profiles(user_ids uuid[])
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY(user_ids)
$$;