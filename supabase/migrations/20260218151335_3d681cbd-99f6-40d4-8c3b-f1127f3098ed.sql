
-- Fix Security Definer View: recreate artist_leaderboard as SECURITY INVOKER
-- The current view uses SECURITY DEFINER (Postgres default for views), 
-- which bypasses RLS of the querying user. We recreate it with SECURITY INVOKER
-- so it respects the RLS policies of the querying user.

DROP VIEW IF EXISTS public.artist_leaderboard;

CREATE OR REPLACE VIEW public.artist_leaderboard
WITH (security_invoker = true)
AS
SELECT 
  ap.user_id,
  ap.stage_name,
  ap.avatar_url,
  p.full_name,
  COALESCE(SUM(dv.amount), 0) AS total_votes,
  COALESCE(COUNT(DISTINCT gt.id), 0) AS total_gifts,
  COALESCE(COUNT(DISTINCT CASE WHEN d.winner_id = ap.user_id THEN d.id END), 0) AS total_wins,
  COALESCE(SUM(dv.amount), 0) 
    + COALESCE(COUNT(DISTINCT gt.id), 0) * 10 
    + COALESCE(COUNT(DISTINCT CASE WHEN d.winner_id = ap.user_id THEN d.id END), 0) * 100 AS score
FROM artist_profiles ap
LEFT JOIN profiles p ON p.id = ap.user_id
LEFT JOIN duel_votes dv ON dv.artist_id = ap.user_id
LEFT JOIN gift_transactions gt ON gt.to_user_id = ap.user_id
LEFT JOIN duels d ON d.winner_id = ap.user_id
GROUP BY ap.user_id, ap.stage_name, ap.avatar_url, p.full_name
ORDER BY score DESC;
