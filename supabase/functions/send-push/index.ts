/**
 * Edge Function: send-push
 *
 * Web Push dispatcher invoked by a DB trigger on `notifications` insert
 * (or directly by `notify-user-event`). For each row in `push_subscriptions`
 * matching the target user, builds a VAPID-signed payload and pushes it via
 * the standard Web Push protocol (FCM / Mozilla / Apple endpoints).
 *
 * Stale endpoints (HTTP 404/410) are pruned from `push_subscriptions`.
 *
 * @endpoint POST /functions/v1/send-push
 * @body     { userId: string; title: string; body: string; url?: string; data?: object }
 * @returns  { success: boolean; delivered: number; pruned: number }
 * @env      VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * @see      public/push-sw.js (service-worker reception handler)
 * @see      src/hooks/useTransactionNotifications.ts
 */
// Web Push sender — invoked by a DB trigger on `notifications` insert.
// Uses the web-push protocol via npm:web-push (Deno NPM compat).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  user_id?: string;
  user_ids?: string[];
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  image?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@dualmusic.app";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve the VAPID public key — fall back to platform_settings if env not set
    let publicKey = vapidPublic;
    if (!publicKey) {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "push_config").maybeSingle();
      publicKey = (data?.value as any)?.vapid_public_key || "";
    }

    if (!publicKey || !vapidPrivate) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    webpush.setVapidDetails(vapidSubject, publicKey, vapidPrivate);

    const payload = (await req.json()) as PushPayload;
    const userIds = payload.user_ids ?? (payload.user_id ? [payload.user_id] : []);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ error: "user_id or user_ids required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifPayload = JSON.stringify({
      title: payload.title,
      body: payload.body || "",
      url: payload.url || "/",
      icon: payload.icon,
      image: payload.image,
      tag: payload.tag,
      data: payload.data || {},
    });

    let sent = 0;
    const expired: string[] = [];
    await Promise.all(
      subs.map(async (s: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            notifPayload,
          );
          sent++;
        } catch (err: any) {
          const code = err?.statusCode;
          if (code === 404 || code === 410) expired.push(s.endpoint);
          else console.error("push error", code, err?.body || err?.message);
        }
      }),
    );

    if (expired.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", expired);
    }

    return new Response(JSON.stringify({ sent, expired: expired.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-push fatal", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
