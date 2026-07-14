
-- Table for live stream reports
CREATE TABLE public.live_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  live_id UUID NOT NULL,
  user_id UUID NOT NULL,
  reason TEXT NOT NULL DEFAULT 'inappropriate',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.live_reports ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_live_reports_unique ON public.live_reports (live_id, user_id);

CREATE POLICY "Users can report lives" ON public.live_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Everyone can view live reports count" ON public.live_reports FOR SELECT USING (true);

-- Table for account/profile reports
CREATE TABLE public.account_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reported_user_id UUID NOT NULL,
  reporter_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.account_reports ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_account_reports_unique ON public.account_reports (reported_user_id, reporter_id);

CREATE POLICY "Users can report accounts" ON public.account_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users can view their own reports" ON public.account_reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "Admins can view all reports" ON public.account_reports FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update reports" ON public.account_reports FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Table for account warnings
CREATE TABLE public.account_warnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  warning_message TEXT NOT NULL,
  issued_by UUID,
  is_automatic BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.account_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage warnings" ON public.account_warnings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view their warnings" ON public.account_warnings FOR SELECT USING (auth.uid() = user_id);

-- Platform settings table for adjustable thresholds
CREATE TABLE public.platform_settings (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read settings" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage settings" ON public.platform_settings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.platform_settings (key, value) VALUES 
  ('live_report_viewer_threshold', '{"value": 100}'::jsonb),
  ('live_report_stop_percentage', '{"value": 75}'::jsonb),
  ('live_report_warning_delay_minutes', '{"value": 5}'::jsonb),
  ('account_report_auto_warning_threshold', '{"value": 100}'::jsonb);

-- Enable realtime for live_reports (for auto-stop)
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_reports;
