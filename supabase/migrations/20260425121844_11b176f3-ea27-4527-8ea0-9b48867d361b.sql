-- 1) Re-install pg_net into a dedicated schema
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, authenticated, service_role, anon;

-- 2) Replace permissive live_likes policies with a SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Authenticated users can create live likes" ON public.live_likes;
DROP POLICY IF EXISTS "Authenticated users can update live likes" ON public.live_likes;

-- Keep SELECT public so counts can be displayed; block direct writes from clients.
-- (No INSERT/UPDATE/DELETE policy = authenticated cannot mutate directly under RLS.)

CREATE OR REPLACE FUNCTION public.increment_live_likes(p_live_id uuid, p_delta integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_delta IS NULL OR p_delta < 1 OR p_delta > 50 THEN
    p_delta := 1;
  END IF;

  INSERT INTO public.live_likes (live_id, likes_count, updated_at)
  VALUES (p_live_id, p_delta, now())
  ON CONFLICT (live_id) DO UPDATE
    SET likes_count = public.live_likes.likes_count + EXCLUDED.likes_count,
        updated_at = now()
  RETURNING likes_count INTO v_count;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_live_likes(uuid, integer) TO authenticated;
