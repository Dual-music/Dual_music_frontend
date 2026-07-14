-- 1) Simplify distribute_event_revenue: for gift_* and vote sources, platform_pct only,
--    remainder goes entirely to the artist recipient (no manager split, no artist2 split).
CREATE OR REPLACE FUNCTION public.distribute_event_revenue(
  p_source_type text,
  p_source_id uuid,
  p_payer_id uuid,
  p_total_credits numeric,
  p_artist1_id uuid DEFAULT NULL,
  p_artist2_id uuid DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL,
  p_winner_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config jsonb;
  v_section jsonb;
  v_platform_pct numeric := 0;
  v_artist_pct numeric := 0;
  v_artists_pct numeric := 0;
  v_manager_pct numeric := 0;
  v_winner_share_pct numeric := 50;
  v_platform numeric := 0;
  v_artist1 numeric := 0;
  v_artist2 numeric := 0;
  v_manager numeric := 0;
  v_artists_pool numeric := 0;
  v_dist_id uuid;
  v_simple boolean := false;
BEGIN
  IF p_total_credits <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT value INTO v_config FROM platform_settings WHERE key = 'economic_config';
  IF v_config IS NULL THEN
    RETURN NULL;
  END IF;

  v_section := CASE p_source_type
    WHEN 'concert_ticket' THEN v_config->'concert_ticket'
    WHEN 'concert_replay' THEN v_config->'concert_replay'
    WHEN 'duel_ticket' THEN v_config->'duel_ticket'
    WHEN 'duel_replay' THEN v_config->'duel_replay'
    WHEN 'gift_concert' THEN v_config->'gift'
    WHEN 'gift_duel' THEN v_config->'gift'
    WHEN 'gift_live' THEN v_config->'gift'
    WHEN 'vote' THEN v_config->'vote'
    ELSE NULL
  END;

  IF v_section IS NULL THEN
    RETURN NULL;
  END IF;

  v_platform_pct := COALESCE((v_section->>'platform_pct')::numeric, 0);
  v_artist_pct := COALESCE((v_section->>'artist_pct')::numeric, 0);
  v_artists_pct := COALESCE((v_section->>'artists_pct')::numeric, 0);
  v_manager_pct := COALESCE((v_section->>'manager_pct')::numeric, 0);
  v_winner_share_pct := COALESCE((v_section->>'winner_share_pct')::numeric, 50);

  -- Simplified mode: gift_* and vote → platform takes platform_pct, rest goes to artist1
  v_simple := p_source_type IN ('gift_concert', 'gift_duel', 'gift_live', 'vote');

  v_platform := ROUND(p_total_credits * v_platform_pct / 100, 2);

  IF v_simple THEN
    -- Whole remainder to the targeted artist
    v_artist1 := p_total_credits - v_platform;
    v_artist2 := 0;
    v_manager := 0;
  ELSE
    v_manager := ROUND(p_total_credits * v_manager_pct / 100, 2);

    -- Single artist (concerts)
    IF p_artist1_id IS NOT NULL AND p_artist2_id IS NULL THEN
      v_artist1 := ROUND(p_total_credits * (v_artist_pct + v_artists_pct) / 100, 2);
    END IF;

    -- Two artists (duels)
    IF p_artist1_id IS NOT NULL AND p_artist2_id IS NOT NULL THEN
      v_artists_pool := ROUND(p_total_credits * v_artists_pct / 100, 2);
      IF p_winner_id IS NOT NULL AND p_winner_id IN (p_artist1_id, p_artist2_id) THEN
        IF p_winner_id = p_artist1_id THEN
          v_artist1 := ROUND(v_artists_pool * v_winner_share_pct / 100, 2);
          v_artist2 := v_artists_pool - v_artist1;
        ELSE
          v_artist2 := ROUND(v_artists_pool * v_winner_share_pct / 100, 2);
          v_artist1 := v_artists_pool - v_artist2;
        END IF;
      ELSE
        v_artist1 := ROUND(v_artists_pool / 2, 2);
        v_artist2 := v_artists_pool - v_artist1;
      END IF;
    END IF;
  END IF;

  INSERT INTO revenue_distributions (
    source_type, source_id, payer_id, total_credits,
    platform_credits, artist1_id, artist1_credits,
    artist2_id, artist2_credits, manager_id, manager_credits, metadata
  ) VALUES (
    p_source_type, p_source_id, p_payer_id, p_total_credits,
    v_platform, p_artist1_id, v_artist1,
    p_artist2_id, v_artist2,
    CASE WHEN v_manager > 0 THEN p_manager_id ELSE NULL END, v_manager,
    p_metadata
  ) RETURNING id INTO v_dist_id;

  IF p_artist1_id IS NOT NULL AND v_artist1 > 0 THEN
    INSERT INTO user_wallets (user_id, balance) VALUES (p_artist1_id, v_artist1)
    ON CONFLICT (user_id) DO UPDATE SET balance = user_wallets.balance + v_artist1, updated_at = now();
  END IF;

  IF p_artist2_id IS NOT NULL AND v_artist2 > 0 THEN
    INSERT INTO user_wallets (user_id, balance) VALUES (p_artist2_id, v_artist2)
    ON CONFLICT (user_id) DO UPDATE SET balance = user_wallets.balance + v_artist2, updated_at = now();
  END IF;

  IF p_manager_id IS NOT NULL AND v_manager > 0 THEN
    INSERT INTO user_wallets (user_id, balance) VALUES (p_manager_id, v_manager)
    ON CONFLICT (user_id) DO UPDATE SET balance = user_wallets.balance + v_manager, updated_at = now();
  END IF;

  RETURN v_dist_id;
END;
$function$;

-- 2) Update deduct_wallet_and_vote to ALSO route the credits via distribute_event_revenue
--    so the artist actually gets paid (minus platform_pct from 'vote' section).
CREATE OR REPLACE FUNCTION public.deduct_wallet_and_vote(
  p_user_id uuid,
  p_amount numeric,
  p_duel_id uuid,
  p_artist_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vote_id uuid;
BEGIN
  IF p_amount <= 0 OR p_amount > 10000 THEN
    RETURN FALSE;
  END IF;

  UPDATE user_wallets
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND balance >= p_amount;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  INSERT INTO duel_votes (duel_id, user_id, artist_id, amount)
  VALUES (p_duel_id, p_user_id, p_artist_id, p_amount)
  RETURNING id INTO v_vote_id;

  -- Distribute: platform takes its cut, remainder goes to the voted artist
  PERFORM public.distribute_event_revenue(
    'vote', p_duel_id, p_user_id, p_amount,
    p_artist_id, NULL, NULL, NULL,
    jsonb_build_object('vote_id', v_vote_id)
  );

  RETURN TRUE;
END;
$function$;

-- 3) Seed/extend default config so 'vote' section exists. Set defaults: platform 20%.
UPDATE platform_settings
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{vote}',
  COALESCE(value->'vote', '{"platform_pct": 20}'::jsonb),
  true
)
WHERE key = 'economic_config';

-- 4) RPC: get my revenues grouped by event with breakdown by source type.
CREATE OR REPLACE FUNCTION public.get_my_revenues_by_event(p_period text DEFAULT 'all')
RETURNS TABLE(
  source_id uuid,
  event_label text,
  source_type text,
  total_received numeric,
  tx_count bigint,
  last_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      rd.source_id,
      rd.source_type,
      CASE
        WHEN rd.artist1_id = auth.uid() THEN rd.artist1_credits
        WHEN rd.artist2_id = auth.uid() THEN rd.artist2_credits
        WHEN rd.manager_id = auth.uid() THEN rd.manager_credits
        ELSE 0
      END AS received,
      rd.created_at
    FROM revenue_distributions rd
    WHERE (rd.artist1_id = auth.uid() OR rd.artist2_id = auth.uid() OR rd.manager_id = auth.uid())
      AND CASE p_period
        WHEN 'day' THEN rd.created_at >= now() - INTERVAL '1 day'
        WHEN 'week' THEN rd.created_at >= now() - INTERVAL '7 days'
        WHEN 'month' THEN rd.created_at >= now() - INTERVAL '30 days'
        ELSE TRUE
      END
  )
  SELECT
    b.source_id,
    COALESCE(
      (SELECT title FROM artist_concerts WHERE id = b.source_id),
      (SELECT title FROM concerts WHERE id = b.source_id),
      (SELECT 'Duel' FROM duels WHERE id = b.source_id),
      (SELECT title FROM artist_lives WHERE id = b.source_id),
      (SELECT title FROM replay_videos WHERE id = b.source_id),
      'Événement'
    )::text AS event_label,
    b.source_type,
    SUM(b.received)::numeric AS total_received,
    COUNT(*)::bigint AS tx_count,
    MAX(b.created_at) AS last_at
  FROM base b
  WHERE b.received > 0
  GROUP BY b.source_id, b.source_type
  ORDER BY MAX(b.created_at) DESC;
$function$;