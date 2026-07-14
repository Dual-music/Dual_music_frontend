-- Ajouter colonnes pour téléphone et pays aux profils
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'FR',
ADD COLUMN IF NOT EXISTS phone_country_code TEXT DEFAULT '+33',
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS banned_reason TEXT;

-- Table pour abonnements premium fans (extension de fan_subscriptions)
ALTER TABLE public.fan_subscriptions 
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS price_amount NUMERIC DEFAULT 0;

-- Vue pour classement artistes
CREATE OR REPLACE VIEW public.artist_leaderboard AS
SELECT 
  ap.user_id,
  ap.stage_name,
  ap.avatar_url,
  p.full_name,
  COALESCE(SUM(dv.amount), 0) as total_votes,
  (SELECT COUNT(*) FROM gift_transactions gt WHERE gt.to_user_id = ap.user_id) as total_gifts,
  (SELECT COUNT(*) FROM duels d WHERE d.winner_id = ap.user_id) as total_wins,
  (COALESCE(SUM(dv.amount), 0) * 10 + 
   (SELECT COUNT(*) FROM gift_transactions gt WHERE gt.to_user_id = ap.user_id) * 5 + 
   (SELECT COUNT(*) FROM duels d WHERE d.winner_id = ap.user_id) * 50) as score
FROM artist_profiles ap
LEFT JOIN profiles p ON p.id = ap.user_id
LEFT JOIN duel_votes dv ON dv.artist_id = ap.user_id
GROUP BY ap.user_id, ap.stage_name, ap.avatar_url, p.full_name
ORDER BY score DESC;

-- Politique pour les admins de modifier tout
CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete any profile" 
ON public.profiles 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins peuvent supprimer dans toutes les tables
CREATE POLICY "Admins can delete any blog" 
ON public.blogs 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete any duel" 
ON public.duels 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete any concert" 
ON public.concerts 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete any replay" 
ON public.replay_videos 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete comments" 
ON public.comments 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete lifestyle videos" 
ON public.lifestyle_videos 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger pour notifier quand un duel est créé
CREATE OR REPLACE FUNCTION public.notify_new_duel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  artist1_name TEXT;
  artist2_name TEXT;
BEGIN
  SELECT full_name INTO artist1_name FROM public.profiles WHERE id = NEW.artist1_id;
  SELECT full_name INTO artist2_name FROM public.profiles WHERE id = NEW.artist2_id;
  
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.artist1_id,
    'duel',
    'Nouveau duel programmé!',
    'Votre duel contre ' || COALESCE(artist2_name, 'un artiste') || ' a été programmé',
    jsonb_build_object('duel_id', NEW.id)
  );
  
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.artist2_id,
    'duel',
    'Nouveau duel programmé!',
    'Votre duel contre ' || COALESCE(artist1_name, 'un artiste') || ' a été programmé',
    jsonb_build_object('duel_id', NEW.id)
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_duel ON public.duels;
CREATE TRIGGER on_new_duel
  AFTER INSERT ON public.duels
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_duel();