ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS application_opens_at timestamptz;

CREATE OR REPLACE FUNCTION public.apply_to_competition(p_competition_id uuid, p_pitch text DEFAULT NULL::text, p_video_demo_url text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_comp.application_opens_at IS NOT NULL AND v_comp.application_opens_at > now() THEN
    RETURN json_build_object('success',false,'error','applications_not_open_yet');
  END IF;
  IF v_comp.application_deadline < now() THEN
    RETURN json_build_object('success',false,'error','deadline_passed');
  END IF;

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

  SELECT id INTO v_existing FROM competition_candidates
    WHERE competition_id = p_competition_id AND artist_id = v_user;
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('success',false,'error','already_applied');
  END IF;

  SELECT count(*) INTO v_count FROM competition_candidates
    WHERE competition_id = p_competition_id AND status IN ('pending','approved');
  IF v_count >= v_comp.max_candidates THEN
    RETURN json_build_object('success',false,'error','full');
  END IF;

  IF COALESCE(v_comp.entry_fee_required,false) AND COALESCE(v_comp.entry_fee_amount,0) > 0 THEN
    UPDATE user_wallets SET balance = balance - v_comp.entry_fee_amount
      WHERE user_id = v_user AND balance >= v_comp.entry_fee_amount;
    IF NOT FOUND THEN
      RETURN json_build_object('success',false,'error','insufficient_balance');
    END IF;
  END IF;

  INSERT INTO competition_candidates (competition_id, artist_id, pitch, video_demo_url, status)
    VALUES (p_competition_id, v_user, p_pitch, p_video_demo_url, 'pending')
    RETURNING id INTO v_cand_id;

  RETURN json_build_object('success',true,'candidate_id',v_cand_id);
END;
$function$;