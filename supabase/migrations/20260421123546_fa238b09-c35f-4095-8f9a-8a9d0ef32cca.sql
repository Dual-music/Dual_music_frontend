-- 1. CREDIT PURCHASES — track every credit purchase (real money in)
CREATE TABLE IF NOT EXISTS public.credit_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  credits_amount NUMERIC NOT NULL CHECK (credits_amount > 0),
  paid_amount NUMERIC NOT NULL CHECK (paid_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT NOT NULL DEFAULT 'stripe',
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_user ON public.credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_created ON public.credit_purchases(created_at DESC);

ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credit purchases"
  ON public.credit_purchases FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all credit purchases"
  ON public.credit_purchases FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own credit purchases"
  ON public.credit_purchases FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage credit purchases"
  ON public.credit_purchases FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));


-- 2. REVENUE DISTRIBUTIONS — audit ledger for every payment split
CREATE TABLE IF NOT EXISTS public.revenue_distributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL, -- 'concert_ticket','duel_ticket','concert_replay','duel_replay','gift_concert','gift_duel','gift_live'
  source_id UUID,
  payer_id UUID NOT NULL,
  total_credits NUMERIC NOT NULL CHECK (total_credits >= 0),
  platform_credits NUMERIC NOT NULL DEFAULT 0,
  artist1_id UUID,
  artist1_credits NUMERIC NOT NULL DEFAULT 0,
  artist2_id UUID,
  artist2_credits NUMERIC NOT NULL DEFAULT 0,
  manager_id UUID,
  manager_credits NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rev_dist_created ON public.revenue_distributions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rev_dist_source ON public.revenue_distributions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_rev_dist_artist1 ON public.revenue_distributions(artist1_id);
CREATE INDEX IF NOT EXISTS idx_rev_dist_artist2 ON public.revenue_distributions(artist2_id);
CREATE INDEX IF NOT EXISTS idx_rev_dist_manager ON public.revenue_distributions(manager_id);

ALTER TABLE public.revenue_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all distributions"
  ON public.revenue_distributions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Beneficiaries view own distributions"
  ON public.revenue_distributions FOR SELECT
  USING (auth.uid() IN (artist1_id, artist2_id, manager_id, payer_id));


-- 3. EXCHANGE RATES — cached USD->X rates
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  currency_code TEXT PRIMARY KEY,
  rate_per_usd NUMERIC NOT NULL CHECK (rate_per_usd > 0),
  symbol TEXT,
  name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone reads rates"
  ON public.exchange_rates FOR SELECT
  USING (true);

CREATE POLICY "Admins manage rates"
  ON public.exchange_rates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed default rates (will be auto-refreshed by edge function)
INSERT INTO public.exchange_rates (currency_code, rate_per_usd, symbol, name) VALUES
  ('USD', 1, '$', 'US Dollar'),
  ('EUR', 0.92, '€', 'Euro'),
  ('GBP', 0.79, '£', 'British Pound'),
  ('CAD', 1.37, 'CA$', 'Canadian Dollar'),
  ('XOF', 605, 'FCFA', 'CFA Franc BCEAO'),
  ('XAF', 605, 'FCFA', 'CFA Franc BEAC'),
  ('NGN', 1500, '₦', 'Nigerian Naira'),
  ('GHS', 15, '₵', 'Ghanaian Cedi'),
  ('KES', 130, 'KSh', 'Kenyan Shilling'),
  ('ZAR', 18.5, 'R', 'South African Rand'),
  ('MAD', 10, 'DH', 'Moroccan Dirham')
ON CONFLICT (currency_code) DO NOTHING;


-- 4. USER CURRENCY PREFERENCES
CREATE TABLE IF NOT EXISTS public.user_currency_preferences (
  user_id UUID PRIMARY KEY,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_currency_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own currency pref"
  ON public.user_currency_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 5. DEFAULT ECONOMIC CONFIG
INSERT INTO public.platform_settings (key, value)
VALUES (
  'economic_config',
  jsonb_build_object(
    'credit_value_usd', 0.01,
    'concert_ticket', jsonb_build_object('platform_pct', 20, 'artist_pct', 80),
    'concert_replay', jsonb_build_object('platform_pct', 30, 'artist_pct', 70),
    'duel_ticket', jsonb_build_object('platform_pct', 20, 'artists_pct', 70, 'manager_pct', 10, 'winner_share_pct', 50),
    'duel_replay', jsonb_build_object('platform_pct', 30, 'artists_pct', 60, 'manager_pct', 10, 'winner_share_pct', 50),
    'gift', jsonb_build_object('platform_pct', 30, 'artist_pct', 60, 'manager_pct', 10),
    'withdrawal', jsonb_build_object('artist_fee_pct', 5, 'manager_fee_pct', 5)
  )
)
ON CONFLICT (key) DO NOTHING;


-- 6. DISTRIBUTE EVENT REVENUE — atomic split + wallet credit
CREATE OR REPLACE FUNCTION public.distribute_event_revenue(
  p_source_type TEXT,
  p_source_id UUID,
  p_payer_id UUID,
  p_total_credits NUMERIC,
  p_artist1_id UUID DEFAULT NULL,
  p_artist2_id UUID DEFAULT NULL,
  p_manager_id UUID DEFAULT NULL,
  p_winner_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config JSONB;
  v_section JSONB;
  v_platform_pct NUMERIC := 0;
  v_artist_pct NUMERIC := 0;
  v_artists_pct NUMERIC := 0;
  v_manager_pct NUMERIC := 0;
  v_winner_share_pct NUMERIC := 50;
  v_platform NUMERIC := 0;
  v_artist1 NUMERIC := 0;
  v_artist2 NUMERIC := 0;
  v_manager NUMERIC := 0;
  v_artists_pool NUMERIC := 0;
  v_dist_id UUID;
BEGIN
  IF p_total_credits <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT value INTO v_config FROM platform_settings WHERE key = 'economic_config';
  IF v_config IS NULL THEN
    RETURN NULL;
  END IF;

  -- Pick correct section
  v_section := CASE p_source_type
    WHEN 'concert_ticket' THEN v_config->'concert_ticket'
    WHEN 'concert_replay' THEN v_config->'concert_replay'
    WHEN 'duel_ticket' THEN v_config->'duel_ticket'
    WHEN 'duel_replay' THEN v_config->'duel_replay'
    WHEN 'gift_concert' THEN v_config->'gift'
    WHEN 'gift_duel' THEN v_config->'gift'
    WHEN 'gift_live' THEN v_config->'gift'
    ELSE NULL
  END;

  IF v_section IS NULL THEN
    RETURN NULL;
  END IF;

  v_platform_pct := COALESCE((v_section->>'platform_pct')::NUMERIC, 0);
  v_artist_pct := COALESCE((v_section->>'artist_pct')::NUMERIC, 0);
  v_artists_pct := COALESCE((v_section->>'artists_pct')::NUMERIC, 0);
  v_manager_pct := COALESCE((v_section->>'manager_pct')::NUMERIC, 0);
  v_winner_share_pct := COALESCE((v_section->>'winner_share_pct')::NUMERIC, 50);

  v_platform := ROUND(p_total_credits * v_platform_pct / 100, 2);
  v_manager := ROUND(p_total_credits * v_manager_pct / 100, 2);

  -- Single artist (concerts, gifts to one artist)
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

  -- Insert audit row
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

  -- Credit beneficiary wallets
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


-- 7. REVENUE STATS for admin dashboard
CREATE OR REPLACE FUNCTION public.get_revenue_stats(p_period TEXT DEFAULT 'all')
RETURNS TABLE (
  source_type TEXT,
  total_credits NUMERIC,
  platform_credits NUMERIC,
  artists_credits NUMERIC,
  manager_credits NUMERIC,
  transaction_count BIGINT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rd.source_type,
    SUM(rd.total_credits)::NUMERIC,
    SUM(rd.platform_credits)::NUMERIC,
    SUM(rd.artist1_credits + rd.artist2_credits)::NUMERIC,
    SUM(rd.manager_credits)::NUMERIC,
    COUNT(*)::BIGINT
  FROM revenue_distributions rd
  WHERE has_role(auth.uid(), 'admin'::app_role)
    AND CASE p_period
      WHEN 'day' THEN rd.created_at >= now() - INTERVAL '1 day'
      WHEN 'week' THEN rd.created_at >= now() - INTERVAL '7 days'
      WHEN 'month' THEN rd.created_at >= now() - INTERVAL '30 days'
      ELSE TRUE
    END
  GROUP BY rd.source_type
  ORDER BY SUM(rd.total_credits) DESC;
$$;


-- 8. CREDIT PURCHASE STATS
CREATE OR REPLACE FUNCTION public.get_credit_purchase_stats()
RETURNS JSON
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'today_credits', COALESCE((SELECT SUM(credits_amount) FROM credit_purchases WHERE created_at >= CURRENT_DATE AND status='completed'), 0),
    'today_count', COALESCE((SELECT COUNT(*) FROM credit_purchases WHERE created_at >= CURRENT_DATE AND status='completed'), 0),
    'week_credits', COALESCE((SELECT SUM(credits_amount) FROM credit_purchases WHERE created_at >= now() - INTERVAL '7 days' AND status='completed'), 0),
    'week_count', COALESCE((SELECT COUNT(*) FROM credit_purchases WHERE created_at >= now() - INTERVAL '7 days' AND status='completed'), 0),
    'month_credits', COALESCE((SELECT SUM(credits_amount) FROM credit_purchases WHERE created_at >= now() - INTERVAL '30 days' AND status='completed'), 0),
    'month_count', COALESCE((SELECT COUNT(*) FROM credit_purchases WHERE created_at >= now() - INTERVAL '30 days' AND status='completed'), 0),
    'all_time_credits', COALESCE((SELECT SUM(credits_amount) FROM credit_purchases WHERE status='completed'), 0),
    'all_time_amount_usd', COALESCE((SELECT SUM(paid_amount) FROM credit_purchases WHERE status='completed' AND currency='USD'), 0)
  )
  WHERE has_role(auth.uid(), 'admin'::app_role);
$$;


-- 9. WITHDRAWAL FEE CALCULATOR
CREATE OR REPLACE FUNCTION public.calculate_withdrawal_net(p_user_id UUID, p_amount NUMERIC)
RETURNS JSON
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config JSONB;
  v_fee_pct NUMERIC := 0;
  v_fee NUMERIC;
  v_net NUMERIC;
BEGIN
  SELECT value->'withdrawal' INTO v_config FROM platform_settings WHERE key = 'economic_config';
  IF has_role(p_user_id, 'manager'::app_role) THEN
    v_fee_pct := COALESCE((v_config->>'manager_fee_pct')::NUMERIC, 0);
  ELSIF has_role(p_user_id, 'artist'::app_role) THEN
    v_fee_pct := COALESCE((v_config->>'artist_fee_pct')::NUMERIC, 0);
  END IF;
  v_fee := ROUND(p_amount * v_fee_pct / 100, 2);
  v_net := p_amount - v_fee;
  RETURN json_build_object('fee_pct', v_fee_pct, 'fee', v_fee, 'net', v_net);
END;
$$;