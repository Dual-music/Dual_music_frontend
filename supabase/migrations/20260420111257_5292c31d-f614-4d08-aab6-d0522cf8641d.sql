
-- Function to generate a unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := 'REF-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

-- Trigger function: on profile insert, set referral_code (if missing) and create referral entry if referred_by is set
CREATE OR REPLACE FUNCTION public.handle_referral_on_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_code TEXT;
BEGIN
  -- Always ensure new profile has a referral_code
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_referral_code ON public.profiles;
CREATE TRIGGER trg_profiles_referral_code
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_referral_on_profile();

-- After-insert trigger: if referred_by is set, create the referral row
CREATE OR REPLACE FUNCTION public.create_referral_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_code TEXT;
BEGIN
  IF NEW.referred_by IS NOT NULL THEN
    SELECT referral_code INTO v_referrer_code FROM public.profiles WHERE id = NEW.referred_by;
    IF v_referrer_code IS NOT NULL THEN
      INSERT INTO public.referrals (referrer_id, referred_id, referral_code, status)
      VALUES (NEW.referred_by, NEW.id, v_referrer_code, 'completed')
      ON CONFLICT (referred_id) DO NOTHING;

      -- Notify referrer
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        NEW.referred_by,
        'referral',
        'Nouveau filleul!',
        COALESCE(NEW.full_name, 'Un nouvel utilisateur') || ' s''est inscrit via votre lien de parrainage',
        jsonb_build_object('referred_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_create_referral ON public.profiles;
CREATE TRIGGER trg_profiles_create_referral
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.create_referral_entry();

-- Backfill: generate referral codes for existing profiles without one
UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL OR referral_code = '';

-- Helper function: lookup referrer id by referral code (used during signup)
CREATE OR REPLACE FUNCTION public.get_user_id_by_referral_code(p_code TEXT)
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE referral_code = p_code LIMIT 1;
$$;
