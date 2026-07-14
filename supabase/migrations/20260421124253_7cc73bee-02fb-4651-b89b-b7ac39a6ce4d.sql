
-- ============================================================
-- RPCs for atomic credit-based purchases with revenue distribution
-- ============================================================

-- Purchase concert ticket from wallet with revenue distribution
CREATE OR REPLACE FUNCTION public.purchase_concert_ticket_from_wallet(
  p_user_id uuid,
  p_concert_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
  v_artist_id uuid;
  v_existing uuid;
  v_ticket_code text;
  v_ticket_id uuid;
  v_max_tickets integer;
  v_sold integer;
BEGIN
  SELECT ticket_price, artist_id, max_tickets, COALESCE(tickets_sold, 0)
  INTO v_price, v_artist_id, v_max_tickets, v_sold
  FROM artist_concerts WHERE id = p_concert_id;

  IF NOT FOUND THEN
    -- Try public concerts table (admin-created)
    SELECT ticket_price, NULL::uuid, max_tickets, COALESCE((SELECT COUNT(*)::int FROM concert_tickets WHERE concert_id = p_concert_id), 0)
    INTO v_price, v_artist_id, v_max_tickets, v_sold
    FROM concerts WHERE id = p_concert_id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'concert_not_found');
    END IF;
  END IF;

  IF v_max_tickets IS NOT NULL AND v_sold >= v_max_tickets THEN
    RETURN json_build_object('success', false, 'error', 'sold_out');
  END IF;

  SELECT id INTO v_existing FROM concert_tickets
  WHERE concert_id = p_concert_id AND user_id = p_user_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_purchased');
  END IF;

  IF v_price > 0 THEN
    UPDATE user_wallets
    SET balance = balance - v_price, updated_at = now()
    WHERE user_id = p_user_id AND balance >= v_price;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'insufficient_balance');
    END IF;
  END IF;

  v_ticket_code := 'TICKET-' || extract(epoch from now())::bigint || '-' || substring(gen_random_uuid()::text, 1, 8);

  INSERT INTO concert_tickets (concert_id, user_id, price_paid, ticket_code)
  VALUES (p_concert_id, p_user_id, v_price, v_ticket_code)
  RETURNING id INTO v_ticket_id;

  -- Update tickets_sold counter on artist_concerts
  UPDATE artist_concerts SET tickets_sold = COALESCE(tickets_sold, 0) + 1 WHERE id = p_concert_id;

  -- Distribute revenue (only if paid and artist known)
  IF v_price > 0 AND v_artist_id IS NOT NULL THEN
    PERFORM distribute_event_revenue(
      'concert_ticket', p_concert_id, p_user_id, v_price,
      v_artist_id, NULL, NULL, NULL,
      jsonb_build_object('ticket_id', v_ticket_id)
    );
  END IF;

  RETURN json_build_object('success', true, 'ticket_id', v_ticket_id, 'ticket_code', v_ticket_code);
END;
$$;

-- Purchase duel ticket from wallet with revenue distribution
CREATE OR REPLACE FUNCTION public.purchase_duel_ticket_from_wallet(
  p_user_id uuid,
  p_duel_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
  v_artist1 uuid;
  v_artist2 uuid;
  v_manager uuid;
  v_existing uuid;
  v_ticket_id uuid;
BEGIN
  SELECT ticket_price, artist1_id, artist2_id, manager_id
  INTO v_price, v_artist1, v_artist2, v_manager
  FROM duels WHERE id = p_duel_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'duel_not_found');
  END IF;

  SELECT id INTO v_existing FROM duel_tickets
  WHERE duel_id = p_duel_id AND user_id = p_user_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_purchased');
  END IF;

  IF v_price > 0 THEN
    UPDATE user_wallets
    SET balance = balance - v_price, updated_at = now()
    WHERE user_id = p_user_id AND balance >= v_price;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'insufficient_balance');
    END IF;
  END IF;

  INSERT INTO duel_tickets (duel_id, user_id, price_paid)
  VALUES (p_duel_id, p_user_id, v_price)
  RETURNING id INTO v_ticket_id;

  IF v_price > 0 THEN
    PERFORM distribute_event_revenue(
      'duel_ticket', p_duel_id, p_user_id, v_price,
      v_artist1, v_artist2, v_manager, NULL,
      jsonb_build_object('ticket_id', v_ticket_id)
    );
  END IF;

  RETURN json_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$$;

-- Purchase replay access from wallet with revenue distribution
CREATE OR REPLACE FUNCTION public.purchase_replay_access_from_wallet(
  p_user_id uuid,
  p_replay_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
  v_artist_id uuid;
  v_duel_id uuid;
  v_concert_id uuid;
  v_artist2 uuid;
  v_manager uuid;
  v_source_type text;
  v_existing uuid;
  v_access_id uuid;
BEGIN
  SELECT replay_price, artist_id, duel_id, concert_id
  INTO v_price, v_artist_id, v_duel_id, v_concert_id
  FROM replay_videos WHERE id = p_replay_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'replay_not_found');
  END IF;

  SELECT id INTO v_existing FROM replay_access
  WHERE replay_id = p_replay_id AND user_id = p_user_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_purchased');
  END IF;

  IF v_price > 0 THEN
    UPDATE user_wallets
    SET balance = balance - v_price, updated_at = now()
    WHERE user_id = p_user_id AND balance >= v_price;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'insufficient_balance');
    END IF;
  END IF;

  INSERT INTO replay_access (replay_id, user_id) VALUES (p_replay_id, p_user_id)
  RETURNING id INTO v_access_id;

  IF v_price > 0 THEN
    IF v_duel_id IS NOT NULL THEN
      SELECT artist1_id, artist2_id, manager_id INTO v_artist_id, v_artist2, v_manager FROM duels WHERE id = v_duel_id;
      v_source_type := 'duel_replay';
    ELSE
      v_source_type := 'concert_replay';
    END IF;

    PERFORM distribute_event_revenue(
      v_source_type, p_replay_id, p_user_id, v_price,
      v_artist_id, v_artist2, v_manager, NULL,
      jsonb_build_object('access_id', v_access_id)
    );
  END IF;

  RETURN json_build_object('success', true, 'access_id', v_access_id);
END;
$$;

-- Send gift with revenue distribution (deducts inventory + records transaction + distributes)
CREATE OR REPLACE FUNCTION public.send_gift_with_distribution(
  p_user_id uuid,
  p_gift_id uuid,
  p_to_user_id uuid,
  p_duel_id uuid DEFAULT NULL,
  p_live_id uuid DEFAULT NULL,
  p_concert_id uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty integer;
  v_price numeric;
  v_source_type text;
  v_source_id uuid;
  v_artist1 uuid := p_to_user_id;
  v_artist2 uuid;
  v_manager uuid;
  v_tx_id uuid;
BEGIN
  -- Check inventory
  SELECT quantity INTO v_qty FROM user_gifts
  WHERE user_id = p_user_id AND gift_id = p_gift_id FOR UPDATE;
  IF NOT FOUND OR v_qty <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'no_inventory');
  END IF;

  SELECT price INTO v_price FROM virtual_gifts WHERE id = p_gift_id;
  IF v_price IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'gift_not_found');
  END IF;

  -- Decrement inventory
  IF v_qty <= 1 THEN
    DELETE FROM user_gifts WHERE user_id = p_user_id AND gift_id = p_gift_id;
  ELSE
    UPDATE user_gifts SET quantity = quantity - 1 WHERE user_id = p_user_id AND gift_id = p_gift_id;
  END IF;

  -- Insert gift transaction record
  INSERT INTO gift_transactions (from_user_id, to_user_id, gift_id, duel_id, live_id)
  VALUES (p_user_id, p_to_user_id, p_gift_id, p_duel_id, p_live_id)
  RETURNING id INTO v_tx_id;

  -- Determine source for distribution
  IF p_duel_id IS NOT NULL THEN
    v_source_type := 'gift_duel';
    v_source_id := p_duel_id;
    SELECT artist1_id, artist2_id, manager_id INTO v_artist1, v_artist2, v_manager FROM duels WHERE id = p_duel_id;
    -- Override: artist receiving is the actual recipient
    v_artist1 := p_to_user_id;
    v_artist2 := NULL;
    -- Keep manager from duel
  ELSIF p_live_id IS NOT NULL THEN
    v_source_type := 'gift_live';
    v_source_id := p_live_id;
  ELSIF p_concert_id IS NOT NULL THEN
    v_source_type := 'gift_concert';
    v_source_id := p_concert_id;
  ELSE
    v_source_type := 'gift_live';
    v_source_id := p_gift_id;
  END IF;

  -- Distribute gift value (in credits = price)
  PERFORM distribute_event_revenue(
    v_source_type, v_source_id, p_user_id, v_price,
    v_artist1, NULL, v_manager, NULL,
    jsonb_build_object('gift_tx_id', v_tx_id, 'gift_id', p_gift_id)
  );

  RETURN json_build_object('success', true, 'transaction_id', v_tx_id);
END;
$$;

-- Currency preference helper
CREATE OR REPLACE FUNCTION public.set_user_currency(p_currency text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO user_currency_preferences (user_id, currency_code)
  VALUES (auth.uid(), p_currency)
  ON CONFLICT (user_id) DO UPDATE SET currency_code = EXCLUDED.currency_code, updated_at = now();
  RETURN TRUE;
END;
$$;

-- Get top earners (for admin analytics)
CREATE OR REPLACE FUNCTION public.get_top_earners(p_period text DEFAULT 'month', p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, full_name text, total_credits numeric, role text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH earnings AS (
    SELECT artist1_id AS uid, SUM(artist1_credits) AS credits FROM revenue_distributions
    WHERE has_role(auth.uid(), 'admin'::app_role) AND artist1_id IS NOT NULL
      AND CASE p_period WHEN 'day' THEN created_at >= now() - INTERVAL '1 day'
        WHEN 'week' THEN created_at >= now() - INTERVAL '7 days'
        WHEN 'month' THEN created_at >= now() - INTERVAL '30 days' ELSE TRUE END
    GROUP BY artist1_id
    UNION ALL
    SELECT artist2_id, SUM(artist2_credits) FROM revenue_distributions
    WHERE has_role(auth.uid(), 'admin'::app_role) AND artist2_id IS NOT NULL
      AND CASE p_period WHEN 'day' THEN created_at >= now() - INTERVAL '1 day'
        WHEN 'week' THEN created_at >= now() - INTERVAL '7 days'
        WHEN 'month' THEN created_at >= now() - INTERVAL '30 days' ELSE TRUE END
    GROUP BY artist2_id
    UNION ALL
    SELECT manager_id, SUM(manager_credits) FROM revenue_distributions
    WHERE has_role(auth.uid(), 'admin'::app_role) AND manager_id IS NOT NULL
      AND CASE p_period WHEN 'day' THEN created_at >= now() - INTERVAL '1 day'
        WHEN 'week' THEN created_at >= now() - INTERVAL '7 days'
        WHEN 'month' THEN created_at >= now() - INTERVAL '30 days' ELSE TRUE END
    GROUP BY manager_id
  )
  SELECT e.uid, p.full_name, SUM(e.credits)::numeric AS total_credits,
    CASE WHEN has_role(e.uid, 'manager'::app_role) THEN 'manager'
         WHEN has_role(e.uid, 'artist'::app_role) THEN 'artist' ELSE 'user' END
  FROM earnings e
  LEFT JOIN profiles p ON p.id = e.uid
  WHERE e.uid IS NOT NULL
  GROUP BY e.uid, p.full_name
  ORDER BY total_credits DESC
  LIMIT p_limit;
$$;
