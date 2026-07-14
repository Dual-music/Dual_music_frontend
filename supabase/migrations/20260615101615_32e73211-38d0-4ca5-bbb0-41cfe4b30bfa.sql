-- Extend sponsor ads + top donor RPCs to support competitions

ALTER TABLE public.sponsor_ad_videos DROP CONSTRAINT IF EXISTS sponsor_ad_videos_event_type_check;
ALTER TABLE public.sponsor_ad_videos ADD CONSTRAINT sponsor_ad_videos_event_type_check
  CHECK (event_type = ANY (ARRAY['duel','concert','artist_concert','competition']));

CREATE OR REPLACE FUNCTION public.can_control_sponsor_ad(p_user uuid, p_event_type text, p_event_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ok boolean := false;
BEGIN
  IF p_user IS NULL THEN RETURN false; END IF;
  IF p_event_type = 'duel' THEN
    SELECT EXISTS(SELECT 1 FROM duels WHERE id = p_event_id AND manager_id = p_user) INTO v_ok;
  ELSIF p_event_type = 'artist_concert' THEN
    SELECT EXISTS(SELECT 1 FROM artist_concerts WHERE id = p_event_id AND artist_id = p_user) INTO v_ok;
  ELSIF p_event_type = 'concert' THEN
    SELECT has_role(p_user, 'admin'::app_role) INTO v_ok;
  ELSIF p_event_type = 'competition' THEN
    SELECT EXISTS(SELECT 1 FROM competitions WHERE id = p_event_id AND manager_id = p_user) INTO v_ok;
  END IF;
  RETURN COALESCE(v_ok, false);
END; $$;

CREATE OR REPLACE FUNCTION public.get_top_donor(p_context_type text, p_context_id uuid)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, total_amount numeric, last_message text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_context_type = 'duel' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT gt.from_user_id AS uid, COALESCE(SUM(vg.price),0)::numeric AS total
      FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.duel_id = p_context_id GROUP BY gt.from_user_id
      UNION ALL
      SELECT dv.user_id, SUM(dv.amount)::numeric FROM duel_votes dv WHERE dv.duel_id = p_context_id GROUP BY dv.user_id
    ), summed AS (
      SELECT uid, SUM(total)::numeric AS total FROM agg GROUP BY uid ORDER BY 2 DESC LIMIT 1
    )
    SELECT s.uid, p.full_name, p.avatar_url, s.total,
      (SELECT m.message FROM duel_chat_messages m
        WHERE m.duel_id = p_context_id AND m.user_id = s.uid AND COALESCE(m.is_moderated,false)=false
        ORDER BY m.created_at DESC LIMIT 1)
    FROM summed s LEFT JOIN profiles p ON p.id = s.uid;

  ELSIF p_context_type = 'concert' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT gt.from_user_id AS uid, COALESCE(SUM(vg.price),0)::numeric AS total
      FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.live_id = p_context_id GROUP BY gt.from_user_id
    )
    SELECT a.uid, p.full_name, p.avatar_url, a.total,
      (SELECT m.message FROM concert_chat_messages m
        WHERE m.concert_id = p_context_id AND m.user_id = a.uid AND COALESCE(m.is_moderated,false)=false
        ORDER BY m.created_at DESC LIMIT 1)
    FROM agg a LEFT JOIN profiles p ON p.id = a.uid
    ORDER BY a.total DESC LIMIT 1;

  ELSIF p_context_type = 'competition' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT cg.sender_id AS uid, COALESCE(SUM(cg.credits),0)::numeric AS total
      FROM competition_gifts cg WHERE cg.competition_id = p_context_id GROUP BY cg.sender_id
      UNION ALL
      SELECT cv.voter_id, SUM(cv.credits_spent)::numeric
      FROM competition_votes cv WHERE cv.competition_id = p_context_id GROUP BY cv.voter_id
    ), summed AS (
      SELECT uid, SUM(total)::numeric AS total FROM agg GROUP BY uid ORDER BY 2 DESC LIMIT 1
    )
    SELECT s.uid, p.full_name, p.avatar_url, s.total,
      (SELECT m.message FROM competition_chat_messages m
        WHERE m.competition_id = p_context_id AND m.user_id = s.uid AND COALESCE(m.is_moderated,false)=false
        ORDER BY m.created_at DESC LIMIT 1)
    FROM summed s LEFT JOIN profiles p ON p.id = s.uid;

  ELSE
    RETURN QUERY
    WITH agg AS (
      SELECT gt.from_user_id AS uid, COALESCE(SUM(vg.price),0)::numeric AS total
      FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.live_id = p_context_id GROUP BY gt.from_user_id
    )
    SELECT a.uid, p.full_name, p.avatar_url, a.total,
      (SELECT m.message FROM live_chat_messages m
        WHERE m.live_id = p_context_id AND m.user_id = a.uid AND COALESCE(m.is_moderated,false)=false
        ORDER BY m.created_at DESC LIMIT 1)
    FROM agg a LEFT JOIN profiles p ON p.id = a.uid
    ORDER BY a.total DESC LIMIT 1;
  END IF;
END; $$;