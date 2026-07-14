
-- Create a SECURITY DEFINER function to get platform stats without RLS restrictions
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'artists', (SELECT count(*) FROM public.artist_profiles WHERE is_public = true),
    'fans', (SELECT count(*) FROM public.profiles),
    'votes', (SELECT COALESCE(sum(amount), 0) FROM public.duel_votes)
  )
$$;
