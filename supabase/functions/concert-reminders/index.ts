/**
 * Edge Function: concert-reminders (CRON)
 *
 * Scheduled via `pg_cron` + `pg_net`. Scans `concerts` whose `scheduled_time`
 * falls inside the next reminder window (typically T-30min) and fans out
 * `concert_reminder` events through `notify-user-event` to all ticket holders
 * and followers of the host artist.
 *
 * @endpoint POST /functions/v1/concert-reminders
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

    // Compute time windows: 30 min and 60 min ahead (±2 min tolerance)
    const windows = [
      { minutesBefore: 30, label: "30min" },
      { minutesBefore: 60, label: "60min" },
    ];

    let totalNotified = 0;
    const results: Record<string, number> = {};

    for (const window of windows) {
      const targetTime = new Date(now.getTime() + window.minutesBefore * 60 * 1000);
      const rangeStart = new Date(targetTime.getTime() - 2 * 60 * 1000).toISOString(); // -2 min
      const rangeEnd = new Date(targetTime.getTime() + 2 * 60 * 1000).toISOString();   // +2 min

      // Query upcoming concerts in both tables within this window
      const [{ data: artistConcerts }, { data: adminConcerts }] = await Promise.all([
        supabase
          .from("artist_concerts")
          .select("id, title, artist_id, scheduled_date")
          .eq("status", "upcoming")
          .gte("scheduled_date", rangeStart)
          .lte("scheduled_date", rangeEnd),
        supabase
          .from("concerts")
          .select("id, title, artist_name, scheduled_date, scheduled_time")
          .eq("status", "upcoming")
          .gte("scheduled_date", rangeStart)
          .lte("scheduled_date", rangeEnd),
      ]);

      const concertList: Array<{ id: string; title: string; artistName: string; isArtistConcert: boolean }> = [];

      for (const c of artistConcerts || []) {
        // Get artist name from profiles
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", c.artist_id)
          .maybeSingle();

        concertList.push({
          id: c.id,
          title: c.title,
          artistName: profile?.full_name || "L'artiste",
          isArtistConcert: true,
        });
      }

      for (const c of adminConcerts || []) {
        concertList.push({
          id: c.id,
          title: c.title,
          artistName: c.artist_name || "L'artiste",
          isArtistConcert: false,
        });
      }

      for (const concert of concertList) {
        // Get all ticket holders for this concert
        const { data: tickets } = await supabase
          .from("concert_tickets")
          .select("user_id")
          .eq("concert_id", concert.id);

        if (!tickets || tickets.length === 0) continue;

        // Deduplicate user IDs
        const userIds = [...new Set(tickets.map((t) => t.user_id))];

        // Check which reminders have already been sent (avoid duplicates)
        const { data: alreadySent } = await supabase
          .from("concert_reminders")
          .select("user_id")
          .eq("concert_id", concert.id)
          .eq("reminder_type", window.label)
          .eq("sent", true);

        const alreadySentIds = new Set(alreadySent?.map((r) => r.user_id) || []);

        // Send to users who haven't received this reminder yet
        const pendingUserIds = userIds.filter((uid) => !alreadySentIds.has(uid));

        if (pendingUserIds.length === 0) continue;

        // Notify each user via notify-user-event
        await Promise.allSettled(
          pendingUserIds.map((userId) =>
            supabase.functions.invoke("notify-user-event", {
              body: {
                userId,
                type: "concert_reminder",
                data: {
                  concertId: concert.id,
                  concertTitle: concert.title,
                  artistName: concert.artistName,
                  minutesBefore: window.minutesBefore,
                },
              },
            })
          )
        );

        // Mark reminders as sent
        const reminderRows = pendingUserIds.map((userId) => ({
          concert_id: concert.id,
          user_id: userId,
          reminder_type: window.label,
          sent: true,
        }));

        await supabase
          .from("concert_reminders")
          .upsert(reminderRows, { onConflict: "concert_id,user_id,reminder_type" });

        totalNotified += pendingUserIds.length;
        results[`${concert.title} (${window.minutesBefore}min)`] = pendingUserIds.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, totalNotified, details: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in concert-reminders:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
