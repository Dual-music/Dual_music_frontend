
CREATE OR REPLACE FUNCTION public.compare_distribution_vs_config(p_distribution_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dist record;
  v_config jsonb;
  v_section jsonb;
  v_platform_pct numeric := 0;
  v_artist_pct numeric := 0;
  v_artists_pct numeric := 0;
  v_manager_pct numeric := 0;
  v_sim_platform numeric := 0;
  v_sim_manager numeric := 0;
  v_sim_artists numeric := 0;
  v_after_platform numeric;
  v_recipient_is_manager boolean := false;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN json_build_object('error','forbidden');
  END IF;

  SELECT * INTO v_dist FROM revenue_distributions WHERE id = p_distribution_id;
  IF NOT FOUND THEN RETURN json_build_object('error','not_found'); END IF;

  SELECT value INTO v_config FROM platform_settings WHERE key = 'economic_config';
  v_section := CASE v_dist.source_type
    WHEN 'concert_ticket' THEN v_config->'concert_ticket'
    WHEN 'concert_replay' THEN v_config->'concert_replay'
    WHEN 'duel_ticket'    THEN v_config->'duel_ticket'
    WHEN 'duel_replay'    THEN v_config->'duel_replay'
    WHEN 'gift_concert'   THEN v_config->'gift'
    WHEN 'gift_duel'      THEN v_config->'gift'
    WHEN 'gift_live'      THEN v_config->'gift'
    WHEN 'vote'           THEN v_config->'vote'
    ELSE NULL
  END;

  IF v_section IS NULL THEN
    RETURN json_build_object('error','no_config_section');
  END IF;

  v_platform_pct := COALESCE((v_section->>'platform_pct')::numeric, 0);
  v_artist_pct   := COALESCE((v_section->>'artist_pct')::numeric, 0);
  v_artists_pct  := COALESCE((v_section->>'artists_pct')::numeric, 0);
  v_manager_pct  := COALESCE((v_section->>'manager_pct')::numeric, 0);

  v_sim_platform := ROUND(v_dist.total_credits * v_platform_pct / 100, 2);
  v_after_platform := v_dist.total_credits - v_sim_platform;

  IF v_dist.source_type IN ('gift_concert','gift_duel','gift_live','vote') THEN
    -- New rule: gifts and votes are split ONLY between platform and recipient.
    -- The recipient (artist OR manager) gets the entire "after platform" amount.
    -- If the recorded distribution put the amount in manager_credits, the recipient was a manager.
    v_recipient_is_manager := (v_dist.manager_credits > 0 AND (v_dist.artist1_credits + v_dist.artist2_credits) = 0);
    IF v_recipient_is_manager THEN
      v_sim_manager := v_after_platform;
      v_sim_artists := 0;
    ELSE
      v_sim_manager := 0;
      v_sim_artists := v_after_platform;
    END IF;
  ELSE
    v_sim_manager := ROUND(v_dist.total_credits * v_manager_pct / 100, 2);
    v_sim_artists := ROUND(v_dist.total_credits * (v_artist_pct + v_artists_pct) / 100, 2);
  END IF;

  RETURN json_build_object(
    'distribution_id', v_dist.id,
    'source_type', v_dist.source_type,
    'total_credits', v_dist.total_credits,
    'recipient_is_manager', v_recipient_is_manager,
    'config', json_build_object(
      'platform_pct', v_platform_pct,
      'manager_pct', v_manager_pct,
      'artist_pct', v_artist_pct,
      'artists_pct', v_artists_pct
    ),
    'simulated', json_build_object(
      'platform', v_sim_platform,
      'manager', v_sim_manager,
      'artists', v_sim_artists
    ),
    'executed', json_build_object(
      'platform', v_dist.platform_credits,
      'manager', v_dist.manager_credits,
      'artists', (v_dist.artist1_credits + v_dist.artist2_credits)
    ),
    'matches', json_build_object(
      'platform', v_dist.platform_credits = v_sim_platform,
      'manager',  v_dist.manager_credits  = v_sim_manager,
      'artists',  (v_dist.artist1_credits + v_dist.artist2_credits) = v_sim_artists
    )
  );
END;
$function$;
