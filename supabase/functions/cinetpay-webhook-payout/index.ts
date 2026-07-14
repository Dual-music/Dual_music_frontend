/**
 * Edge Function: cinetpay-webhook-payout
 *
 * Public callback for CinetPay Transfer (PayOut). Verifies the notification
 * token (`timingSafeEqual`) and the transaction state via CinetPay's
 * `/v1/transfer/check`, then dispatches the matching RPC:
 *   - `cinetpay_confirm_payout` → marks `withdrawal_requests` as completed.
 *   - `cinetpay_revert_payout`  → refunds the user wallet on definitive failure.
 *
 * @endpoint POST /functions/v1/cinetpay-webhook-payout
 * @returns  text/plain "OK"
 * @see      supabase/functions/cinetpay-payout-init, process-withdrawal
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, cinetpayFetch, timingSafeEqual, type CountryConfig } from "../_shared/cinetpay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return new Response("", { status: 200, headers: corsHeaders });

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const ct = req.headers.get("content-type") || "";
    let payload: Record<string, any> = {};
    if (ct.includes("application/json")) payload = await req.json();
    else { const f = await req.formData(); f.forEach((v, k) => (payload[k] = String(v))); }

    const merchant_id = String(payload.client_transaction_id || payload.merchant_transaction_id || payload.transaction_id || "");
    const incoming_token = String(payload.notify_token || payload.cpm_custom || req.headers.get("x-token") || "");
    if (!merchant_id) return new Response("missing id", { status: 400, headers: corsHeaders });

    const { data: tx } = await supa.from("cinetpay_transactions").select("*").eq("merchant_transaction_id", merchant_id).maybeSingle();
    if (!tx) return new Response("tx not found", { status: 200, headers: corsHeaders });
    if (!timingSafeEqual(incoming_token, tx.notify_token)) return new Response("forbidden", { status: 403, headers: corsHeaders });
    if (tx.status === "success" || tx.status === "failed") return new Response("ok", { status: 200, headers: corsHeaders });

    await supa.from("cinetpay_transactions").update({ raw_webhook_payload: payload, updated_at: new Date().toISOString() }).eq("id", tx.id);

    const work = (async () => {
      try {
        const { data: country } = await supa.from("cinetpay_countries").select("*").eq("country_code", tx.country_code).maybeSingle();
        if (!country) return;
        const cfg = country as CountryConfig;
        const verRes = await cinetpayFetch(cfg, `/v1/transfer/${encodeURIComponent(merchant_id)}`, { method: "GET" });
        const verData = await verRes.json().catch(() => ({}));
        await supa.from("cinetpay_transactions").update({ raw_verify_response: verData, updated_at: new Date().toISOString() }).eq("id", tx.id);

        const code = String(verData?.code ?? verData?.data?.code ?? "");
        const details = verData?.data || verData;

        if (code === "00" || code === "100" || details?.status === "VAL" || details?.status === "SUCCESS") {
          await supa.rpc("cinetpay_confirm_payout", { p_merchant_id: merchant_id });
        } else {
          // refund the user
          await supa.rpc("cinetpay_revert_payout", { p_merchant_id: merchant_id });
        }
      } catch (e) { console.error("payout verify error", e); }
    })();
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
    else await work;

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("payout webhook error", e);
    return new Response("err", { status: 200, headers: corsHeaders });
  }
});
