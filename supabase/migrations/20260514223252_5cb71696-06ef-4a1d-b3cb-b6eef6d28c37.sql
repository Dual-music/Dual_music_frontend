
-- 1. Opt-in flags on artist concerts
ALTER TABLE public.artist_concerts
  ADD COLUMN IF NOT EXISTS allows_dedications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allows_sponsor_ads boolean NOT NULL DEFAULT true;

-- 2. Opt-in flag on duels (admin sets at approval time)
ALTER TABLE public.duels
  ADD COLUMN IF NOT EXISTS allows_sponsor_ads boolean NOT NULL DEFAULT true;

-- 3. Global toggle for concert approval requirement
INSERT INTO public.platform_settings (key, value)
VALUES ('concert_approval_config', '{"require_admin_approval": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 4. Trigger BEFORE INSERT: auto-approve if global toggle is off
CREATE OR REPLACE FUNCTION public.set_concert_initial_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_require boolean := true;
  v_cfg jsonb;
BEGIN
  SELECT value INTO v_cfg FROM platform_settings WHERE key = 'concert_approval_config';
  v_require := COALESCE((v_cfg->>'require_admin_approval')::boolean, true);

  IF NOT v_require THEN
    NEW.approval_status := 'approved';
    NEW.approved_at := now();
  ELSE
    -- ensure pending if not explicitly set
    IF NEW.approval_status IS NULL OR NEW.approval_status = '' THEN
      NEW.approval_status := 'pending';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_concert_initial_approval ON public.artist_concerts;
CREATE TRIGGER trg_set_concert_initial_approval
BEFORE INSERT ON public.artist_concerts
FOR EACH ROW EXECUTE FUNCTION public.set_concert_initial_approval();

-- 5. Trigger AFTER INSERT: notify admins when pending
CREATE OR REPLACE FUNCTION public.notify_admins_concert_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist_name text;
BEGIN
  IF NEW.approval_status <> 'pending' THEN
    RETURN NEW;
  END IF;
  SELECT full_name INTO v_artist_name FROM profiles WHERE id = NEW.artist_id;
  INSERT INTO notifications (user_id, type, title, message, data)
  SELECT ur.user_id,
         'concert_pending_approval',
         'Nouveau concert à valider',
         COALESCE(v_artist_name, 'Un artiste') || ' a planifié le concert "' || COALESCE(NEW.title,'') || '"',
         jsonb_build_object('concert_id', NEW.id, 'artist_id', NEW.artist_id)
  FROM user_roles ur WHERE ur.role = 'admin'::app_role;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_admins_concert_pending ON public.artist_concerts;
CREATE TRIGGER trg_notify_admins_concert_pending
AFTER INSERT ON public.artist_concerts
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_concert_pending();

-- 6. Update purchase_concert_dedication to check allows_dedications
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
  v_allows boolean;
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
    SELECT artist_id, allows_dedications INTO v_artist, v_allows
      FROM artist_concerts WHERE id = p_concert_id;
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'concert_not_found'); END IF;
    IF NOT COALESCE(v_allows, true) THEN
      RETURN json_build_object('success', false, 'error', 'dedications_disabled');
    END IF;
  ELSE
    RETURN json_build_object('success', false, 'error', 'unsupported_concert_type');
  END IF;

  UPDATE user_wallets SET balance = balance - p_price_credits, updated_at = now()
    WHERE user_id = v_user AND balance >= p_price_credits;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'insufficient_balance'); END IF;

  INSERT INTO concert_dedications (concert_id, concert_type, artist_id, fan_id, message, price_credits)
  VALUES (p_concert_id, p_concert_type, v_artist, v_user, p_message, p_price_credits)
  RETURNING id INTO v_dedication_id;

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

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_artist, 'dedication_received', 'Nouvelle dédicace !',
    COALESCE(v_fan_name, 'Un fan') || ' vous a demandé une dédicace (' || p_price_credits || ' crédits)',
    jsonb_build_object('dedication_id', v_dedication_id, 'concert_id', p_concert_id));

  RETURN json_build_object('success', true, 'dedication_id', v_dedication_id);
END $$;
