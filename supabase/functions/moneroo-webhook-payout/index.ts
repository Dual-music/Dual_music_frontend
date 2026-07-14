/**
 * Edge Function: moneroo-webhook-payout
 *
 * Public callback for Moneroo PayOut. HMAC-SHA256 signed. Dispatches to:
 *   - `moneroo_confirm_payout` on success → marks the withdrawal completed.
 *   - `moneroo_revert_payout` on definitive failure → refunds the wallet.
 *
 * @endpoint POST /functions/v1/moneroo-webhook-payout
 * @headers  x-moneroo-signature: HMAC-SHA256 hex
 * @returns  application/json { ok: true }
 * @env      MONEROO_WEBHOOK_SECRET
 * @see      supabase/functions/moneroo-payout-init, process-withdrawal
 */
// Moneroo PayOut webhook
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
    return new Response(JSON.stringify({ ok: true, endpoint: "moneroo-webhook-payout" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const rawBody = await req.text();

  const webhookSecret = Deno.env.get("MONEROO_WEBHOOK_SECRET") || "";
  if (webhookSecret) {
    const incoming = req.headers.get("x-moneroo-signature") || req.headers.get("moneroo-signature") || "";
    const expected = await hmacSha256Hex(webhookSecret, rawBody);
    if (!incoming || !timingSafeEqual(incoming.toLowerCase(), expected.toLowerCase())) {
      console.warn("moneroo payout webhook: invalid signature");
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
  } else {
    console.warn("moneroo payout webhook: MONEROO_WEBHOOK_SECRET not set — accepting unsigned payload");
  }

  let payload: Record<string, any> = {};
  try { payload = JSON.parse(rawBody || "{}"); } catch { /* keep empty */ }

  try {
    const data = payload?.data || payload;
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
      console.warn("moneroo payout webhook: missing merchant_transaction_id", payload);
      return new Response("missing id", { status: 200, headers: corsHeaders });
    }

    const { data: tx } = await supa
      .from("moneroo_transactions")
      .select("*")
      .eq("merchant_transaction_id", merchant_id)
      .maybeSingle();

    if (!tx) return new Response("tx not found", { status: 200, headers: corsHeaders });
    if (tx.status === "success" || tx.status === "failed") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    await supa.from("moneroo_transactions").update({
      raw_webhook_payload: payload,
      moneroo_transaction_id: moneroo_tx_id || tx.moneroo_transaction_id,
      updated_at: new Date().toISOString(),
    }).eq("id", tx.id);

    const isSuccess = ["success", "succeeded", "completed", "paid", "approved"].some(s => status.includes(s));
    const isFailed = ["failed", "cancelled", "canceled", "declined", "expired", "rejected"].some(s => status.includes(s));

    if (isSuccess) {
      await supa.rpc("moneroo_confirm_payout", { p_merchant_id: merchant_id });
    } else if (isFailed) {
      // Refund reserved credits to the user
      await supa.rpc("moneroo_revert_payout", { p_merchant_id: merchant_id });
    }

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("moneroo payout webhook error", e);
    return new Response("err", { status: 200, headers: corsHeaders });
  }
});
