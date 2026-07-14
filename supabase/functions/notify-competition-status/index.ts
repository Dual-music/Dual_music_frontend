/**
 * Edge Function: notify-competition-status
 *
 * Notifie une décision de candidature compétition (approuvée / rejetée) :
 * insère une notification in-app pour l'artiste candidat et déclenche
 * `send-push` si une souscription Web Push existe.
 *
 * EN — Notifies a competition applicant about approval/rejection via
 * in-app notification + optional Web Push.
 *
 * @endpoint POST /functions/v1/notify-competition-status
 * @body     { candidateId: string; decision: "approved" | "rejected"; reason?: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { candidateId, decision, reason } = await req.json();
    if (!candidateId || !["approved", "rejected"].includes(decision)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cand } = await supabase
      .from("competition_candidates")
      .select("id, artist_id, competition_id")
      .eq("id", candidateId)
      .maybeSingle();
    if (!cand) {
      return new Response(JSON.stringify({ error: "Candidate not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: comp } = await supabase
      .from("competitions")
      .select("id, title")
      .eq("id", cand.competition_id)
      .maybeSingle();

    const isApproved = decision === "approved";
    const title = isApproved
      ? `✅ Candidature approuvée – ${comp?.title || "Compétition"}`
      : `❌ Candidature refusée – ${comp?.title || "Compétition"}`;
    const message = isApproved
      ? `Félicitations ! Votre candidature à la compétition "${comp?.title}" a été approuvée.`
      : `Votre candidature à la compétition "${comp?.title}" a été refusée.${reason ? " Motif : " + reason : ""}`;

    await supabase.from("notifications").insert({
      user_id: cand.artist_id,
      title,
      message,
      type: `competition_${decision}`,
      link: `/competition/${cand.competition_id}`,
    });

    // Best-effort push
    try {
      await supabase.functions.invoke("send-push", {
        body: {
          userId: cand.artist_id,
          title,
          body: message,
          url: `/competition/${cand.competition_id}`,
        },
      });
    } catch (_e) { /* push optional */ }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
