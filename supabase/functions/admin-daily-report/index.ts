/**
 * Edge Function: admin-daily-report (CRON)
 *
 * Sent every morning to platform admins. Aggregates the previous 24h: new
 * users, revenue (recharges, gifts, votes), active duels/concerts/lives,
 * moderation actions and outstanding withdrawal requests. Renders a Resend
 * email and ships to every user with the `admin` role.
 *
 * @endpoint POST /functions/v1/admin-daily-report
 * @returns  { success: boolean; recipients: number }
 * @env      RESEND_API_KEY
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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.log("RESEND_API_KEY not configured, skipping email");
      return new Response(JSON.stringify({ success: false, reason: "RESEND_API_KEY not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Determine period from body (default: daily)
    let period = "daily";
    try {
      const body = await req.json();
      period = body?.period || "daily";
    } catch {}
    const since = period === "weekly" ? lastWeek : yesterday;
    const sinceISO = since.toISOString();
    const periodLabel = period === "weekly" ? "hebdomadaire" : "quotidien";

    // ── Fetch stats ──────────────────────────────────────────────
    const [
      { count: newUsers },
      { count: pendingArtistReqs },
      { count: pendingManagerReqs },
      { count: pendingWithdrawals },
      { data: withdrawalData },
      { count: newDuels },
      { count: activeLives },
      { count: upcomingConcerts },
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", sinceISO),
      supabase.from("artist_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("manager_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("withdrawal_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("withdrawal_requests").select("amount").eq("status", "pending"),
      supabase.from("duels").select("*", { count: "exact", head: true }).gte("created_at", sinceISO),
      supabase.from("artist_lives").select("*", { count: "exact", head: true }).eq("status", "live"),
      supabase.from("artist_concerts").select("*", { count: "exact", head: true }).eq("status", "upcoming"),
    ]);

    const totalWithdrawalAmount = withdrawalData?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) || 0;

    // Get admin emails
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(JSON.stringify({ success: false, reason: "No admins found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminIds = adminRoles.map((r: any) => r.user_id);
    const { data: adminProfiles } = await supabase
      .from("profiles")
      .select("email, full_name")
      .in("id", adminIds);

    if (!adminProfiles || adminProfiles.length === 0) {
      return new Response(JSON.stringify({ success: false, reason: "No admin profiles found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminEmails = adminProfiles.map((p: any) => p.email).filter(Boolean);

    // ── Build email HTML ─────────────────────────────────────────
    const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const hasAlerts = (pendingArtistReqs || 0) > 0 || (pendingManagerReqs || 0) > 0 || (pendingWithdrawals || 0) > 0;

    const statCard = (icon: string, label: string, value: string | number, alert = false) => `
      <td style="padding:8px;width:50%;">
        <div style="background:${alert && Number(value) > 0 ? '#2d1a1a' : '#1a1a2e'};border:1px solid ${alert && Number(value) > 0 ? '#ef4444' : '#2a2a4a'};border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:28px;margin-bottom:6px;">${icon}</div>
          <div style="color:${alert && Number(value) > 0 ? '#ef4444' : '#a0a0c0'};font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${label}</div>
          <div style="color:#fff;font-size:28px;font-weight:900;">${value}</div>
        </div>
      </td>`;

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">📊</div>
      <h1 style="color:#fff;font-size:24px;font-weight:900;margin:0;">DUAL MUSIC</h1>
      <p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Rapport ${periodLabel} – ${dateStr}</p>
    </td>
  </tr>

  ${hasAlerts ? `
  <!-- Alert Banner -->
  <tr>
    <td style="background:#1a0a0a;border-left:4px solid #ef4444;border-right:4px solid #ef4444;padding:16px 24px;">
      <p style="color:#ef4444;font-weight:700;margin:0;font-size:14px;">⚠️ Des actions admin sont requises — voir les éléments en attente ci-dessous.</p>
    </td>
  </tr>` : ""}

  <!-- Body -->
  <tr>
    <td style="background:#13131f;padding:32px 40px;border-left:1px solid #1e1e2e;border-right:1px solid #1e1e2e;">

      <!-- New Activity -->
      <h2 style="color:#a78bfa;font-size:14px;text-transform:uppercase;letter-spacing:2px;margin:0 0 16px;font-weight:600;">Nouvelle activité (${periodLabel})</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;">
        <tr>
          ${statCard("👤", "Nouveaux inscrits", newUsers || 0)}
          ${statCard("⚔️", "Nouveaux duels", newDuels || 0)}
        </tr>
      </table>

      <!-- Platform Status -->
      <h2 style="color:#a78bfa;font-size:14px;text-transform:uppercase;letter-spacing:2px;margin:0 0 16px;font-weight:600;">État de la plateforme</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;">
        <tr>
          ${statCard("📡", "Lives actifs", activeLives || 0)}
          ${statCard("🎵", "Concerts à venir", upcomingConcerts || 0)}
        </tr>
      </table>

      <!-- Pending Actions -->
      <h2 style="color:#f87171;font-size:14px;text-transform:uppercase;letter-spacing:2px;margin:0 0 16px;font-weight:600;">⚠️ Actions requises</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;">
        <tr>
          ${statCard("🎤", "Demandes artiste", pendingArtistReqs || 0, true)}
          ${statCard("💼", "Demandes manager", pendingManagerReqs || 0, true)}
        </tr>
        <tr>
          ${statCard("💸", "Retraits en attente", pendingWithdrawals || 0, true)}
          ${statCard("💰", "Montant total retraits", `${totalWithdrawalAmount.toFixed(0)}€`, true)}
        </tr>
      </table>

      <div style="border-top:1px solid #1e1e2e;margin:8px 0 24px;"></div>

      <!-- CTA -->
      <div style="text-align:center;">
        <a href="https://dualmusic.app/admin" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;">
          Accéder au Dashboard Admin
        </a>
      </div>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#0d0d18;border-radius:0 0 16px 16px;border:1px solid #1e1e2e;border-top:none;padding:24px 40px;text-align:center;">
      <p style="color:#4a4a6a;font-size:12px;margin:0;">Rapport automatique Dual Music · © 2025 Tous droits réservés</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const subject = `${hasAlerts ? "⚠️ " : "📊 "}Rapport ${periodLabel} Dual Music – ${dateStr}`;

    // Send to all admins
    let sentCount = 0;
    for (const email of adminEmails) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Dual Music <noreply@dualmusic.app>",
          to: [email],
          subject,
          html,
        }),
      });
      if (res.ok) sentCount++;
      else console.error("Resend error for", email, await res.text());
    }

    return new Response(
      JSON.stringify({ success: true, period, sentCount, adminCount: adminEmails.length }),
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
