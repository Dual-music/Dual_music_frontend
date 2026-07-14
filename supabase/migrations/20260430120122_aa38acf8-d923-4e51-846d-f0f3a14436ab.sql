
ALTER TABLE public.user_ui_preferences
  ADD COLUMN IF NOT EXISTS top_donor_animation text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'GMT';

ALTER TABLE public.user_ui_preferences
  DROP CONSTRAINT IF EXISTS user_ui_preferences_top_donor_animation_check;

ALTER TABLE public.user_ui_preferences
  ADD CONSTRAINT user_ui_preferences_top_donor_animation_check
  CHECK (top_donor_animation IN ('default','traversing'));
