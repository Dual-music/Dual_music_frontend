
-- 1. Extend season_winners
ALTER TABLE public.season_winners
  ADD COLUMN IF NOT EXISTS notified_winner_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS meeting_proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_proposed_by uuid,
  ADD COLUMN IF NOT EXISTS meeting_when timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_location text,
  ADD COLUMN IF NOT EXISTS meeting_notes text,
  ADD COLUMN IF NOT EXISTS counter_proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS counter_when timestamptz,
  ADD COLUMN IF NOT EXISTS counter_location text,
  ADD COLUMN IF NOT EXISTS counter_notes text;

-- Allow winners to read their own row + admins (already covered by public select policy)
-- Allow winners to update only the counter_* columns through RPCs (RPCs are SECURITY DEFINER so RLS bypassed)

-- 2. distribute_season_reward
CREATE OR REPLACE FUNCTION public.distribute_season_reward(p_winner_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_winner record;
  v_reward record;
  v_season record;
  v_title text;
  v_message text;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin, 'admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;
  SELECT * INTO v_winner FROM season_winners WHERE id = p_winner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;
  SELECT * INTO v_reward FROM leaderboard_rewards
    WHERE season_id = v_winner.season_id AND rank_position = v_winner.rank_position;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'no_reward_defined'); END IF;
  SELECT * INTO v_season FROM leaderboard_seasons WHERE id = v_winner.season_id;

  IF v_reward.reward_type = 'credits' AND COALESCE(v_reward.credits_amount, 0) > 0 THEN
    INSERT INTO user_wallets (user_id, balance)
    VALUES (v_winner.user_id, v_reward.credits_amount)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = user_wallets.balance + EXCLUDED.balance, updated_at = now();
    v_title := 'Récompense reçue !';
    v_message := 'Félicitations ! ' || v_reward.credits_amount::text || ' crédits ont été ajoutés à votre portefeuille pour votre rang #'
                 || v_winner.rank_position || ' de la saison ' || COALESCE(v_season.name, '') || '.';
    UPDATE season_winners SET reward_status = 'received', distributed_at = now(), received_at = now() WHERE id = p_winner_id;

  ELSIF v_reward.reward_type = 'virtual_gift' AND v_reward.virtual_gift_id IS NOT NULL THEN
    INSERT INTO user_gifts (user_id, gift_id, quantity)
    VALUES (v_winner.user_id, v_reward.virtual_gift_id, 1)
    ON CONFLICT (user_id, gift_id) DO UPDATE
      SET quantity = user_gifts.quantity + 1;
    v_title := 'Cadeau virtuel reçu !';
    v_message := 'Félicitations ! Un cadeau virtuel vient d''être ajouté à votre inventaire pour votre rang #'
                 || v_winner.rank_position || ' de la saison ' || COALESCE(v_season.name, '') || '.';
    UPDATE season_winners SET reward_status = 'received', distributed_at = now(), received_at = now() WHERE id = p_winner_id;

  ELSE
    -- physical / mystery: needs meeting workflow
    v_title := 'Récompense à organiser';
    v_message := 'Votre récompense pour le rang #' || v_winner.rank_position || ' de la saison '
                 || COALESCE(v_season.name, '') || ' est prête. L''admin vous proposera bientôt un rendez-vous pour la remise.';
    UPDATE season_winners SET reward_status = 'distributed', distributed_at = now() WHERE id = p_winner_id;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_winner.user_id, 'season_reward_distributed', v_title, v_message,
          jsonb_build_object('winner_id', p_winner_id, 'season_id', v_winner.season_id,
                             'rank', v_winner.rank_position, 'reward_type', v_reward.reward_type));
  RETURN json_build_object('success', true);
END $$;

-- 3. notify_season_winners
CREATE OR REPLACE FUNCTION public.notify_season_winners(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_season record;
  v_count int := 0;
  r record;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin, 'admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;
  SELECT * INTO v_season FROM leaderboard_seasons WHERE id = p_season_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'season_not_found'); END IF;

  FOR r IN SELECT * FROM season_winners WHERE season_id = p_season_id AND notified_winner_at IS NULL LOOP
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (r.user_id, 'season_winner_announced',
      'Félicitations, vous êtes dans le classement !',
      'Vous êtes #' || r.rank_position || ' de la saison ' || COALESCE(v_season.name, '')
        || '. Merci pour votre engagement ! Patientez, l''admin va vous envoyer votre récompense très bientôt.',
      jsonb_build_object('winner_id', r.id, 'season_id', p_season_id, 'rank', r.rank_position));
    UPDATE season_winners SET notified_winner_at = now() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN json_build_object('success', true, 'notified', v_count);
END $$;

-- 4. propose_reward_meeting (admin)
CREATE OR REPLACE FUNCTION public.propose_reward_meeting(p_winner_id uuid, p_when timestamptz, p_location text, p_notes text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_w record;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin, 'admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;
  SELECT * INTO v_w FROM season_winners WHERE id = p_winner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;

  UPDATE season_winners SET
    meeting_status = 'proposed',
    meeting_proposed_at = now(),
    meeting_proposed_by = v_admin,
    meeting_when = p_when,
    meeting_location = p_location,
    meeting_notes = p_notes,
    counter_proposed_at = NULL, counter_when = NULL, counter_location = NULL, counter_notes = NULL
  WHERE id = p_winner_id;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_w.user_id, 'reward_meeting_proposed',
    'Rendez-vous proposé pour votre récompense',
    'L''admin vous propose un rendez-vous le ' || to_char(p_when AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC'
      || COALESCE(' — ' || p_location, '') || '. Confirmez ou proposez une autre date depuis votre profil.',
    jsonb_build_object('winner_id', p_winner_id, 'when', p_when, 'location', p_location));
  RETURN json_build_object('success', true);
END $$;

-- 5. respond_reward_meeting (winner)
CREATE OR REPLACE FUNCTION public.respond_reward_meeting(p_winner_id uuid, p_action text, p_when timestamptz, p_location text, p_notes text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_w record;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_w FROM season_winners WHERE id = p_winner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_w.user_id <> v_user THEN RETURN json_build_object('success', false, 'error', 'forbidden'); END IF;
  IF v_w.meeting_status NOT IN ('proposed', 'counter_proposed') THEN
    RETURN json_build_object('success', false, 'error', 'no_pending_proposal');
  END IF;

  IF p_action = 'confirm' THEN
    UPDATE season_winners SET meeting_status = 'confirmed' WHERE id = p_winner_id;
    IF v_w.meeting_proposed_by IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (v_w.meeting_proposed_by, 'reward_meeting_response',
        'Rendez-vous confirmé par le gagnant',
        'Le gagnant a confirmé le rendez-vous du ' || to_char(v_w.meeting_when AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC.',
        jsonb_build_object('winner_id', p_winner_id, 'status', 'confirmed'));
    END IF;
  ELSIF p_action = 'counter' THEN
    UPDATE season_winners SET
      meeting_status = 'counter_proposed',
      counter_proposed_at = now(),
      counter_when = p_when,
      counter_location = p_location,
      counter_notes = p_notes
    WHERE id = p_winner_id;
    IF v_w.meeting_proposed_by IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (v_w.meeting_proposed_by, 'reward_meeting_response',
        'Contre-proposition de rendez-vous',
        'Le gagnant propose plutôt le ' || to_char(p_when AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC'
          || COALESCE(' — ' || p_location, '') || '.',
        jsonb_build_object('winner_id', p_winner_id, 'status', 'counter_proposed', 'when', p_when));
    END IF;
  ELSE
    RETURN json_build_object('success', false, 'error', 'invalid_action');
  END IF;
  RETURN json_build_object('success', true);
END $$;

-- 6. confirm_counter_meeting (admin accepts winner's counter-proposal)
CREATE OR REPLACE FUNCTION public.confirm_counter_meeting(p_winner_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_w record;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin, 'admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;
  SELECT * INTO v_w FROM season_winners WHERE id = p_winner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_w.meeting_status <> 'counter_proposed' THEN
    RETURN json_build_object('success', false, 'error', 'no_counter_proposal');
  END IF;

  UPDATE season_winners SET
    meeting_status = 'confirmed',
    meeting_when = v_w.counter_when,
    meeting_location = v_w.counter_location,
    meeting_notes = v_w.counter_notes,
    counter_proposed_at = NULL, counter_when = NULL, counter_location = NULL, counter_notes = NULL
  WHERE id = p_winner_id;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_w.user_id, 'reward_meeting_confirmed',
    'Rendez-vous confirmé !',
    'L''admin a accepté votre contre-proposition. Rendez-vous le '
      || to_char(v_w.counter_when AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC'
      || COALESCE(' — ' || v_w.counter_location, '') || '.',
    jsonb_build_object('winner_id', p_winner_id));
  RETURN json_build_object('success', true);
END $$;

-- 7. mark_reward_received (admin)
CREATE OR REPLACE FUNCTION public.mark_reward_received(p_winner_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_w record;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin, 'admin'::app_role) THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;
  SELECT * INTO v_w FROM season_winners WHERE id = p_winner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;

  UPDATE season_winners SET reward_status = 'received', received_at = now(),
    meeting_status = CASE WHEN meeting_status IN ('confirmed','proposed','counter_proposed') THEN 'completed' ELSE meeting_status END
    WHERE id = p_winner_id;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_w.user_id, 'season_reward_received_confirmation',
    'Récompense remise',
    'L''admin a confirmé la remise de votre récompense. Merci de votre participation !',
    jsonb_build_object('winner_id', p_winner_id));
  RETURN json_build_object('success', true);
END $$;
