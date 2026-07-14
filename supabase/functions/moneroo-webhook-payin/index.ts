/**
 * Edge Function: moneroo-webhook-payin
 *
 * Public callback for Moneroo PayIn (verify_jwt = false). Authenticated via
 * an HMAC-SHA256 signature header (shared secret). On `payment.success`,
 * calls the `moneroo_confirm_payin` RPC to credit the user wallet atomically
 * and idempotently mark `moneroo_transactions` as `succeeded`.
 *
 * @endpoint POST /functions/v1/moneroo-webhook-payin
 * @headers  x-moneroo-signature: HMAC-SHA256 hex(secret, rawBody)
 * @returns  application/json { ok: true }
 * @env      MONEROO_WEBHOOK_SECRET
 * @see      supabase/functions/moneroo-payin-init
 */
// Moneroo PayIn webhook
// Docs: https://docs.moneroo.io/
// Public endpoint (verify_jwt = false). Auth via HMAC-SHA256 signature header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-moneroo-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, endpoint: "moneroo-webhook-payin" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const rawBody = await req.text();

  // Signature verification (only when secret is configured)
  const webhookSecret = Deno.env.get("MONEROO_WEBHOOK_SECRET") || "";
  if (webhookSecret) {
    const incoming = req.headers.get("x-moneroo-signature") || req.headers.get("moneroo-signature") || "";
    const expected = await hmacSha256Hex(webhookSecret, rawBody);
    if (!incoming || !timingSafeEqual(incoming.toLowerCase(), expected.toLowerCase())) {
      console.warn("moneroo payin webhook: invalid signature");
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
  } else {
    console.warn("moneroo payin webhook: MONEROO_WEBHOOK_SECRET not set — accepting unsigned payload");
  }

  let payload: Record<string, any> = {};
  try { payload = JSON.parse(rawBody || "{}"); } catch { /* keep empty */ }

  try {
    const data = payload?.data || payload;
    // Moneroo sends our merchant ref under metadata.merchant_transaction_id (we set it on init).
    const merchant_id = String(
      data?.metadata?.merchant_transaction_id ||
      data?.reference ||
      data?.id ||
      payload?.merchant_transaction_id ||
      ""
    );
    const moneroo_tx_id = String(data?.id || data?.transaction_id || "");
    const status = String(data?.status || payload?.event || "").toLowerCase();

    if (!merchant_id) {
      console.warn("moneroo payin webhook: missing merchant_transaction_id", payload);
      return new Response("missing id", { status: 200, headers: corsHeaders });
    }

    const { data: tx } = await supa
      .from("moneroo_transactions")
      .select("*")
      .eq("merchant_transaction_id", merchant_id)
      .maybeSingle();

    if (!tx) {
      console.warn("moneroo payin webhook: tx not found", merchant_id);
      return new Response("tx not found", { status: 200, headers: corsHeaders });
    }
    if (tx.status === "success" || tx.status === "failed") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    await supa.from("moneroo_transactions").update({
      raw_webhook_payload: payload,
      moneroo_transaction_id: moneroo_tx_id || tx.moneroo_transaction_id,
      updated_at: new Date().toISOString(),
    }).eq("id", tx.id);

    const isSuccess = ["success", "succeeded", "completed", "paid", "approved"].some(s => status.includes(s));
    const isFailed = ["failed", "cancelled", "canceled", "declined", "expired"].some(s => status.includes(s));

    if (isSuccess) {
      // Use admin economic_config (credit_value_usd + recharge.fee_pct) for coherence
      const { computeCreditsForRecharge } = await import("../_shared/recharge-credits.ts");
      const { credits } = await computeCreditsForRecharge(supa as any, Number(tx.amount), tx.currency, "moneroo");
      await supa.rpc("moneroo_credit_wallet", { p_merchant_id: merchant_id, p_credits: credits });
    } else if (isFailed) {
      await supa.from("moneroo_transactions").update({
        status: "failed",
        processed_at: new Date().toISOString(),
        error_message: JSON.stringify(payload).slice(0, 500),
      }).eq("id", tx.id);
    }

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("moneroo payin webhook error", e);
    return new Response("err", { status: 200, headers: corsHeaders });
  }
});
