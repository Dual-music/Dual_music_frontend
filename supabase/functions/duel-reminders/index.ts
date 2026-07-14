/**
 * Edge Function: duel-reminders (CRON)
 *
 * Scheduled via `pg_cron`. Notifies subscribed fans of upcoming duels
 * (`duel_scheduled` → `duel_live` transitions) using `notify-user-event`.
 *
 * @endpoint POST /functions/v1/duel-reminders
 * @returns  { processed: number; notified: number }
 * @see      supabase/functions/notify-user-event
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const windows = [
      { minutesBefore: 30, label: "30min" },
      { minutesBefore: 60, label: "60min" },
    ];

    let totalNotified = 0;
    const results: Record<string, number> = {};

    for (const w of windows) {
      const target = new Date(now.getTime() + w.minutesBefore * 60 * 1000);
      const rangeStart = new Date(target.getTime() - 2 * 60 * 1000).toISOString();
      const rangeEnd = new Date(target.getTime() + 2 * 60 * 1000).toISOString();

      const { data: duels } = await supabase
        .from("duels")
        .select("id, title, artist1_id, artist2_id, scheduled_time, ticket_price")
        .eq("status", "upcoming")
        .gte("scheduled_time", rangeStart)
        .lte("scheduled_time", rangeEnd);

      for (const duel of duels || []) {
        if (!Number(duel.ticket_price)) continue; // only paid duels need a reminder

        const [{ data: a1 }, { data: a2 }, { data: tickets }] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", duel.artist1_id).maybeSingle(),
          supabase.from("profiles").select("full_name").eq("id", duel.artist2_id).maybeSingle(),
          supabase.from("duel_tickets").select("user_id").eq("duel_id", duel.id),
        ]);

        const userIds = [...new Set((tickets || []).map((t) => t.user_id))];
        if (userIds.length === 0) continue;

        const { data: alreadySent } = await supabase
          .from("duel_reminders")
          .select("user_id")
          .eq("duel_id", duel.id)
          .eq("reminder_type", w.label);
        const sentSet = new Set((alreadySent || []).map((r) => r.user_id));

        const pending = userIds.filter((u) => !sentSet.has(u));
        if (pending.length === 0) continue;

        await Promise.allSettled(
          pending.map((userId) =>
            supabase.functions.invoke("notify-user-event", {
              body: {
                userId,
                type: "duel_scheduled",
                data: {
                  duelId: duel.id,
                  artist1Name: a1?.full_name || "Artiste 1",
                  artist2Name: a2?.full_name || "Artiste 2",
                  scheduledTime: duel.scheduled_time,
                  minutesBefore: w.minutesBefore,
                },
              },
            })
          )
        );

        await supabase
          .from("duel_reminders")
          .upsert(
            pending.map((u) => ({ duel_id: duel.id, user_id: u, reminder_type: w.label })),
            { onConflict: "duel_id,user_id,reminder_type" }
          );

        totalNotified += pending.length;
        results[`${duel.title || duel.id} (${w.minutesBefore}min)`] = pending.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, totalNotified, details: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("duel-reminders error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
