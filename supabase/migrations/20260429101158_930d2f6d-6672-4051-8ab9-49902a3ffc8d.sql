
-- Extend sponsor_ad_plays with lifecycle tracking
ALTER TABLE public.sponsor_ad_plays
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS sponsor_paid_credits numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.sponsor_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sponsor_ad_plays_event ON public.sponsor_ad_plays(event_type, event_id, played_at DESC);

-- Helper: check whether a user is allowed to control sponsor ads for an event
CREATE OR REPLACE FUNCTION public.can_control_sponsor_ad(p_user uuid, p_event_type text, p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ok boolean := false;
BEGIN
  IF p_user IS NULL THEN RETURN false; END IF;
  IF p_event_type = 'duel' THEN
    SELECT EXISTS(SELECT 1 FROM duels WHERE id = p_event_id AND manager_id = p_user) INTO v_ok;
  ELSIF p_event_type = 'artist_concert' THEN
    SELECT EXISTS(SELECT 1 FROM artist_concerts WHERE id = p_event_id AND artist_id = p_user) INTO v_ok;
  ELSIF p_event_type = 'concert' THEN
    -- platform concerts: only admins
    SELECT has_role(p_user, 'admin'::app_role) INTO v_ok;
  END IF;
  RETURN COALESCE(v_ok, false);
END; $$;

-- Start a sponsor ad — server-side authorization
CREATE OR REPLACE FUNCTION public.start_sponsor_ad(
  p_ad_video_id uuid,
  p_event_type text,
  p_event_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ad record;
  v_play_id uuid;
  v_paid numeric := 0;
  v_req_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public.can_control_sponsor_ad(v_user, p_event_type, p_event_id) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_ad FROM sponsor_ad_videos
   WHERE id = p_ad_video_id AND event_type = p_event_type AND event_id = p_event_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'ad_not_found');
  END IF;

  -- Anti-replay: refuse if there is already an active (not yet ended) play for this event
  IF EXISTS(
    SELECT 1 FROM sponsor_ad_plays
     WHERE event_type = p_event_type AND event_id = p_event_id AND ended_at IS NULL
       AND played_at > now() - interval '15 minutes'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'already_playing');
  END IF;

  -- Pull paid amount from latest approved request linked to this ad if available
  SELECT id, price_credits INTO v_req_id, v_paid
  FROM sponsor_requests
  WHERE id = ANY(COALESCE(v_ad.source_request_ids, ARRAY[]::uuid[]))
    AND status = 'approved'
  ORDER BY approved_at DESC NULLS LAST
  LIMIT 1;

  INSERT INTO sponsor_ad_plays (ad_video_id, triggered_by, event_type, event_id, sponsor_paid_credits, request_id)
  VALUES (p_ad_video_id, v_user, p_event_type, p_event_id, COALESCE(v_paid, 0), v_req_id)
  RETURNING id INTO v_play_id;

  UPDATE sponsor_ad_videos SET play_count = play_count + 1 WHERE id = p_ad_video_id;

  RETURN json_build_object('success', true, 'play_id', v_play_id);
END; $$;

-- Stop a sponsor ad — only original triggerer with active control rights
CREATE OR REPLACE FUNCTION public.stop_sponsor_ad(p_play_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_play record;
BEGIN
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  SELECT * INTO v_play FROM sponsor_ad_plays WHERE id = p_play_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_play.triggered_by <> v_user THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF NOT public.can_control_sponsor_ad(v_user, v_play.event_type, v_play.event_id) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_play.ended_at IS NOT NULL THEN
    RETURN json_build_object('success', true, 'already_ended', true);
  END IF;
  UPDATE sponsor_ad_plays
     SET ended_at = now(),
         duration_seconds = GREATEST(1, EXTRACT(EPOCH FROM (now() - played_at))::int)
   WHERE id = p_play_id;
  RETURN json_build_object('success', true);
END; $$;

-- Public history visible to event controllers + admins
CREATE OR REPLACE FUNCTION public.get_sponsor_ad_history(p_event_type text, p_event_id uuid)
RETURNS TABLE(
  play_id uuid, ad_video_id uuid, ad_title text,
  triggered_by uuid, triggered_by_name text,
  played_at timestamptz, ended_at timestamptz, duration_seconds integer,
  sponsor_paid_credits numeric, request_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.can_control_sponsor_ad(auth.uid(), p_event_type, p_event_id) OR has_role(auth.uid(),'admin'::app_role)) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.id, p.ad_video_id, v.title,
         p.triggered_by, COALESCE(pr.full_name, 'Utilisateur'),
         p.played_at, p.ended_at, p.duration_seconds,
         p.sponsor_paid_credits, p.request_id
  FROM sponsor_ad_plays p
  LEFT JOIN sponsor_ad_videos v ON v.id = p.ad_video_id
  LEFT JOIN profiles pr ON pr.id = p.triggered_by
  WHERE p.event_type = p_event_type AND p.event_id = p_event_id
  ORDER BY p.played_at DESC;
END; $$;
