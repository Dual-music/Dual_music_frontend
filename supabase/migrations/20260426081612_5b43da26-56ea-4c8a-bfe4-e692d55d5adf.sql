-- 1. Withdrawal PIN protection table
CREATE TABLE IF NOT EXISTS public.user_withdrawal_pins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_withdrawal_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own pin meta"
  ON public.user_withdrawal_pins FOR SELECT
  USING (auth.uid() = user_id);

-- No direct INSERT/UPDATE/DELETE: handled exclusively by SECURITY DEFINER functions

-- 2. PIN reset OTP tokens
CREATE TABLE IF NOT EXISTS public.withdrawal_pin_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_reset_user ON public.withdrawal_pin_reset_tokens(user_id, used_at);

ALTER TABLE public.withdrawal_pin_reset_tokens ENABLE ROW LEVEL SECURITY;
-- No client policies; only RPC accesses it.

-- 3. Helper: hash PIN with sha256 + per-user salt (user id)
CREATE OR REPLACE FUNCTION public.hash_pin(_user_id uuid, _pin text)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT encode(extensions.digest(_user_id::text || ':' || _pin || ':rrm-salt-v1', 'sha256'), 'hex');
$$;

-- 4. Set or change PIN (requires current PIN if exists)
CREATE OR REPLACE FUNCTION public.set_withdrawal_pin(p_new_pin text, p_current_pin text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_existing record;
BEGIN
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF p_new_pin !~ '^[0-9]{6}$' THEN
    RETURN json_build_object('success', false, 'error', 'invalid_pin', 'message', 'Le code doit contenir exactement 6 chiffres.');
  END IF;

  SELECT * INTO v_existing FROM user_withdrawal_pins WHERE user_id = v_user;
  IF FOUND THEN
    IF p_current_pin IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'current_pin_required', 'message', 'Le code actuel est requis pour le changer.');
    END IF;
    IF v_existing.pin_hash <> public.hash_pin(v_user, p_current_pin) THEN
      RETURN json_build_object('success', false, 'error', 'wrong_current_pin', 'message', 'Code actuel incorrect.');
    END IF;
    UPDATE user_withdrawal_pins SET pin_hash = public.hash_pin(v_user, p_new_pin), failed_attempts = 0, locked_until = NULL, updated_at = now()
      WHERE user_id = v_user;
  ELSE
    INSERT INTO user_withdrawal_pins (user_id, pin_hash) VALUES (v_user, public.hash_pin(v_user, p_new_pin));
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- 5. Verify PIN (returns success + locks after 5 failures for 15 minutes)
CREATE OR REPLACE FUNCTION public.verify_withdrawal_pin(p_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row record;
BEGIN
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_row FROM user_withdrawal_pins WHERE user_id = v_user;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'no_pin_set', 'message', 'Aucun code défini.');
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN json_build_object('success', false, 'error', 'locked', 'message', 'Trop de tentatives. Réessaye plus tard.', 'locked_until', v_row.locked_until);
  END IF;

  IF v_row.pin_hash <> public.hash_pin(v_user, p_pin) THEN
    UPDATE user_withdrawal_pins SET failed_attempts = failed_attempts + 1,
      locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + INTERVAL '15 minutes' ELSE NULL END
      WHERE user_id = v_user;
    RETURN json_build_object('success', false, 'error', 'wrong_pin', 'message', 'Code incorrect.');
  END IF;

  UPDATE user_withdrawal_pins SET failed_attempts = 0, locked_until = NULL WHERE user_id = v_user;
  RETURN json_build_object('success', true);
END;
$$;

-- 6. Whether the current user has a PIN configured
CREATE OR REPLACE FUNCTION public.has_withdrawal_pin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM user_withdrawal_pins WHERE user_id = auth.uid());
$$;

-- 7. Request a 6-digit OTP for PIN reset (called by client; OTP delivered via email function)
CREATE OR REPLACE FUNCTION public.request_withdrawal_pin_reset()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_otp text;
  v_email text;
BEGIN
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Invalidate previous unused tokens
  UPDATE withdrawal_pin_reset_tokens SET used_at = now() WHERE user_id = v_user AND used_at IS NULL;

  -- 6-digit numeric OTP
  v_otp := LPAD((floor(random() * 1000000))::text, 6, '0');

  INSERT INTO withdrawal_pin_reset_tokens (user_id, otp_hash, expires_at)
  VALUES (v_user, public.hash_pin(v_user, v_otp), now() + INTERVAL '10 minutes');

  SELECT email INTO v_email FROM profiles WHERE id = v_user;

  -- Return otp + email so the edge function can send it (called from edge function w/ service role)
  -- For safety, this RPC is only used by an edge function: clients should call the edge function
  RETURN json_build_object('success', true, 'otp', v_otp, 'email', v_email);
END;
$$;

-- 8. Confirm OTP and set new PIN
CREATE OR REPLACE FUNCTION public.confirm_withdrawal_pin_reset(p_otp text, p_new_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_token record;
BEGIN
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF p_new_pin !~ '^[0-9]{6}$' THEN
    RETURN json_build_object('success', false, 'error', 'invalid_pin', 'message', 'Le code doit contenir exactement 6 chiffres.');
  END IF;

  SELECT * INTO v_token FROM withdrawal_pin_reset_tokens
    WHERE user_id = v_user AND used_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'no_active_token', 'message', 'Aucun code valide. Demande un nouveau code.');
  END IF;

  IF v_token.attempts >= 5 THEN
    UPDATE withdrawal_pin_reset_tokens SET used_at = now() WHERE id = v_token.id;
    RETURN json_build_object('success', false, 'error', 'too_many_attempts', 'message', 'Trop de tentatives. Demande un nouveau code.');
  END IF;

  IF v_token.otp_hash <> public.hash_pin(v_user, p_otp) THEN
    UPDATE withdrawal_pin_reset_tokens SET attempts = attempts + 1 WHERE id = v_token.id;
    RETURN json_build_object('success', false, 'error', 'wrong_otp', 'message', 'Code incorrect.');
  END IF;

  -- OK: set new PIN, mark token used, reset failures
  INSERT INTO user_withdrawal_pins (user_id, pin_hash)
  VALUES (v_user, public.hash_pin(v_user, p_new_pin))
  ON CONFLICT (user_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();

  UPDATE withdrawal_pin_reset_tokens SET used_at = now() WHERE id = v_token.id;

  RETURN json_build_object('success', true);
END;
$$;

-- 9. Update min_withdrawal in economic_config (preserve existing, add default if missing)
UPDATE public.platform_settings
  SET value = jsonb_set(
    COALESCE(value, '{}'::jsonb),
    '{withdrawal,min_amount_credits}',
    COALESCE(value->'withdrawal'->'min_amount_credits', to_jsonb(100)),
    true
  )
  WHERE key = 'economic_config';

-- 10. Enforce min_amount_credits in request_withdrawal_with_saved_method
CREATE OR REPLACE FUNCTION public.request_withdrawal_with_saved_method(p_amount numeric, p_payout_method_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_method record;
  v_id uuid;
  v_default_id uuid;
  v_min numeric := 0;
  v_config jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated','message','Vous devez être connecté.'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN json_build_object('success',false,'error','invalid_amount','message','Montant invalide.'); END IF;

  -- Min amount
  SELECT value->'withdrawal' INTO v_config FROM platform_settings WHERE key = 'economic_config';
  v_min := COALESCE((v_config->>'min_amount_credits')::numeric, 0);
  IF v_min > 0 AND p_amount < v_min THEN
    RETURN json_build_object('success',false,'error','below_minimum','message',
      'Montant inférieur au minimum (' || v_min::text || ' Crédits).', 'min_amount', v_min);
  END IF;

  IF p_payout_method_id IS NOT NULL THEN
    SELECT * INTO v_method FROM user_payout_methods WHERE id = p_payout_method_id AND user_id = v_user;
  ELSE
    SELECT * INTO v_method FROM user_payout_methods WHERE user_id = v_user AND is_default = true LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    SELECT id INTO v_default_id FROM user_payout_methods WHERE user_id = v_user LIMIT 1;
    IF v_default_id IS NULL THEN
      RETURN json_build_object('success',false,'error','no_payout_method','message','Aucune coordonnée de retrait enregistrée.');
    ELSE
      RETURN json_build_object('success',false,'error','no_default_method','message','Aucune méthode définie par défaut.');
    END IF;
  END IF;

  SELECT balance INTO v_balance FROM user_wallets WHERE user_id = v_user;
  IF COALESCE(v_balance,0) < p_amount THEN
    RETURN json_build_object('success',false,'error','insufficient_balance','message','Solde insuffisant.');
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
$$;

-- 11. Update gift distribution: ONLY platform + recipient (no manager split)
CREATE OR REPLACE FUNCTION public.distribute_event_revenue(p_source_type text, p_source_id uuid, p_payer_id uuid, p_total_credits numeric, p_artist1_id uuid DEFAULT NULL::uuid, p_artist2_id uuid DEFAULT NULL::uuid, p_manager_id uuid DEFAULT NULL::uuid, p_winner_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
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
    ELSE NULL
  END;
  IF v_section IS NULL THEN RETURN NULL; END IF;

  v_platform_pct     := COALESCE((v_section->>'platform_pct')::numeric, 0);
  v_artist_pct       := COALESCE((v_section->>'artist_pct')::numeric, 0);
  v_artists_pct      := COALESCE((v_section->>'artists_pct')::numeric, 0);
  v_manager_pct      := COALESCE((v_section->>'manager_pct')::numeric, 0);
  v_winner_share_pct := COALESCE((v_section->>'winner_share_pct')::numeric, 50);

  v_simple := p_source_type IN ('gift_concert','gift_duel','gift_live','vote');
  v_platform := ROUND(p_total_credits * v_platform_pct / 100, 2);

  IF v_simple THEN
    v_after_platform := p_total_credits - v_platform;
    -- p_artist1_id is always the recipient (artist OR manager). 
    -- NEW RULE: gifts and votes are split ONLY between platform and recipient.
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

-- 12. Update exchange rate names for XOF/XAF
UPDATE public.exchange_rates SET name = 'Franc CFA (UEMOA)' WHERE currency_code = 'XOF';
UPDATE public.exchange_rates SET name = 'Franc CFA (CEMAC)' WHERE currency_code = 'XAF';

-- Ensure pgcrypto extension is in extensions schema (used for digest)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;