-- Allow admins to view all manager profiles
CREATE POLICY "Admins can view all manager profiles"
ON public.manager_profiles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all user roles (needed for various admin features)
CREATE POLICY "Admins can view all user roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));