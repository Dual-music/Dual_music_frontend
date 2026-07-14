-- Create a function that calls the welcome-email edge function via HTTP
-- This uses pg_net (available in Supabase) to make async HTTP calls
CREATE OR REPLACE FUNCTION public.trigger_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edge_function_url text;
  service_role_key text;
BEGIN
  -- Get Supabase URL and service role key from vault or env
  edge_function_url := 'https://hvpylzrcbswxhyjbgelz.supabase.co/functions/v1/welcome-email';
  
  -- Call the edge function asynchronously using pg_net
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_key', true)
    ),
    body := jsonb_build_object(
      'userId', NEW.id,
      'email', NEW.email,
      'fullName', NEW.full_name
    )
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the trigger even if HTTP call fails
  RAISE WARNING 'welcome-email trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table (fires after a new user profile is inserted)
DROP TRIGGER IF EXISTS on_new_user_welcome_email ON public.profiles;
CREATE TRIGGER on_new_user_welcome_email
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_welcome_email();
