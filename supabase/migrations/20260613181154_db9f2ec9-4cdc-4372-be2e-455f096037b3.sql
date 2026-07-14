
-- =====================================================
-- ENUMS
-- =====================================================
DO $$ BEGIN
  CREATE TYPE public.competition_mode AS ENUM ('online', 'onsite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.competition_status AS ENUM ('draft','open','candidates_locked','published','live','finished','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.competition_eligibility AS ENUM ('country','africa','world');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.competition_candidate_status AS ENUM ('pending','approved','rejected','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- 1) competitions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_url text,
  mode public.competition_mode NOT NULL,
  max_candidates integer NOT NULL DEFAULT 20 CHECK (max_candidates > 0),
  reward_description text,
  reward_amount numeric DEFAULT 0,
  entry_fee_required boolean NOT NULL DEFAULT false,
  entry_fee_amount numeric NOT NULL DEFAULT 0,
  eligibility_scope public.competition_eligibility NOT NULL DEFAULT 'country',
  eligible_countries text[] NOT NULL DEFAULT '{}',
  -- onsite location
  country text,
  city text,
  commune text,
  district text,
  venue_name text,
  venue_address text,
  venue_contact text,
  -- timeline
  application_deadline timestamptz NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  -- publication
  status public.competition_status NOT NULL DEFAULT 'draft',
  is_public_paid boolean NOT NULL DEFAULT false,
  viewer_ticket_price numeric NOT NULL DEFAULT 0,
  -- streaming
  livekit_room text,
  current_performer_id uuid,
  current_performer_started_at timestamptz,
  current_performer_duration_sec integer,
  winner_announced_at timestamptz,
  -- meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.competitions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published competitions"
  ON public.competitions FOR SELECT
  USING (status IN ('published','live','finished') OR manager_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Managers can create their own competitions"
  ON public.competitions FOR INSERT
  TO authenticated
  WITH CHECK (manager_id = auth.uid() AND has_role(auth.uid(),'manager'::app_role));

CREATE POLICY "Managers can update their own competitions"
  ON public.competitions FOR UPDATE
  TO authenticated
  USING (manager_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (manager_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Managers/admins can delete drafts"
  ON public.competitions FOR DELETE
  TO authenticated
  USING ((manager_id = auth.uid() AND status = 'draft') OR has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_competitions_updated_at
  BEFORE UPDATE ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_competitions_status ON public.competitions(status);
CREATE INDEX IF NOT EXISTS idx_competitions_manager ON public.competitions(manager_id);
CREATE INDEX IF NOT EXISTS idx_competitions_start_at ON public.competitions(start_at);

-- =====================================================
-- 2) competition_candidates
-- =====================================================
CREATE TABLE IF NOT EXISTS public.competition_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pitch text,
  video_demo_url text,
  status public.competition_candidate_status NOT NULL DEFAULT 'pending',
  entry_fee_paid boolean NOT NULL DEFAULT false,
  entry_fee_amount numeric NOT NULL DEFAULT 0,
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  final_rank integer,
  total_votes numeric NOT NULL DEFAULT 0,
  total_gifts_credits numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, artist_id)
);

GRANT SELECT ON public.competition_candidates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competition_candidates TO authenticated;
GRANT ALL ON public.competition_candidates TO service_role;

ALTER TABLE public.competition_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view approved candidates"
  ON public.competition_candidates FOR SELECT
  USING (
    status = 'approved'
    OR artist_id = auth.uid()
    OR EXISTS (SELECT 1 FROM competitions c WHERE c.id = competition_id AND c.manager_id = auth.uid())
    OR has_role(auth.uid(),'admin'::app_role)
  );

CREATE POLICY "Artists can apply"
  ON public.competition_candidates FOR INSERT
  TO authenticated
  WITH CHECK (artist_id = auth.uid() AND has_role(auth.uid(),'artist'::app_role));

CREATE POLICY "Manager/artist can update candidacy"
  ON public.competition_candidates FOR UPDATE
  TO authenticated
  USING (
    artist_id = auth.uid()
    OR EXISTS (SELECT 1 FROM competitions c WHERE c.id = competition_id AND c.manager_id = auth.uid())
    OR has_role(auth.uid(),'admin'::app_role)
  );

CREATE TRIGGER trg_comp_candidates_updated_at
  BEFORE UPDATE ON public.competition_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_comp_candidates_comp ON public.competition_candidates(competition_id);
CREATE INDEX IF NOT EXISTS idx_comp_candidates_status ON public.competition_candidates(status);

-- =====================================================
-- 3) competition_tickets
-- =====================================================
CREATE TABLE IF NOT EXISTS public.competition_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_paid numeric NOT NULL DEFAULT 0,
  paid_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, user_id)
);

GRANT SELECT, INSERT ON public.competition_tickets TO authenticated;
GRANT ALL ON public.competition_tickets TO service_role;

ALTER TABLE public.competition_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own tickets and manager sees all"
  ON public.competition_tickets FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM competitions c WHERE c.id = competition_id AND c.manager_id = auth.uid())
    OR has_role(auth.uid(),'admin'::app_role)
  );

CREATE POLICY "Users can buy own ticket"
  ON public.competition_tickets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =====================================================
-- 4) competition_votes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.competition_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.competition_candidates(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_spent numeric NOT NULL CHECK (credits_spent > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.competition_votes TO authenticated;
GRANT ALL ON public.competition_votes TO service_role;

ALTER TABLE public.competition_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read votes for ranking"
  ON public.competition_votes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Voter inserts own vote"
  ON public.competition_votes FOR INSERT
  TO authenticated
  WITH CHECK (voter_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_comp_votes_candidate ON public.competition_votes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_comp_votes_comp ON public.competition_votes(competition_id);

-- =====================================================
-- 5) competition_gifts
-- =====================================================
CREATE TABLE IF NOT EXISTS public.competition_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.competition_candidates(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_id uuid NOT NULL REFERENCES public.virtual_gifts(id),
  credits numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.competition_gifts TO authenticated;
GRANT ALL ON public.competition_gifts TO service_role;

ALTER TABLE public.competition_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can read competition gifts"
  ON public.competition_gifts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sender inserts own gift"
  ON public.competition_gifts FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_comp_gifts_candidate ON public.competition_gifts(candidate_id);

-- =====================================================
-- 6) competition_chat_messages
-- =====================================================
CREATE TABLE IF NOT EXISTS public.competition_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.competition_chat_messages(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_moderated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.competition_chat_messages TO authenticated;
GRANT ALL ON public.competition_chat_messages TO service_role;

ALTER TABLE public.competition_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read chat"
  ON public.competition_chat_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth send own message"
  ON public.competition_chat_messages FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Author/manager/admin moderate"
  ON public.competition_chat_messages FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM competitions c WHERE c.id = competition_id AND c.manager_id = auth.uid())
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'moderator'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_comp_chat_comp ON public.competition_chat_messages(competition_id, created_at);

-- =====================================================
-- 7) competition_reports
-- =====================================================
CREATE TABLE IF NOT EXISTS public.competition_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, reporter_id)
);

GRANT SELECT, INSERT ON public.competition_reports TO authenticated;
GRANT UPDATE ON public.competition_reports TO authenticated;
GRANT ALL ON public.competition_reports TO service_role;

ALTER TABLE public.competition_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporter sees own, mods/admin see all"
  ON public.competition_reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));

CREATE POLICY "Auth users can report"
  ON public.competition_reports FOR INSERT
  TO authenticated WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Mods/admin update reports"
  ON public.competition_reports FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));

-- =====================================================
-- 8) competition_bans
-- =====================================================
CREATE TABLE IF NOT EXISTS public.competition_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  banned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by uuid NOT NULL REFERENCES auth.users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, banned_user_id)
);

GRANT SELECT, INSERT, DELETE ON public.competition_bans TO authenticated;
GRANT ALL ON public.competition_bans TO service_role;

ALTER TABLE public.competition_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read bans"
  ON public.competition_bans FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Manager/admin can ban"
  ON public.competition_bans FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM competitions c WHERE c.id = competition_id AND c.manager_id = auth.uid())
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'moderator'::app_role)
  );

CREATE POLICY "Manager/admin can unban"
  ON public.competition_bans FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM competitions c WHERE c.id = competition_id AND c.manager_id = auth.uid())
    OR has_role(auth.uid(),'admin'::app_role)
  );

-- =====================================================
-- 9) competition_ads (sponsor)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.competition_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  sponsor_video_id uuid REFERENCES public.sponsor_ad_videos(id) ON DELETE CASCADE,
  scheduled_at timestamptz,
  played boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.competition_ads TO authenticated;
GRANT ALL ON public.competition_ads TO service_role;

ALTER TABLE public.competition_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read ads"
  ON public.competition_ads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manager/admin manage ads"
  ON public.competition_ads FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM competitions c WHERE c.id = competition_id AND c.manager_id = auth.uid())
    OR has_role(auth.uid(),'admin'::app_role)
  );

CREATE POLICY "Manager/admin update ads"
  ON public.competition_ads FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM competitions c WHERE c.id = competition_id AND c.manager_id = auth.uid())
    OR has_role(auth.uid(),'admin'::app_role)
  );

-- =====================================================
-- RPC: apply_to_competition
-- =====================================================
CREATE OR REPLACE FUNCTION public.apply_to_competition(
  p_competition_id uuid,
  p_pitch text DEFAULT NULL,
  p_video_demo_url text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_comp record;
  v_count int;
  v_existing uuid;
  v_cand_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated'); END IF;
  IF NOT has_role(v_user,'artist'::app_role) THEN
    RETURN json_build_object('success',false,'error','not_artist');
  END IF;

  SELECT * INTO v_comp FROM competitions WHERE id = p_competition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','not_found'); END IF;
  IF v_comp.status NOT IN ('open','published') THEN
    RETURN json_build_object('success',false,'error','closed');
  END IF;
  IF v_comp.application_deadline < now() THEN
    RETURN json_build_object('success',false,'error','deadline_passed');
  END IF;

  SELECT id INTO v_existing FROM competition_candidates
    WHERE competition_id = p_competition_id AND artist_id = v_user;
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('success',false,'error','already_applied');
  END IF;

  SELECT count(*) INTO v_count FROM competition_candidates
    WHERE competition_id = p_competition_id AND status IN ('pending','approved');
  IF v_count >= v_comp.max_candidates THEN
    RETURN json_build_object('success',false,'error','max_reached');
  END IF;

  -- entry fee
  IF v_comp.entry_fee_required AND v_comp.entry_fee_amount > 0 THEN
    UPDATE user_wallets SET balance = balance - v_comp.entry_fee_amount, updated_at = now()
      WHERE user_id = v_user AND balance >= v_comp.entry_fee_amount;
    IF NOT FOUND THEN
      RETURN json_build_object('success',false,'error','insufficient_balance');
    END IF;
    -- credit manager wallet for entry fee (full amount)
    INSERT INTO user_wallets (user_id, balance) VALUES (v_comp.manager_id, v_comp.entry_fee_amount)
      ON CONFLICT (user_id) DO UPDATE SET balance = user_wallets.balance + v_comp.entry_fee_amount, updated_at = now();
  END IF;

  INSERT INTO competition_candidates (competition_id, artist_id, pitch, video_demo_url,
      entry_fee_paid, entry_fee_amount, status)
    VALUES (p_competition_id, v_user, p_pitch, p_video_demo_url,
      v_comp.entry_fee_required, COALESCE(v_comp.entry_fee_amount,0), 'pending')
    RETURNING id INTO v_cand_id;

  INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (v_comp.manager_id, 'competition_new_candidate',
      'Nouvelle candidature',
      'Un artiste a déposé sa candidature pour : ' || v_comp.title,
      jsonb_build_object('competition_id', p_competition_id, 'candidate_id', v_cand_id));

  RETURN json_build_object('success',true,'candidate_id', v_cand_id);
END $$;

-- =====================================================
-- RPC: review_competition_candidate
-- =====================================================
CREATE OR REPLACE FUNCTION public.review_competition_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cand record;
  v_comp record;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated'); END IF;
  SELECT * INTO v_cand FROM competition_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','not_found'); END IF;
  SELECT * INTO v_comp FROM competitions WHERE id = v_cand.competition_id;
  IF v_comp.manager_id <> v_user AND NOT has_role(v_user,'admin'::app_role) THEN
    RETURN json_build_object('success',false,'error','forbidden');
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RETURN json_build_object('success',false,'error','invalid_decision');
  END IF;

  UPDATE competition_candidates SET
    status = p_decision::competition_candidate_status,
    rejection_reason = CASE WHEN p_decision='rejected' THEN p_reason END,
    reviewed_by = v_user,
    reviewed_at = now()
  WHERE id = p_candidate_id;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (v_cand.artist_id,
    'competition_candidate_' || p_decision,
    CASE WHEN p_decision='approved' THEN 'Candidature approuvée' ELSE 'Candidature rejetée' END,
    'Compétition : ' || v_comp.title || COALESCE(' — ' || p_reason, ''),
    jsonb_build_object('competition_id', v_comp.id, 'candidate_id', p_candidate_id));

  RETURN json_build_object('success', true);
END $$;

-- =====================================================
-- RPC: publish_competition
-- =====================================================
CREATE OR REPLACE FUNCTION public.publish_competition(
  p_competition_id uuid,
  p_is_paid boolean,
  p_ticket_price numeric DEFAULT 0
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_comp record;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated'); END IF;
  SELECT * INTO v_comp FROM competitions WHERE id = p_competition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','not_found'); END IF;
  IF v_comp.manager_id <> v_user AND NOT has_role(v_user,'admin'::app_role) THEN
    RETURN json_build_object('success',false,'error','forbidden');
  END IF;

  UPDATE competitions SET
    status = 'published',
    is_public_paid = p_is_paid,
    viewer_ticket_price = COALESCE(p_ticket_price,0),
    livekit_room = COALESCE(livekit_room, 'comp-' || p_competition_id::text)
  WHERE id = p_competition_id;

  RETURN json_build_object('success', true);
END $$;

-- =====================================================
-- RPC: purchase_competition_ticket
-- =====================================================
CREATE OR REPLACE FUNCTION public.purchase_competition_ticket(p_competition_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_comp record;
  v_existing uuid;
  v_ticket_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated'); END IF;
  SELECT * INTO v_comp FROM competitions WHERE id = p_competition_id;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','not_found'); END IF;

  SELECT id INTO v_existing FROM competition_tickets
    WHERE competition_id = p_competition_id AND user_id = v_user;
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('success',false,'error','already_purchased');
  END IF;

  IF v_comp.is_public_paid AND v_comp.viewer_ticket_price > 0 THEN
    UPDATE user_wallets SET balance = balance - v_comp.viewer_ticket_price, updated_at = now()
      WHERE user_id = v_user AND balance >= v_comp.viewer_ticket_price;
    IF NOT FOUND THEN
      RETURN json_build_object('success',false,'error','insufficient_balance');
    END IF;
    INSERT INTO user_wallets (user_id, balance) VALUES (v_comp.manager_id, v_comp.viewer_ticket_price)
      ON CONFLICT (user_id) DO UPDATE SET balance = user_wallets.balance + v_comp.viewer_ticket_price, updated_at = now();
  END IF;

  INSERT INTO competition_tickets (competition_id, user_id, amount_paid)
    VALUES (p_competition_id, v_user, COALESCE(v_comp.viewer_ticket_price,0))
    RETURNING id INTO v_ticket_id;

  RETURN json_build_object('success', true, 'ticket_id', v_ticket_id);
END $$;

-- =====================================================
-- RPC: vote_for_competition_candidate
-- =====================================================
CREATE OR REPLACE FUNCTION public.vote_for_competition_candidate(
  p_candidate_id uuid,
  p_credits numeric
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cand record;
  v_comp record;
  v_artist_share numeric;
  v_platform_share numeric;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated'); END IF;
  IF p_credits <= 0 THEN RETURN json_build_object('success',false,'error','invalid_amount'); END IF;
  SELECT * INTO v_cand FROM competition_candidates WHERE id = p_candidate_id;
  IF NOT FOUND OR v_cand.status <> 'approved' THEN
    RETURN json_build_object('success',false,'error','candidate_invalid');
  END IF;
  SELECT * INTO v_comp FROM competitions WHERE id = v_cand.competition_id;
  IF v_comp.status NOT IN ('live','published') THEN
    RETURN json_build_object('success',false,'error','not_live');
  END IF;

  UPDATE user_wallets SET balance = balance - p_credits, updated_at = now()
    WHERE user_id = v_user AND balance >= p_credits;
  IF NOT FOUND THEN
    RETURN json_build_object('success',false,'error','insufficient_balance');
  END IF;

  INSERT INTO competition_votes (competition_id, candidate_id, voter_id, credits_spent)
    VALUES (v_cand.competition_id, p_candidate_id, v_user, p_credits);

  UPDATE competition_candidates SET total_votes = total_votes + p_credits
    WHERE id = p_candidate_id;

  -- 80% candidat / 20% plateforme
  v_artist_share := ROUND(p_credits * 0.8, 2);
  v_platform_share := p_credits - v_artist_share;
  INSERT INTO user_wallets (user_id, balance) VALUES (v_cand.artist_id, v_artist_share)
    ON CONFLICT (user_id) DO UPDATE SET balance = user_wallets.balance + v_artist_share, updated_at = now();

  RETURN json_build_object('success', true, 'credited', v_artist_share);
END $$;

-- =====================================================
-- RPC: send_competition_gift
-- =====================================================
CREATE OR REPLACE FUNCTION public.send_competition_gift(
  p_candidate_id uuid,
  p_gift_id uuid
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cand record;
  v_comp record;
  v_qty int;
  v_price numeric;
  v_share numeric;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated'); END IF;
  SELECT * INTO v_cand FROM competition_candidates WHERE id = p_candidate_id;
  IF NOT FOUND OR v_cand.status <> 'approved' THEN
    RETURN json_build_object('success',false,'error','candidate_invalid');
  END IF;
  SELECT * INTO v_comp FROM competitions WHERE id = v_cand.competition_id;

  SELECT quantity INTO v_qty FROM user_gifts WHERE user_id = v_user AND gift_id = p_gift_id FOR UPDATE;
  IF NOT FOUND OR v_qty <= 0 THEN
    RETURN json_build_object('success',false,'error','no_inventory');
  END IF;
  SELECT price INTO v_price FROM virtual_gifts WHERE id = p_gift_id;

  IF v_qty <= 1 THEN
    DELETE FROM user_gifts WHERE user_id = v_user AND gift_id = p_gift_id;
  ELSE
    UPDATE user_gifts SET quantity = quantity - 1 WHERE user_id = v_user AND gift_id = p_gift_id;
  END IF;

  INSERT INTO competition_gifts (competition_id, candidate_id, sender_id, gift_id, credits)
    VALUES (v_comp.id, p_candidate_id, v_user, p_gift_id, v_price);

  UPDATE competition_candidates SET total_gifts_credits = total_gifts_credits + v_price
    WHERE id = p_candidate_id;

  v_share := ROUND(v_price * 0.8, 2);
  INSERT INTO user_wallets (user_id, balance) VALUES (v_cand.artist_id, v_share)
    ON CONFLICT (user_id) DO UPDATE SET balance = user_wallets.balance + v_share, updated_at = now();

  RETURN json_build_object('success', true, 'credited', v_share);
END $$;

-- =====================================================
-- RPC: set_competition_performer
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_competition_performer(
  p_competition_id uuid,
  p_candidate_id uuid,
  p_duration_sec integer
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_comp record;
BEGIN
  SELECT * INTO v_comp FROM competitions WHERE id = p_competition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','not_found'); END IF;
  IF v_comp.manager_id <> v_user AND NOT has_role(v_user,'admin'::app_role) THEN
    RETURN json_build_object('success',false,'error','forbidden');
  END IF;
  UPDATE competitions SET
    current_performer_id = p_candidate_id,
    current_performer_started_at = CASE WHEN p_candidate_id IS NULL THEN NULL ELSE now() END,
    current_performer_duration_sec = p_duration_sec
  WHERE id = p_competition_id;
  RETURN json_build_object('success', true);
END $$;

-- =====================================================
-- RPC: finalize_competition_ranking
-- =====================================================
CREATE OR REPLACE FUNCTION public.finalize_competition_ranking(p_competition_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_comp record;
  v_rec record;
  v_rank int := 0;
BEGIN
  SELECT * INTO v_comp FROM competitions WHERE id = p_competition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','not_found'); END IF;
  IF v_comp.manager_id <> v_user AND NOT has_role(v_user,'admin'::app_role) THEN
    RETURN json_build_object('success',false,'error','forbidden');
  END IF;

  FOR v_rec IN
    SELECT id FROM competition_candidates
    WHERE competition_id = p_competition_id AND status = 'approved'
    ORDER BY (total_votes + total_gifts_credits) DESC, created_at ASC
  LOOP
    v_rank := v_rank + 1;
    UPDATE competition_candidates SET final_rank = v_rank WHERE id = v_rec.id;
  END LOOP;

  UPDATE competitions SET status = 'finished', winner_announced_at = now() WHERE id = p_competition_id;

  RETURN json_build_object('success', true, 'ranked', v_rank);
END $$;

-- =====================================================
-- Realtime publication
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.competitions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_candidates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_gifts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_bans;
