/**
 * Edge Function: cinetpay-verify-tx
 *
 * Admin-only diagnostic: re-checks a CinetPay transaction (PayIn or PayOut)
 * against `/v1/payment/{id}` or `/v1/transfer/{id}` using the country's OAuth
 * credentials, then returns the raw verification payload. Used to reconcile
 * stuck or contested transactions from `CinetPayAdminPanel.tsx`.
 *
 * @endpoint POST /functions/v1/cinetpay-verify-tx
 * @auth     Bearer JWT — must hold `admin` role in `user_roles`.
 * @body     { merchant_transaction_id: string }
 * @returns  application/json — raw CinetPay verify response.
 * @see      supabase/functions/_shared/cinetpay.ts (`cinetpayFetch`)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, cinetpayFetch, type CountryConfig } from "../_shared/cinetpay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return resp(401, { error: "Unauthorized" });
    const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims) return resp(401, { error: "Unauthorized" });
    const { data: roles } = await supaUser.from("user_roles").select("role").eq("user_id", claims.claims.sub as string);
    if (!roles?.some((r: any) => r.role === "admin")) return resp(403, { error: "Forbidden" });

    const { merchant_transaction_id } = await req.json();
    if (!merchant_transaction_id) return resp(400, { error: "missing id" });

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: tx } = await supa.from("cinetpay_transactions").select("*").eq("merchant_transaction_id", merchant_transaction_id).maybeSingle();
    if (!tx) return resp(404, { error: "tx not found" });
    const { data: country } = await supa.from("cinetpay_countries").select("*").eq("country_code", tx.country_code).maybeSingle();
    if (!country) return resp(404, { error: "country not found" });
    const cfg = country as CountryConfig;

    const path = tx.kind === "payin"
      ? `/v1/payment/${encodeURIComponent(merchant_transaction_id)}`
      : `/v1/transfer/${encodeURIComponent(merchant_transaction_id)}`;
    const verRes = await cinetpayFetch(cfg, path, { method: "GET" });
    const verData = await verRes.json().catch(() => ({}));
    await supa.from("cinetpay_transactions").update({ raw_verify_response: verData, updated_at: new Date().toISOString() }).eq("id", tx.id);

    const code = String(verData?.code ?? verData?.data?.code ?? "");
    const details = verData?.data || verData;
    const successful = code === "00" || code === "100" || details?.status === "ACCEPTED" || details?.status === "SUCCESS" || details?.status === "VAL";

    if (successful) {
      if (tx.kind === "payin") {
        const { data: rates } = await supa.from("exchange_rates").select("currency_code,rate_per_usd").in("currency_code", ["EUR", tx.currency]);
        const eur = Number(rates?.find(r => r.currency_code === "EUR")?.rate_per_usd ?? 0.92);
        const local = Number(rates?.find(r => r.currency_code === tx.currency)?.rate_per_usd ?? 600);
        const credits = Math.floor((Number(tx.amount) / local) * eur / 0.5);
        await supa.rpc("cinetpay_credit_wallet", { p_merchant_id: merchant_transaction_id, p_credits: credits });
      } else {
        await supa.rpc("cinetpay_confirm_payout", { p_merchant_id: merchant_transaction_id });
      }
    } else if (tx.kind === "payout") {
      await supa.rpc("cinetpay_revert_payout", { p_merchant_id: merchant_transaction_id });
    } else {
      await supa.from("cinetpay_transactions").update({ status: "failed", processed_at: new Date().toISOString() }).eq("id", tx.id);
    }

    return resp(200, { ok: true, verification: verData });
  } catch (e) {
    return resp(500, { error: (e as Error).message });
  }
});

function resp(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
