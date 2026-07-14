-- 1) Table coordonnées de paiement
CREATE TABLE IF NOT EXISTS public.user_payout_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('mobile_money','bank_transfer','paypal')),
  label text,
  phone_number text,
  mobile_operator text,
  iban text,
  bank_name text,
  account_holder text,
  paypal_email text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_payout_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payout methods" ON public.user_payout_methods
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own payout methods" ON public.user_payout_methods
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own payout methods" ON public.user_payout_methods
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own payout methods" ON public.user_payout_methods
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view payout methods" ON public.user_payout_methods
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_user_payout_methods_user ON public.user_payout_methods(user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_payout_methods()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_payout_methods ON public.user_payout_methods;
CREATE TRIGGER trg_touch_payout_methods BEFORE UPDATE ON public.user_payout_methods
  FOR EACH ROW EXECUTE FUNCTION public.touch_payout_methods();

-- 2) Update distribute_event_revenue: gifts with platform + recipient (+ optional manager if recipient is artist with a manager)
CREATE OR REPLACE FUNCTION public.distribute_event_revenue(
  p_source_type text, p_source_id uuid, p_payer_id uuid, p_total_credits numeric,
  p_artist1_id uuid DEFAULT NULL::uuid, p_artist2_id uuid DEFAULT NULL::uuid,
  p_manager_id uuid DEFAULT NULL::uuid, p_winner_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    -- p_artist1_id is always the recipient for simple sources (gift recipient or voted artist)
    IF p_artist1_id IS NOT NULL THEN
      -- Determine recipient role
      IF has_role(p_artist1_id, 'manager'::app_role) THEN
        v_recipient_role := 'manager';
      ELSE
        v_recipient_role := 'artist';
      END IF;

      IF v_recipient_role = 'manager' THEN
        -- Manager receives the full remainder; no extra split
        v_manager := v_after_platform;
        v_artist1 := 0;
        -- record under manager_id slot
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
        -- Artist recipient: optionally share with manager (only for gift_*; not for plain vote unless manager_pct configured AND p_manager_id provided)
        v_manager := 0;
        IF p_manager_id IS NOT NULL AND v_manager_pct > 0 AND p_source_type LIKE 'gift_%' THEN
          v_manager := ROUND(v_after_platform * v_manager_pct / 100, 2);
        END IF;
        v_artist1 := v_after_platform - v_manager;
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
$$;

-- 3) Withdrawal with saved method
CREATE OR REPLACE FUNCTION public.request_withdrawal_with_saved_method(
  p_amount numeric, p_payout_method_id uuid
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_method record;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN json_build_object('success',false,'error','invalid_amount'); END IF;

  SELECT balance INTO v_balance FROM user_wallets WHERE user_id = v_user;
  IF COALESCE(v_balance,0) < p_amount THEN
    RETURN json_build_object('success',false,'error','insufficient_balance');
  END IF;

  SELECT * INTO v_method FROM user_payout_methods WHERE id = p_payout_method_id AND user_id = v_user;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','method_not_found'); END IF;

  -- Lock funds: deduct now, refund on rejection (handled by admin flow)
  UPDATE user_wallets SET balance = balance - p_amount, updated_at = now()
    WHERE user_id = v_user AND balance >= p_amount;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','insufficient_balance'); END IF;

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

  RETURN json_build_object('success',true,'withdrawal_id',v_id);
END;
$$;

-- 4) Drill-down breakdown for a single event
CREATE OR REPLACE FUNCTION public.get_my_revenue_breakdown(p_source_id uuid)
RETURNS TABLE(source_type text, total_received numeric, tx_count bigint, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    rd.source_type,
    SUM(CASE
      WHEN rd.artist1_id = auth.uid() THEN rd.artist1_credits
      WHEN rd.artist2_id = auth.uid() THEN rd.artist2_credits
      WHEN rd.manager_id = auth.uid() THEN rd.manager_credits
      ELSE 0 END)::numeric AS total_received,
    COUNT(*)::bigint AS tx_count,
    MAX(rd.created_at) AS last_at
  FROM revenue_distributions rd
  WHERE rd.source_id = p_source_id
    AND (rd.artist1_id = auth.uid() OR rd.artist2_id = auth.uid() OR rd.manager_id = auth.uid())
  GROUP BY rd.source_type
  ORDER BY MAX(rd.created_at) DESC;
$$;