CREATE TABLE IF NOT EXISTS public.user_ui_preferences (
  user_id UUID NOT NULL PRIMARY KEY,
  top_donor_mode TEXT NOT NULL DEFAULT 'full' CHECK (top_donor_mode IN ('full','reduced','off')),
  reduce_animations BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their ui prefs" ON public.user_ui_preferences;
CREATE POLICY "Users read their ui prefs" ON public.user_ui_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert their ui prefs" ON public.user_ui_preferences;
CREATE POLICY "Users insert their ui prefs" ON public.user_ui_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update their ui prefs" ON public.user_ui_preferences;
CREATE POLICY "Users update their ui prefs" ON public.user_ui_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_user_ui_preferences()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_user_ui_preferences ON public.user_ui_preferences;
CREATE TRIGGER trg_touch_user_ui_preferences BEFORE UPDATE ON public.user_ui_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_user_ui_preferences();

DROP FUNCTION IF EXISTS public.get_top_donor(text, uuid);

CREATE OR REPLACE FUNCTION public.get_top_donor(p_context_type text, p_context_id uuid)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, total_amount numeric, last_message text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_context_type = 'duel' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT gt.from_user_id AS uid, COALESCE(SUM(vg.price),0)::numeric AS total
      FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.duel_id = p_context_id GROUP BY gt.from_user_id
      UNION ALL
      SELECT dv.user_id, SUM(dv.amount)::numeric FROM duel_votes dv WHERE dv.duel_id = p_context_id GROUP BY dv.user_id
    ), summed AS (
      SELECT uid, SUM(total)::numeric AS total FROM agg GROUP BY uid ORDER BY 2 DESC LIMIT 1
    )
    SELECT s.uid, p.full_name, p.avatar_url, s.total,
      (SELECT m.message FROM duel_chat_messages m
        WHERE m.duel_id = p_context_id AND m.user_id = s.uid AND COALESCE(m.is_moderated,false)=false
        ORDER BY m.created_at DESC LIMIT 1)
    FROM summed s LEFT JOIN profiles p ON p.id = s.uid;

  ELSIF p_context_type = 'concert' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT gt.from_user_id AS uid, COALESCE(SUM(vg.price),0)::numeric AS total
      FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.live_id = p_context_id GROUP BY gt.from_user_id
    )
    SELECT a.uid, p.full_name, p.avatar_url, a.total,
      (SELECT m.message FROM concert_chat_messages m
        WHERE m.concert_id = p_context_id AND m.user_id = a.uid AND COALESCE(m.is_moderated,false)=false
        ORDER BY m.created_at DESC LIMIT 1)
    FROM agg a LEFT JOIN profiles p ON p.id = a.uid
    ORDER BY a.total DESC LIMIT 1;

  ELSE
    RETURN QUERY
    WITH agg AS (
      SELECT gt.from_user_id AS uid, COALESCE(SUM(vg.price),0)::numeric AS total
      FROM gift_transactions gt LEFT JOIN virtual_gifts vg ON vg.id = gt.gift_id
      WHERE gt.live_id = p_context_id GROUP BY gt.from_user_id
    )
    SELECT a.uid, p.full_name, p.avatar_url, a.total,
      (SELECT m.message FROM live_chat_messages m
        WHERE m.live_id = p_context_id AND m.user_id = a.uid AND COALESCE(m.is_moderated,false)=false
        ORDER BY m.created_at DESC LIMIT 1)
    FROM agg a LEFT JOIN profiles p ON p.id = a.uid
    ORDER BY a.total DESC LIMIT 1;
  END IF;
END; $$;