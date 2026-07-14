
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_welcome_credits numeric;
  v_config jsonb;
  v_referral_code text;
  v_referrer_id uuid;
BEGIN
  -- Pull referral code from signup metadata if present
  v_referral_code := NULLIF(new.raw_user_meta_data->>'referral_code', '');
  IF v_referral_code IS NOT NULL THEN
    SELECT id INTO v_referrer_id FROM public.profiles WHERE referral_code = v_referral_code LIMIT 1;
  END IF;

  -- Insert profile (referred_by triggers AFTER INSERT logic to record referral + notify)
  INSERT INTO public.profiles (id, email, full_name, referred_by)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    v_referrer_id
  );

  -- Insert default role as fan
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'fan');

  -- Read welcome credits from platform_settings
  SELECT value INTO v_config
  FROM public.platform_settings
  WHERE key = 'welcome_config';

  v_welcome_credits := COALESCE((v_config->>'welcome_credits')::numeric, 100);

  -- Create wallet for user
  INSERT INTO public.user_wallets (user_id, balance)
  VALUES (new.id, v_welcome_credits);

  RETURN new;
END;
$function$;
