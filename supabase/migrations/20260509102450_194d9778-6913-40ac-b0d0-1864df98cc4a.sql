
-- 1. Approval status on artist concerts
ALTER TABLE public.artist_concerts
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.artist_concerts
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Auto-approve existing concerts
UPDATE public.artist_concerts SET approval_status = 'approved', approved_at = COALESCE(approved_at, now())
  WHERE approval_status = 'pending';

-- Refresh public-facing RLS for artist_concerts: public sees only approved
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='artist_concerts' AND policyname='Anyone can view artist concerts') THEN
    DROP POLICY "Anyone can view artist concerts" ON public.artist_concerts;
  END IF;
END $$;

CREATE POLICY "Public sees approved artist concerts"
ON public.artist_concerts FOR SELECT
USING (
  approval_status = 'approved'
  OR artist_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Approval RPC
CREATE OR REPLACE FUNCTION public.admin_approve_artist_concert(
  p_concert_id uuid, p_approve boolean, p_reason text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_concert record;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin, 'admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;
  SELECT * INTO v_concert FROM artist_concerts WHERE id = p_concert_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;

  IF p_approve THEN
    UPDATE artist_concerts
      SET approval_status = 'approved', approved_at = now(), approved_by = v_admin, rejection_reason = NULL
      WHERE id = p_concert_id;
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (v_concert.artist_id, 'concert_approved', 'Concert approuvé !',
      'Votre concert "' || COALESCE(v_concert.title,'') || '" a été approuvé et est maintenant public.',
      jsonb_build_object('concert_id', p_concert_id));
  ELSE
    UPDATE artist_concerts
      SET approval_status = 'rejected', approved_at = now(), approved_by = v_admin, rejection_reason = p_reason
      WHERE id = p_concert_id;
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (v_concert.artist_id, 'concert_rejected', 'Concert refusé',
      'Votre concert "' || COALESCE(v_concert.title,'') || '" a été refusé.' ||
      CASE WHEN p_reason IS NOT NULL THEN ' Motif : ' || p_reason ELSE '' END,
      jsonb_build_object('concert_id', p_concert_id, 'reason', p_reason));
  END IF;
  RETURN json_build_object('success', true);
END $$;

-- 3. Dedication economic config (add default if missing)
UPDATE public.platform_settings
SET value = jsonb_set(value, '{dedication}',
  '{"artist_pct": 80, "platform_pct": 20, "min_price_credits": 10}'::jsonb, true)
WHERE key = 'economic_config'
  AND NOT (value ? 'dedication');

-- 4. Concert dedications table
CREATE TABLE IF NOT EXISTS public.concert_dedications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL,
  concert_type text NOT NULL DEFAULT 'artist_concert',  -- 'artist_concert' | 'concert'
  artist_id uuid NOT NULL,
  fan_id uuid NOT NULL,
  message text NOT NULL,
  price_credits numeric NOT NULL,
  status text NOT NULL DEFAULT 'paid', -- paid | delivered | rejected | refunded
  paid_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  rejected_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dedications_concert ON public.concert_dedications(concert_id);
CREATE INDEX IF NOT EXISTS idx_dedications_artist ON public.concert_dedications(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_dedications_fan ON public.concert_dedications(fan_id);

ALTER TABLE public.concert_dedications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fan sees own dedications"
ON public.concert_dedications FOR SELECT
USING (fan_id = auth.uid() OR artist_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- inserts go through SECURITY DEFINER RPC; no direct insert policy needed
-- updates only via RPCs

-- 5. Purchase RPC
CREATE OR REPLACE FUNCTION public.purchase_concert_dedication(
  p_concert_id uuid,
  p_concert_type text,
  p_message text,
  p_price_credits numeric
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_artist uuid;
  v_min numeric := 10;
  v_dedication_id uuid;
  v_config jsonb;
  v_fan_name text;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success', false, 'error', 'not_authenticated'); END IF;
  IF p_message IS NULL OR length(trim(p_message)) < 3 THEN
    RETURN json_build_object('success', false, 'error', 'message_required');
  END IF;
  IF p_price_credits IS NULL OR p_price_credits <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_price');
  END IF;

  SELECT value INTO v_config FROM platform_settings WHERE key = 'economic_config';
  v_min := COALESCE((v_config->'dedication'->>'min_price_credits')::numeric, 10);
  IF p_price_credits < v_min THEN
    RETURN json_build_object('success', false, 'error', 'price_below_min', 'min', v_min);
  END IF;

  IF p_concert_type = 'artist_concert' THEN
    SELECT artist_id INTO v_artist FROM artist_concerts
      WHERE id = p_concert_id AND approval_status = 'approved';
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'concert_not_available'); END IF;
  ELSE
    -- platform concert: no artist_id column; treat as platform
    v_artist := NULL;
    RETURN json_build_object('success', false, 'error', 'unsupported_concert_type');
  END IF;

  -- Deduct from wallet
  UPDATE user_wallets SET balance = balance - p_price_credits, updated_at = now()
    WHERE user_id = v_user AND balance >= p_price_credits;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'insufficient_balance'); END IF;

  INSERT INTO concert_dedications (concert_id, concert_type, artist_id, fan_id, message, price_credits)
  VALUES (p_concert_id, p_concert_type, v_artist, v_user, p_message, p_price_credits)
  RETURNING id INTO v_dedication_id;

  -- Distribute revenue: use 'gift_concert' style (platform + recipient), but custom split via dedication config
  DECLARE
    v_platform_pct numeric := COALESCE((v_config->'dedication'->>'platform_pct')::numeric, 20);
    v_platform numeric := ROUND(p_price_credits * v_platform_pct / 100, 2);
    v_artist_credits numeric := p_price_credits - v_platform;
  BEGIN
    INSERT INTO revenue_distributions (
      source_type, source_id, payer_id, total_credits,
      platform_credits, artist1_id, artist1_credits,
      artist2_id, artist2_credits, manager_id, manager_credits, metadata
    ) VALUES (
      'dedication', v_dedication_id, v_user, p_price_credits,
      v_platform, v_artist, v_artist_credits, NULL, 0, NULL, 0,
      jsonb_build_object('concert_id', p_concert_id, 'concert_type', p_concert_type)
    );
    INSERT INTO user_wallets (user_id, balance) VALUES (v_artist, v_artist_credits)
      ON CONFLICT (user_id) DO UPDATE SET balance = user_wallets.balance + v_artist_credits, updated_at = now();
  END;

  SELECT full_name INTO v_fan_name FROM profiles WHERE id = v_user;

  -- Notify artist
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_artist, 'dedication_received', 'Nouvelle dédicace !',
    COALESCE(v_fan_name, 'Un fan') || ' vous a demandé une dédicace (' || p_price_credits || ' crédits)',
    jsonb_build_object('dedication_id', v_dedication_id, 'concert_id', p_concert_id));

  -- Notify fan
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_user, 'dedication_paid', 'Dédicace envoyée',
    'Votre demande de dédicace a été envoyée à l''artiste.',
    jsonb_build_object('dedication_id', v_dedication_id));

  RETURN json_build_object('success', true, 'dedication_id', v_dedication_id);
END $$;

-- 6. Deliver RPC (artist marks delivered)
CREATE OR REPLACE FUNCTION public.deliver_concert_dedication(p_dedication_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_d record;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_d FROM concert_dedications WHERE id = p_dedication_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_d.artist_id <> v_user AND NOT has_role(v_user, 'admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_d.status <> 'paid' THEN RETURN json_build_object('success', false, 'error', 'not_pending'); END IF;
  UPDATE concert_dedications SET status='delivered', delivered_at=now() WHERE id=p_dedication_id;
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_d.fan_id, 'dedication_delivered', 'Dédicace livrée !',
    'Votre dédicace a été livrée par l''artiste. Merci !',
    jsonb_build_object('dedication_id', p_dedication_id));
  RETURN json_build_object('success', true);
END $$;
