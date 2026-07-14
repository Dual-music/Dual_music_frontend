/**
 * Edge Function: cinetpay-payin-init
 *
 * Initialize a CinetPay hosted-checkout PayIn (Mobile Money / Cards) for the
 * authenticated user. Looks up per-country credentials in `cinetpay_countries`,
 * generates a unique `merchant_transaction_id` + `notify_token`, persists a
 * pending row in `cinetpay_transactions`, then calls CinetPay `/v2/payment`.
 *
 * On success the client receives the hosted payment URL. Final crediting of
 * the wallet happens in `cinetpay-webhook-payin` (verified by `notify_token`).
 *
 * @endpoint POST /functions/v1/cinetpay-payin-init
 * @body     { amount: number; currency: string; country_code: string; phone?: string }
 * @returns  { payment_url: string; merchant_transaction_id: string }
 * @throws   CinetPayIpRejectedError — proxy / IP allow-list misconfiguration
 * @see      supabase/functions/cinetpay-webhook-payin/index.ts
 * @see      src/components/wallet/CinetPayRechargeForm.tsx
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { CinetPayIpRejectedError, corsHeaders, cinetpayFetch, genMerchantId, genNotifyToken, type CountryConfig } from "../_shared/cinetpay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: cerr } = await supaUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (cerr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;
    const userEmail = (claims.claims.email as string) || "client@app.com";

    const body = await req.json();
    const amount = Math.floor(Number(body.amount));
    const country_code = String(body.country_code || "").toUpperCase();
    const payment_method = String(body.payment_method || "");
    const phone_number = String(body.phone_number || "").replace(/\s/g, "");
    const otp_code = body.otp_code ? String(body.otp_code) : undefined;
    const designation = String(body.designation || "Recharge de compte").slice(0, 100);
    const first_name = String(body.first_name || "Client").slice(0, 60);
    const last_name = String(body.last_name || "App").slice(0, 60);

    if (!amount || amount <= 0) return badRequest("Montant invalide");
    if (!country_code || !payment_method || !phone_number) return badRequest("Champs obligatoires manquants");

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: country, error: ce } = await supa.from("cinetpay_countries").select("*").eq("country_code", country_code).maybeSingle();
    if (ce || !country || !country.is_active) return badRequest("Pays non disponible");
    const cfg = country as CountryConfig;

    const ops = (country.operators as Array<{ code: string }>) || [];
    if (!ops.some(o => o.code === payment_method)) return badRequest("Opérateur invalide pour ce pays");

    const merchant_id = genMerchantId("PI");
    const notify_token = genNotifyToken();
    const origin = req.headers.get("origin") || "https://app.example.com";
    const success_url = `${origin}/wallet?recharge=success&provider=cinetpay&mid=${merchant_id}`.slice(0, 120);
    const failed_url = `${origin}/wallet?recharge=failed&provider=cinetpay&mid=${merchant_id}`.slice(0, 120);
    const notify_url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cinetpay-webhook-payin`.slice(0, 120);

    const { error: insErr } = await supa.from("cinetpay_transactions").insert({
      merchant_transaction_id: merchant_id,
      kind: "payin", user_id: userId,
      country_code, payment_method, amount, currency: country.currency,
      phone_number, notify_token, status: "pending",
    });
    if (insErr) throw insErr;

    const payload: Record<string, unknown> = {
      currency: country.currency,
      payment_method,
      merchant_transaction_id: merchant_id,
      amount,
      lang: "fr",
      designation,
      client_email: userEmail,
      client_first_name: first_name,
      client_last_name: last_name,
      client_phone_number: phone_number,
      success_url, failed_url, notify_url,
      notify_token,
      direct_pay: !!otp_code,
    };
    if (otp_code) payload.otp_code = otp_code;

    const cpRes = await cinetpayFetch(cfg, "/v1/payment", { method: "POST", body: JSON.stringify(payload) });
    const cpData = await cpRes.json().catch(() => ({}));
    await supa.from("cinetpay_transactions").update({ raw_init_response: cpData, updated_at: new Date().toISOString() }).eq("merchant_transaction_id", merchant_id);

    if (!cpRes.ok) {
      return new Response(JSON.stringify({ error: "CinetPay error", details: cpData }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const details = cpData?.data || cpData?.details || cpData;
    return new Response(JSON.stringify({
      ok: true,
      merchant_transaction_id: merchant_id,
      must_be_redirected: !!details?.must_be_redirected,
      payment_url: details?.payment_url,
      status: details?.status,
      message: details?.message,
      raw: details,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("payin-init error", e);
    const message = (e as Error).message || "Erreur CinetPay";
    if (e instanceof CinetPayIpRejectedError) {
      return new Response(JSON.stringify({
        error: `CinetPay refuse la connexion : l’adresse IP du backend ${e.egressIp ?? "inconnue"} n’est pas autorisée dans votre compte CinetPay Sandbox. Ajoutez cette IP à la whitelist CinetPay, puis réessayez.`,
        code: "CINETPAY_IP_REJECTED",
        egress_ip: e.egressIp,
        cinetpay_status: e.status,
        cinetpay_raw_response: e.rawResponse,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const isIpWhitelistError = message.includes("NOT_ALLOWED") || message.toLowerCase().includes("withlisted") || message.toLowerCase().includes("whitelisted");
    const userMessage = isIpWhitelistError
      ? "CinetPay refuse la connexion : l’adresse IP du backend n’est pas autorisée dans votre compte CinetPay Sandbox. Ajoutez l’IP du backend Lovable Cloud à la whitelist CinetPay, puis réessayez."
      : message;
    return new Response(JSON.stringify({ error: userMessage }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function badRequest(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
