
-- 1. Profile ban extensions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_until timestamptz,
  ADD COLUMN IF NOT EXISTS banned_is_permanent boolean NOT NULL DEFAULT false;

-- 2. Live reports: status + admin access
ALTER TABLE public.live_reports
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

DROP POLICY IF EXISTS "Admins view all live reports" ON public.live_reports;
CREATE POLICY "Admins view all live reports" ON public.live_reports
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update live reports" ON public.live_reports;
CREATE POLICY "Admins update live reports" ON public.live_reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Notify users when banned from a single stream
CREATE OR REPLACE FUNCTION public.notify_stream_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type_label text;
  v_title text;
  v_msg text;
BEGIN
  v_type_label := CASE NEW.stream_type
    WHEN 'live' THEN 'un live'
    WHEN 'concert' THEN 'un concert'
    WHEN 'duel' THEN 'un duel'
    ELSE NEW.stream_type
  END;
  v_title := 'Accès retiré à ' || v_type_label;
  v_msg := 'Vous avez été retiré de cet événement par l''organisateur. '
        || 'Motif : ' || COALESCE(NULLIF(NEW.reason,''), 'non précisé') || '. '
        || 'Ce bannissement ne concerne que cet événement ; vos autres accès restent ouverts. '
        || 'Pour faire appel, contactez la modération via la page Contact.';

  INSERT INTO public.notifications(user_id, type, title, message, data)
  VALUES (
    NEW.banned_user_id,
    'ban_stream',
    v_title,
    v_msg,
    jsonb_build_object(
      'scope', 'event',
      'stream_type', NEW.stream_type,
      'stream_id', NEW.stream_id,
      'banned_by', NEW.banned_by
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_stream_ban ON public.stream_bans;
CREATE TRIGGER trg_notify_stream_ban
  AFTER INSERT ON public.stream_bans
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_stream_ban();

-- 4. Notify users when their account is suspended platform-wide
CREATE OR REPLACE FUNCTION public.notify_platform_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dur text;
  v_msg text;
BEGIN
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned AND NEW.is_banned = true THEN
    v_dur := CASE
      WHEN NEW.banned_is_permanent THEN 'permanente (sans date de fin)'
      WHEN NEW.banned_until IS NOT NULL THEN 'jusqu''au ' || to_char(NEW.banned_until AT TIME ZONE 'UTC', 'DD/MM/YYYY HH24:MI') || ' UTC'
      ELSE 'temporaire'
    END;
    v_msg := 'Votre accès à la plateforme a été suspendu (' || v_dur || '). '
          || 'Motif : ' || COALESCE(NULLIF(NEW.banned_reason,''), 'non précisé') || '. '
          || 'Pour faire appel, contactez la modération via la page Contact.';

    INSERT INTO public.notifications(user_id, type, title, message, data)
    VALUES (
      NEW.id,
      'ban_platform',
      'Compte suspendu',
      v_msg,
      jsonb_build_object(
        'scope', 'platform',
        'until', NEW.banned_until,
        'permanent', NEW.banned_is_permanent
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_platform_ban ON public.profiles;
CREATE TRIGGER trg_notify_platform_ban
  AFTER UPDATE OF is_banned ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_platform_ban();
