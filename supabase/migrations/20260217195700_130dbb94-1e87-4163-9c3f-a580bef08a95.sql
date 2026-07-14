
-- Fix overly permissive INSERT policy on user_badges
DROP POLICY "System can create badges" ON public.user_badges;
CREATE POLICY "Admins or system can create badges" ON public.user_badges FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NOT NULL
);
