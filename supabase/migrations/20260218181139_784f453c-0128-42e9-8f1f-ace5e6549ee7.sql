-- Table des préférences de notifications email pour les utilisateurs
CREATE TABLE public.email_notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  -- Types de notifications que l'utilisateur peut désactiver par email
  email_concerts boolean NOT NULL DEFAULT true,
  email_duels boolean NOT NULL DEFAULT true,
  email_gifts boolean NOT NULL DEFAULT true,
  email_votes boolean NOT NULL DEFAULT true,
  email_requests boolean NOT NULL DEFAULT true, -- approbations/rejets de demandes
  email_assignments boolean NOT NULL DEFAULT true, -- assignations duel/concert
  email_system boolean NOT NULL DEFAULT true, -- emails système (bienvenue, retrait)
  email_lives boolean NOT NULL DEFAULT true, -- notifications de lives
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own preferences
CREATE POLICY "Users can view their own email preferences"
  ON public.email_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email preferences"
  ON public.email_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email preferences"
  ON public.email_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all preferences (for admin summary emails)
CREATE POLICY "Admins can view all email preferences"
  ON public.email_notification_preferences FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can read preferences for sending emails
-- (handled via supabase service role key in edge functions)

-- Auto-create preferences when a profile is created
CREATE OR REPLACE FUNCTION public.create_default_email_preferences()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.email_notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_create_email_prefs
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_default_email_preferences();

-- Trigger to update updated_at
CREATE TRIGGER update_email_prefs_updated_at
  BEFORE UPDATE ON public.email_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();