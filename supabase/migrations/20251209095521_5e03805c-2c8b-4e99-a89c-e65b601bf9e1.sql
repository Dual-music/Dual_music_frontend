-- Create comments table for duels, lives, and lifestyle videos
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('duel', 'live', 'lifestyle')),
  content_id UUID NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on comments
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Everyone can view comments
CREATE POLICY "Everyone can view comments" 
ON public.comments 
FOR SELECT 
USING (true);

-- Authenticated users can post comments
CREATE POLICY "Authenticated users can post comments" 
ON public.comments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete their own comments" 
ON public.comments 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create comment_likes table
CREATE TABLE public.comment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Enable RLS on comment_likes
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- Everyone can view comment likes
CREATE POLICY "Everyone can view comment likes" 
ON public.comment_likes 
FOR SELECT 
USING (true);

-- Authenticated users can like comments
CREATE POLICY "Authenticated users can like comments" 
ON public.comment_likes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can unlike comments
CREATE POLICY "Users can unlike comments" 
ON public.comment_likes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_likes;

-- Insert test data for virtual gifts
INSERT INTO public.virtual_gifts (name, price, image_url) VALUES
  ('Rose', 10, '🌹'),
  ('Cœur', 20, '❤️'),
  ('Étoile', 50, '⭐'),
  ('Couronne', 100, '👑'),
  ('Diamant', 200, '💎'),
  ('Fusée', 500, '🚀'),
  ('Lion', 1000, '🦁');

-- Create function to send notification on vote
CREATE OR REPLACE FUNCTION public.notify_artist_on_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  voter_name TEXT;
BEGIN
  -- Get voter name
  SELECT full_name INTO voter_name FROM public.profiles WHERE id = NEW.user_id;
  
  -- Insert notification for artist
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.artist_id,
    'vote',
    'Nouveau vote reçu!',
    COALESCE(voter_name, 'Un fan') || ' a voté pour vous avec ' || NEW.amount || ' crédits',
    jsonb_build_object('duel_id', NEW.duel_id, 'amount', NEW.amount, 'voter_id', NEW.user_id)
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for vote notifications
CREATE TRIGGER on_new_vote
  AFTER INSERT ON public.duel_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_artist_on_vote();

-- Create function to send notification on gift
CREATE OR REPLACE FUNCTION public.notify_on_gift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name TEXT;
  gift_name TEXT;
BEGIN
  -- Get sender name
  SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.from_user_id;
  
  -- Get gift name
  SELECT name INTO gift_name FROM public.virtual_gifts WHERE id = NEW.gift_id;
  
  -- Insert notification for recipient
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.to_user_id,
    'gift',
    'Cadeau reçu!',
    COALESCE(sender_name, 'Un fan') || ' vous a envoyé un ' || COALESCE(gift_name, 'cadeau'),
    jsonb_build_object('duel_id', NEW.duel_id, 'gift_id', NEW.gift_id, 'sender_id', NEW.from_user_id)
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for gift notifications
CREATE TRIGGER on_new_gift
  AFTER INSERT ON public.gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_gift();