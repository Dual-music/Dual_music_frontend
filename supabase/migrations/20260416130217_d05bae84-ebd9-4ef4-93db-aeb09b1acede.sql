CREATE OR REPLACE FUNCTION public.increment_replay_views(p_replay_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE replay_videos
  SET views_count = views_count + 1
  WHERE id = p_replay_id;
END;
$$;