/**
 * Edge Function: moneroo-payout-init
 *
 * Initiate a Moneroo PayOut (Mobile Money transfer) for a validated
 * `withdrawal_requests` row. Reserves credits atomically via the
 * `moneroo_reserve_payout` RPC, then calls Moneroo `/v1/payouts/initialize`.
 * Final state arrives via `moneroo-webhook-payout`
 * (`moneroo_confirm_payout` on success, `moneroo_revert_payout` on failure).
 *
 * @endpoint POST /functions/v1/moneroo-payout-init  (admin or system-only)
 * @body     { request_id: string; method: string; phone: string; country: string }
 * @returns  { success: boolean; merchant_transaction_id: string }
 * @see      supabase/functions/process-withdrawal/index.ts (orchestrator)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, genMerchantId, monerooCall } from "../_shared/moneroo.ts";
import { MONEROO_SANDBOX, getCurrencyForMethod, getPayoutFieldName } from "../_shared/moneroo-catalog.ts";

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
    const rawDest = String(body.phone_number || body.account_number || "").replace(/\s/g, "");
    const requestedMethod = String(body.method || "");
    const method = MONEROO_SANDBOX ? "moneroo_payout_demo" : requestedMethod;
    const currency = (MONEROO_SANDBOX ? "USD" : String(body.currency || getCurrencyForMethod(method, "XOF"))).toUpperCase();
    const description = String(body.description || "Retrait Moneroo").slice(0, 200);
    const first_name = String(body.first_name || "Client").slice(0, 60);
    const last_name = String(body.last_name || "App").slice(0, 60);
    const destField = getPayoutFieldName(method);

    if (!credits || credits <= 0) return bad("Montant invalide");
    if (!rawDest || !method) return bad("Champs manquants");
    if (destField === "msisdn" && !/^\+?\d{6,15}$/.test(rawDest)) return bad("Numéro invalide (format international requis)");
    if (destField === "account_number" && !/^\d+$/.test(rawDest)) return bad("account_number doit être un entier");


    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Convert credits -> local currency (1 credit = 0.50 EUR)
    const { data: rates } = await supa.from("exchange_rates")
      .select("currency_code,rate_per_usd")
      .in("currency_code", ["EUR", currency]);
    const eur = Number(rates?.find(r => r.currency_code === "EUR")?.rate_per_usd ?? 0.92);
    const local = Number(rates?.find(r => r.currency_code === currency)?.rate_per_usd
      ?? (currency === "XOF" || currency === "XAF" ? 600 : 1));
    const amount = Math.floor((credits * 0.5 / eur) * local);
    if (amount <= 0) return bad("Montant local trop faible");

    // Atomic reservation
    const { data: reserve, error: rerr } = await supa.rpc("moneroo_reserve_payout", {
      p_user_id: userId, p_credits: credits,
    });
    if (rerr) throw rerr;
    if (!(reserve as any)?.ok) return bad("Solde insuffisant");

    const merchant_id = genMerchantId("MPO");

    await supa.from("moneroo_transactions").insert({
      merchant_transaction_id: merchant_id,
      kind: "payout", user_id: userId,
      amount, currency, credits_amount: credits,
      phone_number: rawDest, payment_method: method,
      status: "pending",
      metadata: { description, dest_field: destField, sandbox: MONEROO_SANDBOX },
    });

    const payload: Record<string, unknown> = {
      amount,
      currency,
      description,
      method,
      customer: { first_name, last_name, ...(destField === "msisdn" ? { phone: rawDest } : {}) },
      // Moneroo expects the recipient destination at the root: msisdn (string) or account_number (integer)
      ...(destField === "msisdn"
        ? { msisdn: rawDest }
        : { account_number: parseInt(rawDest, 10) }),
      metadata: { merchant_transaction_id: merchant_id, user_id: userId },
    };


    const log = await monerooCall("/payouts/initialize", payload);
    const mData: any = log.raw_response ?? {};
    await supa.from("moneroo_transactions").update({
      raw_init_response: mData,
      moneroo_transaction_id: mData?.data?.id || null,
      request_url: log.request_url,
      request_payload: log.request_payload,
      request_headers: log.request_headers,
      http_status: log.http_status,
      http_status_text: log.http_status_text,
      request_sent_at: log.request_sent_at,
      response_received_at: log.response_received_at,
      updated_at: new Date().toISOString(),
    }).eq("merchant_transaction_id", merchant_id);

    if (!log.ok) {
      // Refund reserved credits immediately
      await supa.rpc("moneroo_revert_payout", { p_merchant_id: merchant_id });
      return new Response(JSON.stringify({ error: "Moneroo error", details: mData }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      merchant_transaction_id: merchant_id,
      amount, currency,
      payout_url: mData?.data?.payout_url || null,
      raw: mData?.data || mData,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("moneroo-payout-init error", e);
    return new Response(JSON.stringify({ error: (e as Error).message || "Erreur Moneroo" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function bad(msg: string) { return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function unauth() { return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
