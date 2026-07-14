/**
 * Edge Function: moneroo-payin-init
 *
 * Initialize a Moneroo hosted checkout (Mobile Money + cards) for the
 * authenticated user. Persists a pending row in `moneroo_transactions`,
 * then calls Moneroo `/v1/payments/initialize`. Wallet credit happens
 * in `moneroo-webhook-payin` after signature verification.
 *
 * @endpoint POST /functions/v1/moneroo-payin-init
 * @body     { amount: number; method: string; currency?: string; phone?: string }
 * @returns  { checkout_url: string; merchant_transaction_id: string }
 * @env      MONEROO_API_KEY (or MONEROO_SANDBOX_API_KEY when sandbox)
 * @see      supabase/functions/moneroo-webhook-payin/index.ts
 * @see      docs https://docs.moneroo.io/api-reference/payments/initialize
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, genMerchantId, monerooCall } from "../_shared/moneroo.ts";
import { MONEROO_SANDBOX, getCurrencyForMethod } from "../_shared/moneroo-catalog.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return unauth();

    const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: cerr } = await supaUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (cerr || !claims?.claims) return unauth();
    const userId = claims.claims.sub as string;
    const userEmail = (claims.claims.email as string) || "client@app.com";

    const body = await req.json();
    const amount = Math.floor(Number(body.amount));
    // Sandbox mode: force demo method & USD; otherwise honor client-provided values.
    const requestedMethod = String(body.method || "").trim();
    const method = MONEROO_SANDBOX ? "moneroo_payment_demo" : requestedMethod;
    const currency = (MONEROO_SANDBOX ? "USD" : String(body.currency || getCurrencyForMethod(method, "XOF"))).toUpperCase();
    const description = String(body.description || "Recharge wallet").slice(0, 200);
    const first_name = String(body.first_name || "Client").slice(0, 60);
    const last_name = String(body.last_name || "App").slice(0, 60);
    const phone_number = body.phone_number ? String(body.phone_number).replace(/\s/g, "") : null;

    if (!amount || amount <= 0) return bad("Montant invalide");
    if (!MONEROO_SANDBOX && !method) return bad("Méthode requise");


    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const merchant_id = genMerchantId("MPI");
    const origin = req.headers.get("origin") || "https://app.example.com";
    const return_url = `${origin}/wallet?recharge=success&provider=moneroo&mid=${merchant_id}`;

    const { error: insErr } = await supa.from("moneroo_transactions").insert({
      merchant_transaction_id: merchant_id,
      kind: "payin",
      user_id: userId,
      amount,
      currency,
      phone_number,
      status: "pending",
      metadata: { description },
    });
    if (insErr) throw insErr;

    const payload: Record<string, unknown> = {
      amount,
      currency,
      description,
      customer: {
        email: userEmail,
        first_name,
        last_name,
        ...(phone_number ? { phone: phone_number } : {}),
      },
      ...(method ? { methods: [method] } : {}),
      return_url,
      metadata: { merchant_transaction_id: merchant_id, user_id: userId, method, sandbox: MONEROO_SANDBOX },
    };


    console.log("[moneroo-payin-init] calling Moneroo with payload:", JSON.stringify(payload));
    const log = await monerooCall("/payments/initialize", payload);
    const mData: any = log.raw_response ?? {};
    console.log("[moneroo-payin-init] Moneroo response", log.http_status, JSON.stringify(mData).slice(0, 1000));

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
      let msg = mData?.message || mData?.error;
      if (!msg && Array.isArray(mData?.errors) && mData.errors.length) msg = JSON.stringify(mData.errors);
      if (!msg && mData?.errors && typeof mData.errors === "object" && Object.keys(mData.errors).length) msg = JSON.stringify(mData.errors);
      if (!msg) msg = `HTTP ${log.http_status}`;
      return new Response(JSON.stringify({ error: `Moneroo: ${msg}`, status: log.http_status, details: mData }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const checkout_url = mData?.data?.checkout_url || mData?.checkout_url;
    return new Response(JSON.stringify({
      ok: true,
      merchant_transaction_id: merchant_id,
      checkout_url,
      raw: mData?.data || mData,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("moneroo-payin-init error", e);
    return new Response(JSON.stringify({ error: (e as Error).message || "Erreur Moneroo" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function bad(msg: string) { return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function unauth() { return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
