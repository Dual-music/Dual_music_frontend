-- 1) Real-time season leaderboard (artists OR donors)
CREATE OR REPLACE FUNCTION public.get_season_leaderboard(p_season_id uuid, p_limit integer DEFAULT 50)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  stage_name text,
  total_votes numeric,
  total_gifts_received numeric,
  total_wins integer,
  total_donated numeric,
  gifts_sent integer,
  votes_cast numeric,
  score numeric,
  rank_position integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season record;
BEGIN
  SELECT * INTO v_season FROM leaderboard_seasons WHERE id = p_season_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_season.type = 'artist' THEN
    RETURN QUERY
    WITH window_votes AS (
      SELECT artist_id AS uid, COALESCE(SUM(amount),0)::numeric AS v
      FROM duel_votes
      WHERE created_at >= v_season.start_date AND created_at <= v_season.end_date
      GROUP BY artist_id
    ),
    window_gifts AS (
      SELECT gt.to_user_id AS uid,
             COUNT(*)::numeric AS g_count,
             COALESCE(SUM(vg.price),0)::numeric AS g_value
      FROM gift_transactions gt
      LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.created_at >= v_season.start_date AND gt.created_at <= v_season.end_date
      GROUP BY gt.to_user_id
    ),
    window_wins AS (
      SELECT winner_id AS uid, COUNT(*)::int AS w
      FROM duels
      WHERE winner_id IS NOT NULL
        AND COALESCE(ended_at, started_at, scheduled_time, created_at) >= v_season.start_date
        AND COALESCE(ended_at, started_at, scheduled_time, created_at) <= v_season.end_date
      GROUP BY winner_id
    ),
    combined AS (
      SELECT ap.user_id AS uid,
             COALESCE(wv.v, 0) AS v,
             COALESCE(wg.g_count, 0) AS g_count,
             COALESCE(wg.g_value, 0) AS g_value,
             COALESCE(ww.w, 0) AS w
      FROM artist_profiles ap
      LEFT JOIN window_votes wv ON wv.uid = ap.user_id
      LEFT JOIN window_gifts wg ON wg.uid = ap.user_id
      LEFT JOIN window_wins  ww ON ww.uid = ap.user_id
    ),
    scored AS (
      SELECT c.uid,
             c.v AS total_votes,
             c.g_value AS total_gifts_received,
             c.w AS total_wins,
             0::numeric AS total_donated,
             0 AS gifts_sent,
             0::numeric AS votes_cast,
             (c.v * 10 + c.g_value * 5 + c.w * 50)::numeric AS score
      FROM combined c
      WHERE c.v > 0 OR c.g_value > 0 OR c.w > 0
    )
    SELECT s.uid,
           p.full_name,
           ap.avatar_url,
           ap.stage_name,
           s.total_votes,
           s.total_gifts_received,
           s.total_wins,
           s.total_donated,
           s.gifts_sent,
           s.votes_cast,
           s.score,
           ROW_NUMBER() OVER (ORDER BY s.score DESC, s.total_votes DESC)::int AS rank_position
    FROM scored s
    LEFT JOIN profiles p ON p.id = s.uid
    LEFT JOIN artist_profiles ap ON ap.user_id = s.uid
    ORDER BY s.score DESC, s.total_votes DESC
    LIMIT GREATEST(p_limit, 1);

  ELSE
    -- donor leaderboard
    RETURN QUERY
    WITH window_gifts_sent AS (
      SELECT gt.from_user_id AS uid,
             COUNT(*)::int AS g_count,
             COALESCE(SUM(vg.price),0)::numeric AS g_value
      FROM gift_transactions gt
      LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.created_at >= v_season.start_date AND gt.created_at <= v_season.end_date
      GROUP BY gt.from_user_id
    ),
    window_votes_cast AS (
      SELECT user_id AS uid, COALESCE(SUM(amount),0)::numeric AS v
      FROM duel_votes
      WHERE created_at >= v_season.start_date AND created_at <= v_season.end_date
      GROUP BY user_id
    ),
    combined AS (
      SELECT COALESCE(g.uid, v.uid) AS uid,
             COALESCE(g.g_count, 0) AS g_count,
             COALESCE(g.g_value, 0) AS g_value,
             COALESCE(v.v, 0) AS v
      FROM window_gifts_sent g
      FULL OUTER JOIN window_votes_cast v ON v.uid = g.uid
    ),
    scored AS (
      SELECT c.uid,
             0::numeric AS total_votes,
             0::numeric AS total_gifts_received,
             0 AS total_wins,
             (c.g_value + c.v)::numeric AS total_donated,
             c.g_count AS gifts_sent,
             c.v AS votes_cast,
             (c.g_value + c.v)::numeric AS score
      FROM combined c
      WHERE c.g_value + c.v > 0
    )
    SELECT s.uid,
           p.full_name,
           p.avatar_url,
           NULL::text AS stage_name,
           s.total_votes,
           s.total_gifts_received,
           s.total_wins,
           s.total_donated,
           s.gifts_sent,
           s.votes_cast,
           s.score,
           ROW_NUMBER() OVER (ORDER BY s.score DESC, s.total_donated DESC)::int AS rank_position
    FROM scored s
    LEFT JOIN profiles p ON p.id = s.uid
    ORDER BY s.score DESC, s.total_donated DESC
    LIMIT GREATEST(p_limit, 1);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_season_leaderboard(uuid, integer) TO anon, authenticated;

-- 2) Admin broadcast announcement
CREATE OR REPLACE FUNCTION public.admin_broadcast_announcement(
  p_title text,
  p_message text,
  p_target_role text DEFAULT 'all'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin, 'admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 OR p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_input', 'message', 'Titre et message requis.');
  END IF;

  IF p_target_role NOT IN ('all','fan','artist','manager','moderator','admin') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_target');
  END IF;

  IF p_target_role = 'all' THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    SELECT p.id, 'admin_announcement', p_title, p_message, jsonb_build_object('target','all','sent_by',v_admin)
    FROM profiles p;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    INSERT INTO notifications (user_id, type, title, message, data)
    SELECT DISTINCT ur.user_id, 'admin_announcement', p_title, p_message,
           jsonb_build_object('target', p_target_role, 'sent_by', v_admin)
    FROM user_roles ur
    WHERE ur.role = p_target_role::app_role;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  -- Audit log
  INSERT INTO admin_logs (admin_id, action_type, target_type, target_id, target_name, details)
  VALUES (v_admin, 'broadcast_announcement', 'announcement', NULL, p_title,
          jsonb_build_object('target', p_target_role, 'recipients', v_count, 'message', p_message));

  RETURN json_build_object('success', true, 'recipients', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_broadcast_announcement(text, text, text) TO authenticated;