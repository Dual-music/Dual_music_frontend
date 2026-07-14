-- Create WebRTC signaling table for real-time peer connections
CREATE TABLE public.webrtc_signaling (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender_id UUID NOT NULL,
  target_id UUID,
  type TEXT NOT NULL CHECK (type IN ('offer', 'answer', 'ice-candidate', 'join', 'leave')),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webrtc_signaling ENABLE ROW LEVEL SECURITY;

-- Policies for signaling
CREATE POLICY "Authenticated users can view signaling messages in their room"
ON public.webrtc_signaling FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert their own signaling messages"
ON public.webrtc_signaling FOR INSERT
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can delete their own signaling messages"
ON public.webrtc_signaling FOR DELETE
USING (auth.uid() = sender_id);

-- Indexes for performance
CREATE INDEX idx_webrtc_signaling_room_id ON public.webrtc_signaling(room_id);
CREATE INDEX idx_webrtc_signaling_created_at ON public.webrtc_signaling(created_at);

-- Enable realtime for signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.webrtc_signaling;

-- Function to cleanup old signaling messages (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_signaling()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.webrtc_signaling WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;