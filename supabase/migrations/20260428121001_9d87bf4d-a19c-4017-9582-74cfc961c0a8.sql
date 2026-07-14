
-- =========================================================
-- SPONSOR SYSTEM
-- =========================================================

CREATE TABLE IF NOT EXISTS public.sponsor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('duel','concert','artist_concert')),
  event_id uuid NOT NULL,
  description text NOT NULL,
  media_url text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','awaiting_payment','paid','approved','rejected','cancelled')),
  price_credits numeric DEFAULT 0,
  paid_at timestamptz,
  approved_at timestamptz,
  rejected_reason text,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sponsor_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create their sponsor requests" ON public.sponsor_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users view their sponsor requests" ON public.sponsor_requests
  FOR SELECT USING (auth.uid() = requester_id);

CREATE POLICY "Users update their pending sponsor requests" ON public.sponsor_requests
  FOR UPDATE USING (auth.uid() = requester_id AND status IN ('pending','awaiting_payment'));

CREATE POLICY "Admins manage all sponsor requests" ON public.sponsor_requests
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_sponsor_requests_event ON public.sponsor_requests(event_type, event_id);
CREATE INDEX idx_sponsor_requests_status ON public.sponsor_requests(status);

-- Final ad videos uploaded by admin
CREATE TABLE IF NOT EXISTS public.sponsor_ad_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('duel','concert','artist_concert')),
  event_id uuid NOT NULL,
  title text NOT NULL,
  video_url text NOT NULL,
  duration_seconds integer DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  play_count integer NOT NULL DEFAULT 0,
  source_request_ids uuid[] DEFAULT '{}',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sponsor_ad_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active ad videos" ON public.sponsor_ad_videos
  FOR SELECT USING (true);

CREATE POLICY "Admins manage ad videos" ON public.sponsor_ad_videos
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_sponsor_ad_videos_event ON public.sponsor_ad_videos(event_type, event_id, is_active);

-- Play logs
CREATE TABLE IF NOT EXISTS public.sponsor_ad_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_video_id uuid NOT NULL REFERENCES public.sponsor_ad_videos(id) ON DELETE CASCADE,
  triggered_by uuid NOT NULL,
  event_type text NOT NULL,
  event_id uuid NOT NULL,
  played_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sponsor_ad_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Triggerers and admins can view plays" ON public.sponsor_ad_plays
  FOR SELECT USING (auth.uid() = triggered_by OR has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Authenticated can insert plays" ON public.sponsor_ad_plays
  FOR INSERT WITH CHECK (auth.uid() = triggered_by);

-- Storage bucket for sponsor media
INSERT INTO storage.buckets (id, name, public)
VALUES ('sponsor-media', 'sponsor-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read sponsor media" ON storage.objects
  FOR SELECT USING (bucket_id = 'sponsor-media');

CREATE POLICY "Authenticated upload sponsor media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'sponsor-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users update own sponsor media" ON storage.objects
  FOR UPDATE USING (bucket_id = 'sponsor-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins manage sponsor media" ON storage.objects
  FOR ALL USING (bucket_id = 'sponsor-media' AND has_role(auth.uid(),'admin'::app_role));

-- Trigger updated_at
CREATE TRIGGER trg_sponsor_requests_updated
  BEFORE UPDATE ON public.sponsor_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =========================================================
-- RPC: admin sets price (awaiting_payment)
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_set_sponsor_price(p_request_id uuid, p_price_credits numeric)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_admin uuid := auth.uid(); v_req record;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin,'admin'::app_role) THEN
    RETURN json_build_object('success',false,'error','forbidden');
  END IF;
  IF p_price_credits <= 0 THEN
    RETURN json_build_object('success',false,'error','invalid_price');
  END IF;
  SELECT * INTO v_req FROM sponsor_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','not_found'); END IF;
  IF v_req.status NOT IN ('pending','awaiting_payment') THEN
    RETURN json_build_object('success',false,'error','wrong_status');
  END IF;
  UPDATE sponsor_requests SET status='awaiting_payment', price_credits=p_price_credits, reviewed_by=v_admin, updated_at=now()
    WHERE id=p_request_id;

  INSERT INTO notifications (user_id,type,title,message,data)
  VALUES (v_req.requester_id,'sponsor_payment_due','Demande de sponsoring approuvée — paiement requis',
    'Veuillez payer ' || p_price_credits || ' crédits pour finaliser votre sponsoring.',
    jsonb_build_object('request_id',p_request_id,'price',p_price_credits));

  RETURN json_build_object('success',true);
END; $$;

-- =========================================================
-- RPC: requester pays (debits wallet)
-- =========================================================
CREATE OR REPLACE FUNCTION public.pay_sponsor_request(p_request_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid(); v_req record;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated'); END IF;
  SELECT * INTO v_req FROM sponsor_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.requester_id <> v_user THEN
    RETURN json_build_object('success',false,'error','not_found');
  END IF;
  IF v_req.status <> 'awaiting_payment' THEN
    RETURN json_build_object('success',false,'error','not_payable');
  END IF;
  IF v_req.price_credits <= 0 THEN
    RETURN json_build_object('success',false,'error','no_price_set');
  END IF;

  UPDATE user_wallets SET balance = balance - v_req.price_credits, updated_at = now()
    WHERE user_id = v_user AND balance >= v_req.price_credits;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','insufficient_balance'); END IF;

  UPDATE sponsor_requests SET status='paid', paid_at=now() WHERE id=p_request_id;

  -- Notify admins
  INSERT INTO notifications (user_id,type,title,message,data)
  SELECT ur.user_id, 'sponsor_paid', 'Paiement sponsor reçu',
    'Une demande de sponsoring a été payée et attend votre approbation finale.',
    jsonb_build_object('request_id',p_request_id)
  FROM user_roles ur WHERE ur.role='admin'::app_role;

  RETURN json_build_object('success',true);
END; $$;

-- =========================================================
-- RPC: admin final approval
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_approve_sponsor(p_request_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_admin uuid := auth.uid(); v_req record;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin,'admin'::app_role) THEN
    RETURN json_build_object('success',false,'error','forbidden');
  END IF;
  SELECT * INTO v_req FROM sponsor_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','not_found'); END IF;
  IF v_req.status <> 'paid' THEN
    RETURN json_build_object('success',false,'error','not_paid');
  END IF;
  UPDATE sponsor_requests SET status='approved', approved_at=now(), reviewed_by=v_admin WHERE id=p_request_id;

  INSERT INTO notifications (user_id,type,title,message,data)
  VALUES (v_req.requester_id,'sponsor_approved','Sponsoring approuvé !',
    'Votre publicité sera diffusée pendant l''évènement.', jsonb_build_object('request_id',p_request_id));

  RETURN json_build_object('success',true);
END; $$;

-- =========================================================
-- RPC: reject sponsor (refund if already paid)
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_reject_sponsor(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_admin uuid := auth.uid(); v_req record;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin,'admin'::app_role) THEN
    RETURN json_build_object('success',false,'error','forbidden');
  END IF;
  SELECT * INTO v_req FROM sponsor_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','not_found'); END IF;

  IF v_req.status = 'paid' AND v_req.price_credits > 0 THEN
    INSERT INTO user_wallets (user_id, balance) VALUES (v_req.requester_id, v_req.price_credits)
      ON CONFLICT (user_id) DO UPDATE SET balance = user_wallets.balance + v_req.price_credits, updated_at=now();
  END IF;

  UPDATE sponsor_requests SET status='rejected', rejected_reason=p_reason, reviewed_by=v_admin WHERE id=p_request_id;

  INSERT INTO notifications (user_id,type,title,message,data)
  VALUES (v_req.requester_id,'sponsor_rejected','Sponsoring rejeté',
    COALESCE(p_reason,'Votre demande de sponsoring a été rejetée.'),
    jsonb_build_object('request_id',p_request_id));

  RETURN json_build_object('success',true);
END; $$;

-- =========================================================
-- RPC: log play
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_sponsor_ad_play(p_ad_video_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid(); v_ad record;
BEGIN
  IF v_user IS NULL THEN RETURN json_build_object('success',false,'error','not_authenticated'); END IF;
  SELECT * INTO v_ad FROM sponsor_ad_videos WHERE id = p_ad_video_id;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','not_found'); END IF;

  INSERT INTO sponsor_ad_plays (ad_video_id, triggered_by, event_type, event_id)
  VALUES (p_ad_video_id, v_user, v_ad.event_type, v_ad.event_id);

  UPDATE sponsor_ad_videos SET play_count = play_count + 1 WHERE id = p_ad_video_id;
  RETURN json_build_object('success',true);
END; $$;

-- =========================================================
-- RPC: get top donor for a context (duel/live/concert)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_top_donor(p_context_type text, p_context_id uuid)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, total_amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_context_type = 'duel' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT gt.from_user_id AS uid, COALESCE(SUM(vg.price),0)::numeric AS total
      FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.duel_id = p_context_id GROUP BY gt.from_user_id
      UNION ALL
      SELECT dv.user_id, SUM(dv.amount)::numeric FROM duel_votes dv WHERE dv.duel_id = p_context_id GROUP BY dv.user_id
    ), summed AS (
      SELECT uid, SUM(total)::numeric AS total FROM agg GROUP BY uid ORDER BY 2 DESC LIMIT 1
    )
    SELECT s.uid, p.full_name, p.avatar_url, s.total
    FROM summed s LEFT JOIN profiles p ON p.id = s.uid;
  ELSE
    RETURN QUERY
    WITH agg AS (
      SELECT gt.from_user_id AS uid, COALESCE(SUM(vg.price),0)::numeric AS total
      FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.live_id = p_context_id GROUP BY gt.from_user_id
    )
    SELECT a.uid, p.full_name, p.avatar_url, a.total
    FROM agg a LEFT JOIN profiles p ON p.id = a.uid
    ORDER BY a.total DESC LIMIT 1;
  END IF;
END; $$;
