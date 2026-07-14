
-- 1) Add sponsor distribution support to distribute_event_revenue
CREATE OR REPLACE FUNCTION public.distribute_event_revenue(
  p_source_type text, p_source_id uuid, p_payer_id uuid, p_total_credits numeric,
  p_artist1_id uuid DEFAULT NULL::uuid, p_artist2_id uuid DEFAULT NULL::uuid,
  p_manager_id uuid DEFAULT NULL::uuid, p_winner_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config jsonb;
  v_section jsonb;
  v_enabled boolean := true;
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
  v_recipient_role text;
  v_after_platform numeric;
BEGIN
  IF p_total_credits <= 0 THEN RETURN NULL; END IF;

  SELECT value INTO v_config FROM platform_settings WHERE key = 'economic_config';
  IF v_config IS NULL THEN RETURN NULL; END IF;

  v_section := CASE p_source_type
    WHEN 'concert_ticket' THEN v_config->'concert_ticket'
    WHEN 'concert_replay' THEN v_config->'concert_replay'
    WHEN 'duel_ticket'    THEN v_config->'duel_ticket'
    WHEN 'duel_replay'    THEN v_config->'duel_replay'
    WHEN 'gift_concert'   THEN v_config->'gift'
    WHEN 'gift_duel'      THEN v_config->'gift'
    WHEN 'gift_live'      THEN v_config->'gift'
    WHEN 'vote'           THEN v_config->'vote'
    WHEN 'sponsor_concert' THEN v_config->'sponsor_concert'
    WHEN 'sponsor_duel'    THEN v_config->'sponsor_duel'
    ELSE NULL
  END;
  IF v_section IS NULL THEN RETURN NULL; END IF;

  -- Sponsor sections support an "enabled" flag. When disabled, 100% to platform.
  IF p_source_type IN ('sponsor_concert','sponsor_duel') THEN
    v_enabled := COALESCE((v_section->>'enabled')::boolean, false);
    IF NOT v_enabled THEN
      v_platform := p_total_credits;
      INSERT INTO revenue_distributions (
        source_type, source_id, payer_id, total_credits,
        platform_credits, artist1_id, artist1_credits,
        artist2_id, artist2_credits, manager_id, manager_credits, metadata
      ) VALUES (
        p_source_type, p_source_id, p_payer_id, p_total_credits,
        v_platform, NULL, 0, NULL, 0, NULL, 0, p_metadata
      ) RETURNING id INTO v_dist_id;
      RETURN v_dist_id;
    END IF;
  END IF;

  v_platform_pct     := COALESCE((v_section->>'platform_pct')::numeric, 0);
  v_artist_pct       := COALESCE((v_section->>'artist_pct')::numeric, 0);
  v_artists_pct      := COALESCE((v_section->>'artists_pct')::numeric, 0);
  v_manager_pct      := COALESCE((v_section->>'manager_pct')::numeric, 0);
  v_winner_share_pct := COALESCE((v_section->>'winner_share_pct')::numeric, 50);

  v_simple := p_source_type IN ('gift_concert','gift_duel','gift_live','vote');
  v_platform := ROUND(p_total_credits * v_platform_pct / 100, 2);

  IF v_simple THEN
    v_after_platform := p_total_credits - v_platform;
    IF p_artist1_id IS NOT NULL THEN
      IF has_role(p_artist1_id, 'manager'::app_role) THEN
        v_recipient_role := 'manager';
      ELSE
        v_recipient_role := 'artist';
      END IF;

      IF v_recipient_role = 'manager' THEN
        v_manager := v_after_platform;
        v_artist1 := 0;
        INSERT INTO revenue_distributions (
          source_type, source_id, payer_id, total_credits,
          platform_credits, artist1_id, artist1_credits,
          artist2_id, artist2_credits, manager_id, manager_credits, metadata
        ) VALUES (
          p_source_type, p_source_id, p_payer_id, p_total_credits,
          v_platform, NULL, 0, NULL, 0, p_artist1_id, v_manager, p_metadata
        ) RETURNING id INTO v_dist_id;

        INSERT INTO user_wallets (user_id, balance) VALUES (p_artist1_id, v_manager)
          ON CONFLICT (user_id) DO UPDATE SET balance = user_wallets.balance + v_manager, updated_at = now();
        RETURN v_dist_id;
      ELSE
        v_manager := 0;
        v_artist1 := v_after_platform;
        v_artist2 := 0;
      END IF;
    END IF;
  ELSE
    v_manager := ROUND(p_total_credits * v_manager_pct / 100, 2);
    IF p_artist1_id IS NOT NULL AND p_artist2_id IS NULL THEN
      v_artist1 := ROUND(p_total_credits * (v_artist_pct + v_artists_pct) / 100, 2);
    END IF;
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

-- 2) Update pay_sponsor_request to trigger automatic distribution
CREATE OR REPLACE FUNCTION public.pay_sponsor_request(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_req record;
  v_artist1 uuid;
  v_artist2 uuid;
  v_manager uuid;
  v_source_type text;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated'); END IF;
  SELECT * INTO v_req FROM sponsor_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.requester_id <> v_user THEN
    RETURN json_build_object('success',false,'error','not_found');
  END IF;
  IF v_req.status <> 'awaiting_payment' THEN
    RETURN json_build_object('success',false,'error','not_payable');
  END IF;
  IF v_req.price_credits <= 0 THEN
    RETURN json_build_object('success',false,'error','no_price_set');
  END IF;

  UPDATE user_wallets SET balance = balance - v_req.price_credits, updated_at = now()
    WHERE user_id = v_user AND balance >= v_req.price_credits;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','insufficient_balance'); END IF;

  UPDATE sponsor_requests SET status='paid', paid_at=now() WHERE id=p_request_id;

  -- Determine event owners for revenue split
  IF v_req.event_type = 'duel' THEN
    SELECT artist1_id, artist2_id, manager_id
      INTO v_artist1, v_artist2, v_manager
      FROM duels WHERE id = v_req.event_id;
    v_source_type := 'sponsor_duel';
  ELSIF v_req.event_type = 'artist_concert' THEN
    SELECT artist_id, NULL::uuid, NULL::uuid
      INTO v_artist1, v_artist2, v_manager
      FROM artist_concerts WHERE id = v_req.event_id;
    v_source_type := 'sponsor_concert';
  ELSIF v_req.event_type = 'concert' THEN
    v_source_type := 'sponsor_concert';
  END IF;

  -- Distribute (config-controlled; disabled by default = 100% platform)
  IF v_source_type IS NOT NULL THEN
    PERFORM public.distribute_event_revenue(
      v_source_type, p_request_id, v_user, v_req.price_credits,
      v_artist1, v_artist2, v_manager, NULL,
      jsonb_build_object('sponsor_request_id', p_request_id, 'event_type', v_req.event_type, 'event_id', v_req.event_id)
    );
  END IF;

  -- Notify admins
  INSERT INTO notifications (user_id,type,title,message,data)
  SELECT ur.user_id, 'sponsor_paid', 'Paiement sponsor reçu',
    'Une demande de sponsoring a été payée et attend votre approbation finale.',
    jsonb_build_object('request_id',p_request_id)
  FROM user_roles ur WHERE ur.role='admin'::app_role;

  RETURN json_build_object('success',true);
END; $function$;

-- 3) Seed default sponsor config (disabled, 100% platform) if missing
UPDATE public.platform_settings
SET value = jsonb_set(
  jsonb_set(
    value,
    '{sponsor_concert}',
    COALESCE(value->'sponsor_concert', '{"enabled": false, "platform_pct": 100, "artist_pct": 0}'::jsonb),
    true
  ),
  '{sponsor_duel}',
  COALESCE(value->'sponsor_duel', '{"enabled": false, "platform_pct": 100, "artists_pct": 0, "manager_pct": 0, "winner_share_pct": 50}'::jsonb),
  true
)
WHERE key = 'economic_config';
