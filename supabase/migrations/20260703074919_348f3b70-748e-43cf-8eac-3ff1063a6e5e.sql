
-- 1) Approve sponsor request by reusing its uploaded media as the final ad
CREATE OR REPLACE FUNCTION public.admin_approve_sponsor_reuse_media(
  p_request_id uuid,
  p_title text DEFAULT NULL,
  p_duration_seconds integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_req sponsor_requests%ROWTYPE;
  v_video_id uuid;
BEGIN
  IF NOT has_role(v_admin, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  SELECT * INTO v_req FROM sponsor_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.status NOT IN ('paid','approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request must be paid or approved');
  END IF;

  IF v_req.media_type <> 'video' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Media must be a video');
  END IF;

  UPDATE sponsor_requests
  SET status = 'approved', approved_at = COALESCE(approved_at, now()), reviewed_by = v_admin, updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO sponsor_ad_videos (event_type, event_id, title, video_url, duration_seconds, is_active, uploaded_by, source_request_ids)
  VALUES (
    v_req.event_type,
    v_req.event_id,
    COALESCE(p_title, LEFT(v_req.description, 80)),
    v_req.media_url,
    COALESCE(p_duration_seconds, v_req.media_duration_seconds, 30),
    true,
    v_admin,
    ARRAY[v_req.id]
  )
  RETURNING id INTO v_video_id;

  RETURN jsonb_build_object('success', true, 'video_id', v_video_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_sponsor_reuse_media(uuid, text, integer) TO authenticated;

-- 2) Cleanup old sponsor data one week after the linked event ended
CREATE OR REPLACE FUNCTION public.cleanup_expired_sponsor_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_requests int := 0;
  v_deleted_videos int := 0;
  v_cutoff timestamptz := now() - interval '7 days';
BEGIN
  -- Delete ad videos linked to events finished >7 days ago
  WITH ended_events AS (
    SELECT 'duel'::text AS et, id AS eid FROM duels
      WHERE COALESCE(ended_at, scheduled_time) IS NOT NULL
        AND COALESCE(ended_at, scheduled_time) < v_cutoff
    UNION ALL
    SELECT 'artist_concert'::text, id FROM artist_concerts
      WHERE scheduled_time IS NOT NULL AND scheduled_time < v_cutoff
    UNION ALL
    SELECT 'concert'::text, id FROM artist_concerts
      WHERE scheduled_time IS NOT NULL AND scheduled_time < v_cutoff
    UNION ALL
    SELECT 'competition'::text, id FROM competitions
      WHERE start_at IS NOT NULL AND start_at < v_cutoff
  ),
  del_videos AS (
    DELETE FROM sponsor_ad_videos v
    USING ended_events e
    WHERE v.event_type = e.et AND v.event_id = e.eid
    RETURNING v.id
  )
  SELECT count(*) INTO v_deleted_videos FROM del_videos;

  -- Delete sponsor requests (finalized) for those events
  WITH ended_events AS (
    SELECT 'duel'::text AS et, id AS eid FROM duels
      WHERE COALESCE(ended_at, scheduled_time) IS NOT NULL
        AND COALESCE(ended_at, scheduled_time) < v_cutoff
    UNION ALL
    SELECT 'artist_concert'::text, id FROM artist_concerts
      WHERE scheduled_time IS NOT NULL AND scheduled_time < v_cutoff
    UNION ALL
    SELECT 'concert'::text, id FROM artist_concerts
      WHERE scheduled_time IS NOT NULL AND scheduled_time < v_cutoff
    UNION ALL
    SELECT 'competition'::text, id FROM competitions
      WHERE start_at IS NOT NULL AND start_at < v_cutoff
  ),
  del_reqs AS (
    DELETE FROM sponsor_requests r
    USING ended_events e
    WHERE r.event_type = e.et AND r.event_id = e.eid
      AND r.status IN ('approved','rejected','cancelled')
    RETURNING r.id
  )
  SELECT count(*) INTO v_deleted_requests FROM del_reqs;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_requests', v_deleted_requests,
    'deleted_videos', v_deleted_videos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_sponsor_data() TO service_role;

-- Schedule daily cleanup at 03:15 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-sponsor-data');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-expired-sponsor-data',
  '15 3 * * *',
  $$SELECT public.cleanup_expired_sponsor_data();$$
);
