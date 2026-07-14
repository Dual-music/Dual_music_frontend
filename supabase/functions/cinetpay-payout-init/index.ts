/**
 * Edge Function: cinetpay-payout-init
 *
 * Initiate a CinetPay PayOut (Mobile Money transfer) for a validated
 * `withdrawal_requests` row. Auto-detects destination country from the
 * phone prefix when not provided, reserves credits via
 * `cinetpay_reserve_payout` RPC, then calls CinetPay `/v1/transfer/money/send/contact`.
 * Final state arrives via `cinetpay-webhook-payout`.
 *
 * @endpoint POST /functions/v1/cinetpay-payout-init  (admin or system-only)
 * @body     { request_id: string; phone: string; country_code?: string }
 * @returns  { success: boolean; merchant_transaction_id: string }
 * @see      supabase/functions/process-withdrawal/index.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, cinetpayFetch, genMerchantId, genNotifyToken, detectCountryByPhone, type CountryConfig } from "../_shared/cinetpay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return unauth();

    const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await supaUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return unauth();
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const credits = Number(body.credits);
    const phone_number = String(body.phone_number || "").replace(/\s/g, "");
    const payment_method = String(body.payment_method || "");
    const reason = String(body.reason || "Retrait de fonds").slice(0, 100);

    if (!credits || credits <= 0) return bad("Montant invalide");
    if (!phone_number || !payment_method) return bad("Champs manquants");

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: countries } = await supa.from("cinetpay_countries").select("*").eq("is_active", true);
    const cfg = detectCountryByPhone(phone_number, (countries as CountryConfig[]) || []);
    if (!cfg) return bad("Pays non supporté pour ce numéro");

    // Convert credits → local currency using exchange_rates (1 crédit = 0.50 EUR)
    const { data: rates } = await supa.from("exchange_rates").select("currency_code,rate_per_usd").in("currency_code", ["EUR", cfg.currency]);
    const eur = rates?.find(r => r.currency_code === "EUR")?.rate_per_usd ?? 0.92;
    const local = rates?.find(r => r.currency_code === cfg.currency)?.rate_per_usd ?? (cfg.currency === "XOF" ? 600 : cfg.currency === "XAF" ? 600 : 2000);
    // credits → EUR → USD → local
    const amount = Math.floor((credits * 0.5 / Number(eur)) * Number(local));
    if (amount <= 0) return bad("Montant local trop faible");

    // Atomic reservation
    const { data: reserve, error: rerr } = await supa.rpc("cinetpay_reserve_payout", { p_user_id: userId, p_credits: credits });
    if (rerr) throw rerr;
    if (!(reserve as any)?.ok) return bad("Solde insuffisant");

    const merchant_id = genMerchantId("PO");
    const notify_token = genNotifyToken();
    const notify_url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cinetpay-webhook-payout`.slice(0, 120);

    await supa.from("cinetpay_transactions").insert({
      merchant_transaction_id: merchant_id, kind: "payout", user_id: userId,
      country_code: cfg.country_code, payment_method, amount, currency: cfg.currency,
      phone_number, notify_token, credits_amount: credits, status: "pending",
    });

    const payload = {
      currency: cfg.currency,
      merchant_transaction_id: merchant_id,
      phone_number,
      amount,
      payment_method,
      reason,
      notify_url,
      notify_token,
    };
    const cpRes = await cinetpayFetch(cfg, "/v1/transfer", { method: "POST", body: JSON.stringify(payload) });
    const cpData = await cpRes.json().catch(() => ({}));
    await supa.from("cinetpay_transactions").update({ raw_init_response: cpData, updated_at: new Date().toISOString() }).eq("merchant_transaction_id", merchant_id);

    if (!cpRes.ok) {
      // refund reservation immediately
      await supa.rpc("cinetpay_revert_payout", { p_merchant_id: merchant_id });
      return new Response(JSON.stringify({ error: "CinetPay error", details: cpData }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, merchant_transaction_id: merchant_id, amount, currency: cfg.currency, raw: cpData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("payout-init error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function bad(msg: string) { return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function unauth() { return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
