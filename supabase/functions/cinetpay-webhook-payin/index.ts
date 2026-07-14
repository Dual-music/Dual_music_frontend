/**
 * Edge Function: cinetpay-webhook-payin
 *
 * Public callback registered with CinetPay (verify_jwt = false). On each
 * notification, re-verifies the transaction via the `/v1/payment/check` API
 * (canonical verification — never trust the raw POST body), then calls the
 * `cinetpay_confirm_payin` RPC to atomically credit the user wallet and
 * mark the `cinetpay_transactions` row as `succeeded` / `failed`.
 *
 * @endpoint POST /functions/v1/cinetpay-webhook-payin
 * @body     application/x-www-form-urlencoded — CinetPay notification payload
 * @returns  text/plain "OK" on success (provider expects 200 OK)
 * @see      supabase/functions/cinetpay-payin-init
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, cinetpayFetch, timingSafeEqual, type CountryConfig } from "../_shared/cinetpay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Health probe
  if (req.method === "GET") return new Response("", { status: 200, headers: corsHeaders });

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // CinetPay may send application/x-www-form-urlencoded or JSON
    const contentType = req.headers.get("content-type") || "";
    let payload: Record<string, any> = {};
    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else {
      const form = await req.formData();
      form.forEach((v, k) => (payload[k] = String(v)));
    }

    const merchant_id = String(payload.cpm_trans_id || payload.merchant_transaction_id || payload.transaction_id || "");
    const incoming_token = String(payload.cpm_custom || payload.notify_token || req.headers.get("x-token") || "");

    if (!merchant_id) return new Response("missing id", { status: 400, headers: corsHeaders });

    const { data: tx } = await supa.from("cinetpay_transactions").select("*").eq("merchant_transaction_id", merchant_id).maybeSingle();
    if (!tx) return new Response("tx not found", { status: 200, headers: corsHeaders }); // 200 to stop retries
    if (!timingSafeEqual(incoming_token, tx.notify_token)) {
      console.warn("payin webhook: invalid notify_token", merchant_id);
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
    // Idempotence
    if (tx.status === "success" || tx.status === "failed") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    await supa.from("cinetpay_transactions").update({ raw_webhook_payload: payload, updated_at: new Date().toISOString() }).eq("id", tx.id);

    // Respond 200 immediately, do heavy work in background
    const work = (async () => {
      try {
        const { data: country } = await supa.from("cinetpay_countries").select("*").eq("country_code", tx.country_code).maybeSingle();
        if (!country) return;
        const cfg = country as CountryConfig;
        const verRes = await cinetpayFetch(cfg, `/v1/payment/${encodeURIComponent(merchant_id)}`, { method: "GET" });
        const verData = await verRes.json().catch(() => ({}));
        await supa.from("cinetpay_transactions").update({ raw_verify_response: verData, updated_at: new Date().toISOString() }).eq("id", tx.id);

        const code = String(verData?.code ?? verData?.data?.code ?? "");
        const details = verData?.data || verData;

        if (code === "00" || code === "100" || details?.status === "ACCEPTED" || details?.status === "SUCCESS") {
          // Use admin economic_config (credit_value_usd + recharge.fee_pct) for coherence
          const { computeCreditsForRecharge } = await import("../_shared/recharge-credits.ts");
          const { credits } = await computeCreditsForRecharge(supa as any, Number(tx.amount), tx.currency, "cinetpay");
          await supa.rpc("cinetpay_credit_wallet", { p_merchant_id: merchant_id, p_credits: credits });
        } else if (code === "627" || code === "2005") {
          await supa.from("cinetpay_transactions").update({ status: "insufficient", processed_at: new Date().toISOString() }).eq("id", tx.id);
        } else {
          await supa.from("cinetpay_transactions").update({ status: "failed", processed_at: new Date().toISOString(), error_message: JSON.stringify(verData).slice(0, 500) }).eq("id", tx.id);
        }
      } catch (e) {
        console.error("payin verify error", e);
      }
    })();
    // @ts-ignore EdgeRuntime is provided by Supabase
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work);
    else await work;

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("payin webhook error", e);
    return new Response("err", { status: 200, headers: corsHeaders }); // 200 to avoid retry loops
  }
});
