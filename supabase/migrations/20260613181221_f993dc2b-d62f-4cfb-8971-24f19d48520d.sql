
REVOKE EXECUTE ON FUNCTION public.apply_to_competition(uuid,text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.review_competition_candidate(uuid,text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.publish_competition(uuid,boolean,numeric) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.purchase_competition_ticket(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.vote_for_competition_candidate(uuid,numeric) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.send_competition_gift(uuid,uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_competition_performer(uuid,uuid,integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.finalize_competition_ranking(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.apply_to_competition(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_competition_candidate(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_competition(uuid,boolean,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_competition_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vote_for_competition_candidate(uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_competition_gift(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_competition_performer(uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_competition_ranking(uuid) TO authenticated;
