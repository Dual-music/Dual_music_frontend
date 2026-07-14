
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
  v_event_label text := 'concert';
  v_existing_count int := 0;
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
    v_event_label := 'concert';
  ELSIF p_concert_type = 'artist_live' THEN
    SELECT artist_id INTO v_artist FROM artist_lives WHERE id = p_concert_id;
    IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'live_not_found'); END IF;
    v_event_label := 'live';
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

  -- Count fan's dedications for this event (including the new one)
  SELECT COUNT(*) INTO v_existing_count
    FROM concert_dedications
    WHERE fan_id = v_user AND concert_id = p_concert_id AND concert_type = p_concert_type;

  -- Notify artist
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_artist, 'dedication_received', 'Nouvelle dédicace !',
    COALESCE(v_fan_name, 'Un fan') || ' vous a demandé une dédicace (' || p_price_credits || ' crédits) pour votre ' || v_event_label || '.',
    jsonb_build_object('dedication_id', v_dedication_id, 'concert_id', p_concert_id, 'concert_type', p_concert_type));

  -- Notify fan
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_user, 'dedication_paid',
    'Demande de dédicace envoyée',
    CASE WHEN v_existing_count > 1
      THEN 'Votre nouvelle demande a été envoyée. Vous avez désormais ' || v_existing_count || ' demandes pour ce ' || v_event_label || ' — toutes seront interprétées par l''artiste.'
      ELSE 'Votre demande de dédicace a été envoyée à l''artiste. Vous pouvez en envoyer plusieurs si vous le souhaitez ; chacune sera interprétée pendant le ' || v_event_label || '.'
    END,
    jsonb_build_object('dedication_id', v_dedication_id, 'concert_id', p_concert_id, 'concert_type', p_concert_type));

  RETURN json_build_object('success', true, 'dedication_id', v_dedication_id, 'total_for_event', v_existing_count);
END $$;

CREATE OR REPLACE FUNCTION public.deliver_concert_dedication(p_dedication_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_d record;
  v_event_label text := 'concert';
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_d FROM concert_dedications WHERE id = p_dedication_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_d.artist_id <> v_user AND NOT has_role(v_user, 'admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_d.status <> 'paid' THEN RETURN json_build_object('success', false, 'error', 'not_pending'); END IF;
  UPDATE concert_dedications SET status='delivered', delivered_at=now() WHERE id=p_dedication_id;

  IF v_d.concert_type = 'artist_live' THEN v_event_label := 'live'; END IF;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_d.fan_id, 'dedication_delivered',
    'Dédicace acceptée par l''artiste !',
    'Bonne nouvelle : votre demande de dédicace a été acceptée. L''artiste l''interprétera pendant le ' || v_event_label || '. Merci pour votre soutien !',
    jsonb_build_object('dedication_id', p_dedication_id, 'concert_id', v_d.concert_id, 'concert_type', v_d.concert_type));
  RETURN json_build_object('success', true);
END $$;
