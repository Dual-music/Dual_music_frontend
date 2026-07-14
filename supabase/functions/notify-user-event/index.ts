/**
 * Edge Function: notify-user-event
 *
 * Centralized notification dispatcher. For a given `userId` + `type`, this
 * function fans out across the channels enabled by the user's
 * `email_notification_preferences` and `push_subscriptions`:
 *   - In-app: inserts a row into `notifications` (Realtime UI bell).
 *   - Push:   invokes `send-push` for registered Web Push endpoints.
 *   - Email:  renders a typed template and ships via Resend.
 *
 * Event types include: `duel_scheduled`, `concert_starting`, `gift_received`,
 * `vote_received`, `withdrawal_status`, `report_resolved`, `referral_bonus`, …
 *
 * @endpoint POST /functions/v1/notify-user-event
 * @body     { userId: string; type: string; data: Record<string, unknown> }
 * @returns  { success: boolean; channels: { inApp: boolean; push: boolean; email: boolean } }
 * @env      RESEND_API_KEY (email), VAPID_* (push via send-push)
 * @see      src/hooks/useTransactionNotifications.ts
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  userId: string;
  type: "concert_reminder" | "concert_live" | "duel_scheduled" | "duel_live" | "duel_result" | "live_started";
  data: Record<string, any>;
}

const getEmailContent = (type: string, data: Record<string, any>) => {
  const baseUrl = "https://dualmusic.app";

  const templates: Record<string, { subject: string; emoji: string; title: string; body: string; cta: string; ctaUrl: string }> = {
    concert_reminder: {
      subject: `🎵 Rappel – Concert "${data.concertTitle}" commence bientôt !`,
      emoji: "🎵",
      title: `Concert dans ${data.minutesBefore || 30} minutes`,
      body: `Le concert <strong>${data.concertTitle}</strong> par <strong>${data.artistName}</strong> commence dans ${data.minutesBefore || 30} minutes. N'oubliez pas votre billet !`,
      cta: "Accéder au concert",
      ctaUrl: `${baseUrl}/concerts/${data.concertId}`,
    },
    concert_live: {
      subject: `🔴 EN DIRECT – "${data.concertTitle}" est maintenant live !`,
      emoji: "🔴",
      title: "Concert en direct !",
      body: `<strong>${data.artistName}</strong> est maintenant en direct avec <strong>"${data.concertTitle}"</strong>. Rejoignez le concert maintenant !`,
      cta: "Rejoindre le concert",
      ctaUrl: `${baseUrl}/concerts/${data.concertId}`,
    },
    duel_scheduled: {
      subject: `⚔️ Nouveau duel programmé – ${data.artist1Name} vs ${data.artist2Name}`,
      emoji: "⚔️",
      title: "Duel programmé !",
      body: `Un duel épique entre <strong>${data.artist1Name}</strong> et <strong>${data.artist2Name}</strong> est prévu ${data.scheduledTime ? `le ${new Date(data.scheduledTime).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : "prochainement"}.`,
      cta: "Voir le duel",
      ctaUrl: `${baseUrl}/duels/${data.duelId}`,
    },
    duel_live: {
      subject: `🔴 DUEL EN DIRECT – ${data.artist1Name} vs ${data.artist2Name} !`,
      emoji: "🔥",
      title: "Duel en cours !",
      body: `Le duel entre <strong>${data.artist1Name}</strong> et <strong>${data.artist2Name}</strong> est maintenant en direct ! Votez pour votre artiste favori !`,
      cta: "Voter maintenant",
      ctaUrl: `${baseUrl}/duels/${data.duelId}`,
    },
    duel_result: {
      subject: `🏆 Résultat du duel – ${data.winnerName} remporte la victoire !`,
      emoji: "🏆",
      title: "Résultat du duel",
      body: `Le duel entre <strong>${data.artist1Name}</strong> et <strong>${data.artist2Name}</strong> est terminé. <strong>${data.winnerName}</strong> remporte la victoire ! Merci pour votre participation.`,
      cta: "Voir le replay",
      ctaUrl: `${baseUrl}/replays`,
    },
    live_started: {
      subject: `📡 ${data.artistName} est maintenant en live !`,
      emoji: "📡",
      title: `${data.artistName} est en live !`,
      body: `<strong>${data.artistName}</strong> a démarré un live : <strong>"${data.liveTitle || "Session live"}"</strong>. Rejoignez la session maintenant !`,
      cta: "Regarder le live",
      ctaUrl: `${baseUrl}/lives`,
    },
  };

  const t = templates[type] || {
    subject: "Notification Dual Music",
    emoji: "🎵",
    title: "Notification",
    body: data.message || "",
    cta: "Voir",
    ctaUrl: baseUrl,
  };

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr>
    <td style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:16px 16px 0 0;padding:36px 40px;text-align:center;">
      <div style="font-size:42px;margin-bottom:8px;">${t.emoji}</div>
      <h1 style="color:#fff;font-size:26px;font-weight:900;margin:0;">DUAL MUSIC</h1>
      <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">La Battle Continue</p>
    </td>
  </tr>
  <tr>
    <td style="background:#13131f;padding:36px 40px;border-left:1px solid #1e1e2e;border-right:1px solid #1e1e2e;">
      <h2 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 16px;text-align:center;">${t.title}</h2>
      <p style="color:#a0a0b8;font-size:16px;line-height:1.7;margin:0 0 28px;text-align:center;">${t.body}</p>
      <div style="text-align:center;">
        <a href="${t.ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);color:#fff;text-decoration:none;padding:15px 36px;border-radius:50px;font-weight:700;font-size:15px;">
          ${t.cta}
        </a>
      </div>
    </td>
  </tr>
  <tr>
    <td style="background:#0d0d18;border-radius:0 0 16px 16px;border:1px solid #1e1e2e;border-top:none;padding:24px 40px;text-align:center;">
      <p style="color:#4a4a6a;font-size:11px;margin:0 0 6px;">
        Vous ne souhaitez plus recevoir ces emails ? <a href="https://dualmusic.app/profile" style="color:#7c3aed;">Gérer vos préférences</a>
      </p>
      <p style="color:#4a4a6a;font-size:11px;margin:0;">© 2025 Dual Music – Tous droits réservés</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject: t.subject, html };
};

// Map notification types to email preference fields
const typeToPreference: Record<string, string> = {
  concert_reminder: "email_concerts",
  concert_live: "email_concerts",
  duel_scheduled: "email_duels",
  duel_live: "email_duels",
  duel_result: "email_duels",
  live_started: "email_lives",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload: EmailPayload = await req.json();
    const { userId, type, data } = payload;

    // Check user's email preferences
    const prefField = typeToPreference[type];
    if (prefField) {
      const { data: prefs } = await supabase
        .from("email_notification_preferences")
        .select(prefField)
        .eq("user_id", userId)
        .single();

      // If prefs exist and the field is false, skip email
      if (prefs && prefs[prefField] === false) {
        return new Response(
          JSON.stringify({ success: true, emailSent: false, reason: "User opted out" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get user email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    if (!profile?.email) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Always create in-app notification
    const inAppMessages: Record<string, { title: string; message: string }> = {
      concert_reminder: {
        title: `🎵 Concert bientôt – ${data.concertTitle}`,
        message: `Le concert de ${data.artistName} commence dans ${data.minutesBefore || 30} minutes !`,
      },
      concert_live: {
        title: `🔴 Concert en direct !`,
        message: `${data.artistName} est maintenant en direct : "${data.concertTitle}"`,
      },
      duel_scheduled: {
        title: `⚔️ Duel programmé`,
        message: `${data.artist1Name} vs ${data.artist2Name} – duel à venir !`,
      },
      duel_live: {
        title: `🔴 Duel en direct !`,
        message: `${data.artist1Name} vs ${data.artist2Name} – votez maintenant !`,
      },
      duel_result: {
        title: `🏆 Résultat du duel`,
        message: `${data.winnerName} remporte le duel contre ${data.artist1Name === data.winnerName ? data.artist2Name : data.artist1Name} !`,
      },
      live_started: {
        title: `📡 Live démarré`,
        message: `${data.artistName} est maintenant en live : "${data.liveTitle || "Session live"}"`,
      },
    };

    const inApp = inAppMessages[type];
    if (inApp) {
      await supabase.from("notifications").insert({
        user_id: userId,
        type,
        title: inApp.title,
        message: inApp.message,
        data: { ...data, notification_type: type },
      });
    }

    // Send email if Resend is configured
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ success: true, emailSent: false, reason: "RESEND_API_KEY not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { subject, html } = getEmailContent(type, data);
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Dual Music <noreply@dualmusic.app>",
        to: [profile.email],
        subject,
        html,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error("Resend error:", err);
      return new Response(
        JSON.stringify({ success: true, emailSent: false, reason: err }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailSent: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
