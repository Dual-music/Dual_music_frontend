
-- 1) Withdrawal: require a default payout method
CREATE OR REPLACE FUNCTION public.request_withdrawal_with_saved_method(p_amount numeric, p_payout_method_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_method record;
  v_id uuid;
  v_default_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated','message','Vous devez être connecté.'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN json_build_object('success',false,'error','invalid_amount','message','Montant invalide.'); END IF;

  -- Resolve method: provided id OR default OR fail
  IF p_payout_method_id IS NOT NULL THEN
    SELECT * INTO v_method FROM user_payout_methods WHERE id = p_payout_method_id AND user_id = v_user;
  ELSE
    SELECT * INTO v_method FROM user_payout_methods WHERE user_id = v_user AND is_default = true LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    -- Check whether user has any method at all
    SELECT id INTO v_default_id FROM user_payout_methods WHERE user_id = v_user LIMIT 1;
    IF v_default_id IS NULL THEN
      RETURN json_build_object('success',false,'error','no_payout_method','message','Aucune coordonnée de retrait enregistrée. Ajoute d''abord une méthode de paiement.');
    ELSE
      RETURN json_build_object('success',false,'error','no_default_method','message','Aucune méthode définie par défaut. Sélectionne une méthode ou marque-en une comme défaut.');
    END IF;
  END IF;

  SELECT balance INTO v_balance FROM user_wallets WHERE user_id = v_user;
  IF COALESCE(v_balance,0) < p_amount THEN
    RETURN json_build_object('success',false,'error','insufficient_balance','message','Solde insuffisant pour ce retrait.');
  END IF;

  UPDATE user_wallets SET balance = balance - p_amount, updated_at = now()
    WHERE user_id = v_user AND balance >= p_amount;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','insufficient_balance','message','Solde insuffisant.'); END IF;

  INSERT INTO withdrawal_requests (user_id, amount, payment_method, payment_details, status)
  VALUES (v_user, p_amount, v_method.method, jsonb_build_object(
    'payout_method_id', v_method.id,
    'label', v_method.label,
    'phone_number', v_method.phone_number,
    'mobile_operator', v_method.mobile_operator,
    'iban', v_method.iban,
    'bank_name', v_method.bank_name,
    'account_holder', v_method.account_holder,
    'paypal_email', v_method.paypal_email
  ), 'pending')
  RETURNING id INTO v_id;

  RETURN json_build_object('success',true,'withdrawal_id',v_id,'message','Demande de retrait créée.');
END;
$function$;

-- 2) Detailed transactions for an event (current user)
CREATE OR REPLACE FUNCTION public.get_my_event_transactions(
  p_source_id uuid,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  source_type text,
  created_at timestamptz,
  total_credits numeric,
  platform_credits numeric,
  manager_credits numeric,
  artists_credits numeric,
  my_credits numeric,
  payer_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    rd.id,
    rd.source_type,
    rd.created_at,
    rd.total_credits,
    rd.platform_credits,
    rd.manager_credits,
    (rd.artist1_credits + rd.artist2_credits) AS artists_credits,
    CASE
      WHEN rd.artist1_id = auth.uid() THEN rd.artist1_credits
      WHEN rd.artist2_id = auth.uid() THEN rd.artist2_credits
      WHEN rd.manager_id = auth.uid() THEN rd.manager_credits
      ELSE 0
    END AS my_credits,
    rd.payer_id
  FROM revenue_distributions rd
  WHERE rd.source_id = p_source_id
    AND (rd.artist1_id = auth.uid() OR rd.artist2_id = auth.uid() OR rd.manager_id = auth.uid())
  ORDER BY rd.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$function$;

CREATE OR REPLACE FUNCTION public.count_my_event_transactions(p_source_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::bigint
  FROM revenue_distributions rd
  WHERE rd.source_id = p_source_id
    AND (rd.artist1_id = auth.uid() OR rd.artist2_id = auth.uid() OR rd.manager_id = auth.uid());
$function$;

-- 3) Compare simulation vs execution for a given distribution (admin)
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
    IF v_dist.source_type LIKE 'gift_%' AND v_dist.manager_id IS NOT NULL AND v_manager_pct > 0 THEN
      v_sim_manager := ROUND(v_after_platform * v_manager_pct / 100, 2);
    END IF;
    v_sim_artists := v_after_platform - v_sim_manager;
  ELSE
    v_sim_manager := ROUND(v_dist.total_credits * v_manager_pct / 100, 2);
    v_sim_artists := ROUND(v_dist.total_credits * (v_artist_pct + v_artists_pct) / 100, 2);
  END IF;

  RETURN json_build_object(
    'distribution_id', v_dist.id,
    'source_type', v_dist.source_type,
    'total_credits', v_dist.total_credits,
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
