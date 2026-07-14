-- Enforce competition eligibility (country/africa/world) in apply_to_competition RPC
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
  v_artist_country text;
  v_africa text[] := ARRAY['DZ','AO','BJ','BW','BF','BI','CM','CV','CF','TD','KM','CG','CD','CI','DJ','EG','GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN','SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','EH','ZM','ZW'];
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

  -- Eligibility enforcement based on artist's profile country
  SELECT country_code INTO v_artist_country FROM profiles WHERE id = v_user;
  IF v_comp.eligibility_scope = 'country' THEN
    IF v_artist_country IS NULL OR NOT (v_artist_country = ANY(COALESCE(v_comp.eligible_countries, ARRAY[]::text[]))) THEN
      RETURN json_build_object('success',false,'error','not_eligible_country');
    END IF;
  ELSIF v_comp.eligibility_scope = 'africa' THEN
    IF v_artist_country IS NULL OR NOT (v_artist_country = ANY(v_africa)) THEN
      RETURN json_build_object('success',false,'error','not_eligible_africa');
    END IF;
  END IF;
  -- 'world' => no restriction

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

  IF v_comp.entry_fee_required AND v_comp.entry_fee_amount > 0 THEN
    UPDATE user_wallets SET balance = balance - v_comp.entry_fee_amount, updated_at = now()
      WHERE user_id = v_user AND balance >= v_comp.entry_fee_amount;
    IF NOT FOUND THEN
      RETURN json_build_object('success',false,'error','insufficient_balance');
    END IF;
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

REVOKE EXECUTE ON FUNCTION public.apply_to_competition(uuid,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.apply_to_competition(uuid,text,text) TO authenticated;