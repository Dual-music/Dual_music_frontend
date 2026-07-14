-- Create admin_logs table to track all admin actions
CREATE TABLE public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_name text,
  action_type text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  target_name text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs
CREATE POLICY "Admins can view admin logs"
  ON public.admin_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert logs
CREATE POLICY "Admins can insert admin logs"
  ON public.admin_logs FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Index for performance
CREATE INDEX idx_admin_logs_created_at ON public.admin_logs(created_at DESC);
CREATE INDEX idx_admin_logs_admin_id ON public.admin_logs(admin_id);
CREATE INDEX idx_admin_logs_action_type ON public.admin_logs(action_type);
