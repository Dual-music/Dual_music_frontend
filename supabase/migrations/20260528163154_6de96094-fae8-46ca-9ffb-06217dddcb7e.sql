
-- 1. Add provider columns to withdrawal_requests
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_tx_id text,
  ADD COLUMN IF NOT EXISTS auto_processed boolean NOT NULL DEFAULT false;

-- 2. Seed default withdrawal_providers_config
INSERT INTO public.platform_settings (key, value, updated_at)
VALUES (
  'withdrawal_providers_config',
  jsonb_build_object(
    'cinetpay', jsonb_build_object('enabled', true,  'min_amount_credits', 100, 'mode', 'manual'),
    'moneroo',  jsonb_build_object('enabled', true,  'min_amount_credits', 100, 'mode', 'manual'),
    'stripe',   jsonb_build_object('enabled', true,  'min_amount_credits', 200, 'mode', 'manual')
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

-- 3. Updated RPC with provider support + per-provider min + auto-approve mode
CREATE OR REPLACE FUNCTION public.request_withdrawal_with_saved_method(
  p_amount numeric,
  p_payout_method_id uuid DEFAULT NULL,
  p_provider text DEFAULT NULL
)
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
  v_global_min numeric := 0;
  v_global_config jsonb;
  v_providers_config jsonb;
  v_provider_cfg jsonb;
  v_provider text := lower(coalesce(p_provider, ''));
  v_status text := 'pending';
  v_mode text := 'manual';
  v_auto boolean := false;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated','message','Vous devez être connecté.'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN json_build_object('success',false,'error','invalid_amount','message','Montant invalide.'); END IF;

  -- Global minimum fallback
  SELECT value->'withdrawal' INTO v_global_config FROM platform_settings WHERE key = 'economic_config';
  v_global_min := COALESCE((v_global_config->>'min_amount_credits')::numeric, 0);

  -- Per-provider config
  SELECT value INTO v_providers_config FROM platform_settings WHERE key = 'withdrawal_providers_config';
  IF v_providers_config IS NOT NULL AND v_provider <> '' THEN
    v_provider_cfg := v_providers_config -> v_provider;
    IF v_provider_cfg IS NULL THEN
      RETURN json_build_object('success',false,'error','provider_unknown','message','Fournisseur de paiement inconnu.');
    END IF;
    IF COALESCE((v_provider_cfg->>'enabled')::boolean, false) = false THEN
      RETURN json_build_object('success',false,'error','provider_disabled','message','Ce mode de retrait est désactivé.');
    END IF;
    v_min := COALESCE((v_provider_cfg->>'min_amount_credits')::numeric, v_global_min);
    v_mode := COALESCE(v_provider_cfg->>'mode', 'manual');
  ELSE
    v_min := v_global_min;
  END IF;

  IF v_min > 0 AND p_amount < v_min THEN
    RETURN json_build_object('success',false,'error','below_minimum','message',
      'Montant inférieur au minimum (' || v_min::text || ' Crédits) pour ce fournisseur.', 'min_amount', v_min);
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

  -- Auto-approve mode: marquée "approved" sans intervention admin (le payout reste manuel ou auto selon mode)
  IF v_mode = 'auto_approve' THEN v_status := 'approved'; END IF;
  IF v_mode = 'auto_payout' THEN
    v_status := 'approved';
    v_auto := true;
  END IF;

  INSERT INTO withdrawal_requests (user_id, amount, payment_method, payment_details, status, provider, auto_processed)
  VALUES (v_user, p_amount, v_method.method, jsonb_build_object(
    'payout_method_id', v_method.id,
    'label', v_method.label,
    'phone_number', v_method.phone_number,
    'mobile_operator', v_method.mobile_operator,
    'iban', v_method.iban,
    'bank_name', v_method.bank_name,
    'account_holder', v_method.account_holder,
    'paypal_email', v_method.paypal_email
  ), v_status, NULLIF(v_provider, ''), v_auto)
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'success',true,
    'withdrawal_id',v_id,
    'status', v_status,
    'mode', v_mode,
    'trigger_payout', v_auto,
    'message','Demande de retrait créée.'
  );
END;
$$;
