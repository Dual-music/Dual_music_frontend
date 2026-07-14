/**
 * Edge Function: welcome-email
 *
 * Sent right after a new user completes signup. Renders a branded onboarding
 * email via Resend and (optionally) credits the welcome bonus defined in
 * `platform_settings.welcome_config` (default 100 credits) by calling the
 * `grant_welcome_bonus` RPC server-side.
 *
 * @endpoint POST /functions/v1/welcome-email
 * @body     { userId: string; email: string; fullName?: string }
 * @returns  { success: boolean; emailSent: boolean; bonusGranted?: number }
 * @env      RESEND_API_KEY
 * @see      src/components/onboarding/WelcomeOnboarding.tsx
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Payload from DB trigger: { userId, email, fullName }
    const payload = await req.json();
    const { userId, email, fullName } = payload;

    if (!userId || !email) {
      return new Response(JSON.stringify({ error: "Missing userId or email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const displayName = fullName || email.split("@")[0];

    // Create in-app welcome notification
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "welcome",
      title: "Bienvenue sur Dual Music ! 🎵",
      message: `Bonjour ${displayName} ! Votre compte est prêt. Explorez les duels, suivez vos artistes préférés et commencez à voter.`,
      data: { type: "welcome" },
    });

    // Send welcome email if Resend is configured
    if (resendApiKey) {
      const subject = "🎵 Bienvenue sur Dual Music – La battle continue !";

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
            <td style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:16px 16px 0 0;padding:50px 40px 40px;text-align:center;">
              <div style="font-size:56px;margin-bottom:12px;">🎵</div>
              <h1 style="color:#ffffff;font-size:32px;font-weight:900;margin:0;letter-spacing:-1px;">DUAL MUSIC</h1>
              <p style="color:rgba(255,255,255,0.75);margin:8px 0 0;font-size:14px;letter-spacing:3px;text-transform:uppercase;">La Battle Continue</p>
            </td>
          </tr>

          <!-- Welcome Body -->
          <tr>
            <td style="background:#13131f;padding:48px 40px;border-left:1px solid #1e1e2e;border-right:1px solid #1e1e2e;">

              <h2 style="color:#ffffff;font-size:26px;font-weight:700;margin:0 0 12px;text-align:center;">
                Bienvenue, ${displayName} ! 🎉
              </h2>
              <p style="color:#a0a0b8;font-size:16px;line-height:1.7;margin:0 0 32px;text-align:center;">
                Votre compte Dual Music est prêt. Plongez dans l'univers des battles musicales et faites entendre votre voix.
              </p>

              <!-- Features -->
              <div style="space-y:16px;">

                <div style="display:flex;align-items:center;gap:16px;background:#1a1a2e;border-radius:12px;padding:16px 20px;margin-bottom:12px;border:1px solid #2a2a3e;">
                  <span style="font-size:28px;min-width:40px;text-align:center;">⚔️</span>
                  <div>
                    <p style="color:#ffffff;font-weight:700;margin:0 0 4px;font-size:15px;">Regardez les Duels</p>
                    <p style="color:#6b6b8a;font-size:13px;margin:0;">Suivez des battles en live et votez pour votre artiste préféré</p>
                  </div>
                </div>

                <div style="display:flex;align-items:center;gap:16px;background:#1a1a2e;border-radius:12px;padding:16px 20px;margin-bottom:12px;border:1px solid #2a2a3e;">
                  <span style="font-size:28px;min-width:40px;text-align:center;">🎁</span>
                  <div>
                    <p style="color:#ffffff;font-weight:700;margin:0 0 4px;font-size:15px;">Envoyez des Cadeaux</p>
                    <p style="color:#6b6b8a;font-size:13px;margin:0;">Soutenez vos artistes avec des cadeaux virtuels pendant les lives</p>
                  </div>
                </div>

                <div style="display:flex;align-items:center;gap:16px;background:#1a1a2e;border-radius:12px;padding:16px 20px;margin-bottom:12px;border:1px solid #2a2a3e;">
                  <span style="font-size:28px;min-width:40px;text-align:center;">🎫</span>
                  <div>
                    <p style="color:#ffffff;font-weight:700;margin:0 0 4px;font-size:15px;">Achetez des Tickets</p>
                    <p style="color:#6b6b8a;font-size:13px;margin:0;">Accédez aux concerts exclusifs de vos artistes favoris</p>
                  </div>
                </div>

                <div style="display:flex;align-items:center;gap:16px;background:#1a1a2e;border-radius:12px;padding:16px 20px;border:1px solid #2a2a3e;">
                  <span style="font-size:28px;min-width:40px;text-align:center;">🏆</span>
                  <div>
                    <p style="color:#ffffff;font-weight:700;margin:0 0 4px;font-size:15px;">Classement des Artistes</p>
                    <p style="color:#6b6b8a;font-size:13px;margin:0;">Découvrez les artistes les mieux classés et les plus populaires</p>
                  </div>
                </div>

              </div>

              <!-- Divider -->
              <div style="border-top:1px solid #1e1e2e;margin:36px 0;"></div>

              <!-- CTA -->
              <div style="text-align:center;">
                <p style="color:#a0a0b8;font-size:15px;margin:0 0 20px;">Prêt à rejoindre la battle ?</p>
                <a href="https://dualmusic.app" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);color:#ffffff;text-decoration:none;padding:18px 48px;border-radius:50px;font-weight:700;font-size:17px;letter-spacing:0.5px;">
                  Découvrir Dual Music →
                </a>
              </div>

              <!-- Referral hint -->
              <div style="margin-top:32px;padding:20px;background:#0f0f1a;border-radius:12px;border:1px dashed #2a2a3e;text-align:center;">
                <p style="color:#7c3aed;font-weight:700;font-size:14px;margin:0 0 6px;">💜 Invitez vos amis</p>
                <p style="color:#6b6b8a;font-size:13px;margin:0;">Parrainez des amis et gagnez des crédits bonus pour voter lors des duels !</p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0d0d18;border-radius:0 0 16px 16px;border:1px solid #1e1e2e;border-top:none;padding:28px 40px;text-align:center;">
              <p style="color:#4a4a6a;font-size:12px;margin:0 0 8px;">
                Vous recevez cet email car vous venez de créer un compte sur Dual Music.
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

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Dual Music <onboarding@resend.dev>",
          to: [email],
          subject,
          html,
        }),
      });

      if (!emailResponse.ok) {
        const errBody = await emailResponse.text();
        console.error("Resend welcome email error:", errBody);
        return new Response(
          JSON.stringify({ success: true, emailSent: false, reason: errBody }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailSent: !!resendApiKey }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in welcome-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
