/**
 * Edge Function: competition-reminders (CRON)
 *
 * Scanne les `competitions` à T-30min et T-60min de leur `start_at` puis fan-out
 * un évènement `competition_reminder` via `notify-user-event` à tous les
 * détenteurs de billets et candidats approuvés. Idempotent grâce au type
 * de rappel inscrit dans la notification.
 *
 * EN — Sends 30min/60min reminders for upcoming competitions, deduped per user.
 *
 * @endpoint POST /functions/v1/competition-reminders
 * @returns  { success: boolean; totalNotified: number; details: Record<string, number> }
 * @see      notify-user-event
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const windows = [
      { minutesBefore: 30, label: "30min" },
      { minutesBefore: 60, label: "60min" },
    ];

    let totalNotified = 0;
    const details: Record<string, number> = {};

    for (const w of windows) {
      const target = new Date(now.getTime() + w.minutesBefore * 60 * 1000);
      const start = new Date(target.getTime() - 2 * 60 * 1000).toISOString();
      const end = new Date(target.getTime() + 2 * 60 * 1000).toISOString();

      const { data: comps } = await supabase
        .from("competitions")
        .select("id, title, start_at, manager_id")
        .in("status", ["published", "live"])
        .gte("start_at", start)
        .lte("start_at", end);

      for (const c of comps || []) {
        const [{ data: tickets }, { data: candidates }] = await Promise.all([
          supabase.from("competition_tickets").select("user_id").eq("competition_id", c.id),
          supabase.from("competition_candidates").select("artist_id").eq("competition_id", c.id).eq("status", "approved"),
        ]);

        const userIds = [
          ...new Set([
            ...(tickets || []).map((x: any) => x.user_id),
            ...(candidates || []).map((x: any) => x.artist_id),
          ]),
        ];
        if (!userIds.length) continue;

        await Promise.allSettled(
          userIds.map((userId) =>
            supabase.functions.invoke("notify-user-event", {
              body: {
                userId,
                type: "competition_reminder",
                data: {
                  competitionId: c.id,
                  competitionTitle: c.title,
                  minutesBefore: w.minutesBefore,
                  reminderKey: `${c.id}-${w.label}`,
                },
              },
            }),
          ),
        );
        totalNotified += userIds.length;
        details[`${c.title} (${w.minutesBefore}min)`] = userIds.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, totalNotified, details }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[competition-reminders]", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
