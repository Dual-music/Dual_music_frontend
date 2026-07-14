
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_welcome_credits numeric;
  v_config jsonb;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email)
  );

  -- Insert default role as fan
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'fan');

  -- Read welcome credits from platform_settings
  SELECT value INTO v_config
  FROM public.platform_settings
  WHERE key = 'welcome_config';

  v_welcome_credits := COALESCE((v_config->>'welcome_credits')::numeric, 100);

  -- Create wallet for user with configurable starting balance
  INSERT INTO public.user_wallets (user_id, balance)
  VALUES (new.id, v_welcome_credits);

  RETURN new;
END;
$$;
