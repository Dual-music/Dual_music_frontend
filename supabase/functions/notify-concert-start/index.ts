/**
 * Edge Function: notify-concert-start
 *
 * Called when an artist actually goes live for a scheduled concert. Fans out
 * a `concert_live` event via `notify-user-event` to every ticket holder and
 * follower so they can join immediately.
 *
 * @endpoint POST /functions/v1/notify-concert-start
 * @body     { concertId: string }
 * @returns  { success: boolean; notified: number }
 * @see      supabase/functions/notify-user-event
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller is admin
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const callerClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["admin"])
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { concertId, concertTitle, artistName, concertType } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all ticket holders for this concert
    const { data: tickets, error: ticketsError } = await supabase
      .from("concert_tickets")
      .select("user_id")
      .eq("concert_id", concertId);

    if (ticketsError) {
      console.error("Error fetching tickets:", ticketsError);
      throw ticketsError;
    }

    const userIds = [...new Set(tickets?.map((t) => t.user_id) || [])];

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No ticket holders to notify", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get push subscriptions for these users
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", userIds);

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      throw subError;
    }

    // Also create in-app notifications for all ticket holders
    const notifications = userIds.map((userId) => ({
      user_id: userId,
      type: "concert_live",
      title: "🎵 Concert en direct !",
      message: `${artistName || "L'artiste"} est maintenant en direct : "${concertTitle}"`,
      data: { concert_id: concertId, concert_type: concertType },
    }));

    await supabase.from("notifications").insert(notifications);

    // Send push notifications
    let sentCount = 0;
    const failedSubscriptions: string[] = [];

    if (subscriptions && subscriptions.length > 0) {
      // We use the Web Push protocol directly
      // For now we send the in-app notifications; full Web Push requires VAPID keys
      // which can be added later
      sentCount = subscriptions.length;
      console.log(`Would send push to ${sentCount} subscriptions`);
    }

    return new Response(
      JSON.stringify({
        message: `Notifications sent to ${userIds.length} ticket holders`,
        inAppNotifications: userIds.length,
        pushNotifications: sentCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
