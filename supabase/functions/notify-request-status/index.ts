/**
 * Edge Function: notify-request-status
 *
 * Sends a status-update notification (in-app + email) when an admin reviews a
 * user-submitted request: artist validation, manager validation, withdrawal
 * approval/refusal, sponsor application, etc.
 *
 * @endpoint POST /functions/v1/notify-request-status
 * @body     { userId: string; requestType: string; status: "approved"|"refused"; reason?: string }
 * @returns  { success: boolean }
 * @see      src/components/profile/RequestTracker.tsx
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyPayload {
  userId: string;
  requestType: "artist" | "manager" | "withdrawal";
  newStatus: "approved" | "rejected" | "completed";
  amount?: number;
}

const getEmailContent = (requestType: string, newStatus: string, amount?: number) => {
  const baseUrl = "https://dualmusic.app";

  const typeLabels: Record<string, string> = {
    artist: "Demande de statut Artiste",
    manager: "Demande de statut Manager",
    withdrawal: "Demande de retrait",
  };

  const statusConfig: Record<string, { label: string; color: string; emoji: string }> = {
    approved: { label: "Approuvée ✅", color: "#22c55e", emoji: "🎉" },
    completed: { label: "Effectuée ✅", color: "#22c55e", emoji: "💸" },
    rejected: { label: "Refusée ❌", color: "#ef4444", emoji: "😔" },
  };

  const status = statusConfig[newStatus] || { label: newStatus, color: "#6b7280", emoji: "ℹ️" };
  const typeLabel = typeLabels[requestType] || "Demande";

  let specificMessage = "";
  if (requestType === "artist" && newStatus === "approved") {
    specificMessage = "Félicitations ! Votre profil artiste est maintenant actif. Vous pouvez dès à présent participer aux duels, publier des vidéos lifestyle et gérer vos concerts.";
  } else if (requestType === "artist" && newStatus === "rejected") {
    specificMessage = "Votre demande de statut artiste a été refusée. Vous pouvez soumettre une nouvelle demande avec plus d'informations sur votre activité artistique.";
  } else if (requestType === "manager" && newStatus === "approved") {
    specificMessage = "Félicitations ! Votre profil manager est maintenant actif. Vous pouvez dès à présent organiser et gérer des duels entre artistes.";
  } else if (requestType === "manager" && newStatus === "rejected") {
    specificMessage = "Votre demande de statut manager a été refusée. Vous pouvez soumettre une nouvelle demande avec plus d'informations sur votre expérience.";
  } else if (requestType === "withdrawal" && newStatus === "completed") {
    specificMessage = `Votre retrait de ${amount || ""}€ a été traité avec succès. Les fonds ont été envoyés selon vos informations de paiement.`;
  } else if (requestType === "withdrawal" && newStatus === "rejected") {
    specificMessage = "Votre demande de retrait a été refusée. Veuillez vérifier vos informations de paiement ou contacter le support.";
  }

  const subject = `${status.emoji} Dual Music – Votre ${typeLabel} : ${status.label}`;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:16px 16px 0 0;padding:40px 40px 30px;text-align:center;">
              <div style="font-size:42px;margin-bottom:10px;">🎵</div>
              <h1 style="color:#ffffff;font-size:28px;font-weight:900;margin:0;letter-spacing:-0.5px;">DUAL MUSIC</h1>
              <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">La Battle Continue</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="background:#13131f;padding:40px;border-left:1px solid #1e1e2e;border-right:1px solid #1e1e2e;">
              
              <!-- Status Badge -->
              <div style="text-align:center;margin-bottom:30px;">
                <div style="display:inline-block;background:${status.color}20;border:2px solid ${status.color};border-radius:50px;padding:12px 28px;">
                  <span style="color:${status.color};font-size:18px;font-weight:700;">${status.emoji} ${status.label}</span>
                </div>
              </div>

              <h2 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 16px;text-align:center;">${typeLabel}</h2>
              
              <p style="color:#a0a0b8;font-size:16px;line-height:1.7;margin:0 0 24px;text-align:center;">${specificMessage}</p>

              <!-- Divider -->
              <div style="border-top:1px solid #1e1e2e;margin:28px 0;"></div>

              <!-- CTA -->
              <div style="text-align:center;margin-top:28px;">
                <a href="${baseUrl}/profile" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);color:#ffffff;text-decoration:none;padding:16px 36px;border-radius:50px;font-weight:700;font-size:16px;letter-spacing:0.5px;">
                  Voir mon Profil
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0d0d18;border-radius:0 0 16px 16px;border:1px solid #1e1e2e;border-top:none;padding:28px 40px;text-align:center;">
              <p style="color:#4a4a6a;font-size:12px;margin:0 0 8px;">
                Vous recevez cet email car vous avez soumis une demande sur Dual Music.
              </p>
              <p style="color:#4a4a6a;font-size:12px;margin:0;">
                © 2025 Dual Music – Tous droits réservés
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, html };
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

    const payload: NotifyPayload = await req.json();
    const { userId, requestType, newStatus, amount } = payload;

    // Get user email from profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.email) {
      console.error("Could not find user profile:", profileError);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Always create in-app notification
    const statusLabels: Record<string, string> = {
      approved: "approuvée",
      completed: "effectuée",
      rejected: "refusée",
    };
    const typeLabels: Record<string, string> = {
      artist: "Demande artiste",
      manager: "Demande manager",
      withdrawal: "Demande de retrait",
    };

    const notifTitle = `${typeLabels[requestType] || "Demande"} ${statusLabels[newStatus] || newStatus}`;
    let notifMessage = "";
    if (requestType === "withdrawal" && newStatus === "completed") {
      notifMessage = `Votre retrait de ${amount || ""}€ a été traité avec succès.`;
    } else if (newStatus === "approved") {
      notifMessage = `Félicitations ! Votre ${typeLabels[requestType]?.toLowerCase()} a été approuvée.`;
    } else if (newStatus === "rejected") {
      notifMessage = `Votre ${typeLabels[requestType]?.toLowerCase()} a été refusée.`;
    }

    await supabase.from("notifications").insert({
      user_id: userId,
      type: `request_${newStatus}`,
      title: notifTitle,
      message: notifMessage,
      data: { request_type: requestType, status: newStatus },
    });

    // Send email if Resend is configured
    if (resendApiKey) {
      const { subject, html } = getEmailContent(requestType, newStatus, amount);

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Dual Music <noreply@dualmusic.app>",
          to: [profile.email],
          subject,
          html,
        }),
      });

      if (!emailResponse.ok) {
        const errBody = await emailResponse.text();
        console.error("Resend error:", errBody);
        // Don't fail the whole request – in-app notif was already sent
        return new Response(
          JSON.stringify({ success: true, emailSent: false, reason: errBody }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, emailSent: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailSent: false, reason: "RESEND_API_KEY not configured" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
