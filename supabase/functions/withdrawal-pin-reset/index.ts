/**
 * Edge Function: withdrawal-pin-reset
 *
 * Securely resets a user's withdrawal PIN. Sends a Resend email with a
 * time-limited reset token and records the request in `withdrawal_pin_resets`.
 * The PIN gate (`WithdrawalPinGate.tsx`) enforces this PIN on every payout
 * confirmation to prevent unauthorized withdrawals.
 *
 * @endpoint POST /functions/v1/withdrawal-pin-reset
 * @auth     Bearer JWT — authenticated user only.
 * @env      RESEND_API_KEY
 * @returns  application/json { ok: true }
 * @see      src/components/profile/WithdrawalPinGate.tsx
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "not_authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User-scoped client for auth.uid()
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ success: false, error: "not_authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client to call SECURITY DEFINER and read profile
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Generate OTP via DB function (call as the user via userClient so auth.uid() works)
    const { data: rpcData, error: rpcErr } = await userClient.rpc("request_withdrawal_pin_reset");
    if (rpcErr) {
      return new Response(JSON.stringify({ success: false, error: rpcErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = rpcData as { success: boolean; otp?: string; email?: string; error?: string };
    if (!result?.success) {
      return new Response(JSON.stringify(result), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = result.email;
    const otp = result.otp;
    if (!email || !otp) {
      return new Response(JSON.stringify({ success: false, error: "missing_email_or_otp" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email
    if (RESEND_API_KEY) {
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #eee;">
          <h2 style="color:#111;">Réinitialisation du code retrait</h2>
          <p style="color:#444;">Voici votre code de vérification à 6 chiffres pour réinitialiser votre PIN de retrait :</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:16px;background:#f5f5f7;border-radius:8px;margin:16px 0;">${otp}</div>
          <p style="color:#888;font-size:13px;">Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email et changez votre mot de passe.</p>
        </div>`;

      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Dual Music <noreply@duel.music>",
          to: [email],
          subject: "Code de réinitialisation du PIN retrait",
          html,
        }),
      });
      if (!sendRes.ok) {
        const txt = await sendRes.text();
        console.error("Resend failed:", txt);
        return new Response(JSON.stringify({ success: true, warning: "otp_generated_but_email_failed" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("RESEND_API_KEY missing — OTP generated but not emailed");
    }

    return new Response(JSON.stringify({ success: true, message: "Code envoyé par email." }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("withdrawal-pin-reset error:", e);
    return new Response(JSON.stringify({ success: false, error: "internal_error", message: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
