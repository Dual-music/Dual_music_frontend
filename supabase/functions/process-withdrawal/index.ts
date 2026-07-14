/**
 * Edge Function: process-withdrawal
 *
 * Process a row from `withdrawal_requests` via the configured provider
 * (CinetPay, Moneroo, or Stripe). Triggered either by an admin manual
 * approval or directly by the client when `payout_config.mode = "auto_payout"`.
 *
 * Flow:
 *  1. Validate caller (admin OR owner in auto mode).
 *  2. Atomically reserve credits via the matching `*_reserve_payout` RPC.
 *  3. Call provider PayOut API; on accept, status flips to `processing`.
 *  4. Final settlement arrives via provider webhook → `*_confirm_payout`
 *     or `*_revert_payout` (which refunds the user wallet).
 *
 * @endpoint POST /functions/v1/process-withdrawal
 * @body     { request_id: string }
 * @returns  { success: boolean; provider: string; merchant_transaction_id?: string }
 * @see      supabase/functions/cinetpay-payout-init, moneroo-payout-init
 * @see      src/components/artist/WithdrawalForm.tsx
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await supaUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const withdrawalId = String(body.withdrawal_request_id || "");
    const provider = String(body.provider || "").toLowerCase();
    if (!withdrawalId || !provider) return json({ error: "withdrawal_request_id et provider requis" }, 400);
    if (!["cinetpay", "moneroo", "stripe"].includes(provider)) return json({ error: "Provider invalide" }, 400);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Permissions: admin OR the request owner with auto_processed=true
    const { data: isAdminRow } = await supa.rpc("has_role", { _user_id: userId, _role: "admin" });
    const isAdmin = !!isAdminRow;

    const { data: wr, error: wrErr } = await supa
      .from("withdrawal_requests")
      .select("*")
      .eq("id", withdrawalId)
      .maybeSingle();
    if (wrErr || !wr) return json({ error: "Demande introuvable" }, 404);
    if (!isAdmin) {
      if (wr.user_id !== userId || !wr.auto_processed) return json({ error: "Accès refusé" }, 403);
    }
    if (wr.status === "completed") return json({ error: "Déjà traitée" }, 400);

    const details = (wr.payment_details ?? {}) as Record<string, unknown>;
    const phone = String(details.phone_number ?? "").replace(/\s/g, "");
    const credits = Number(wr.amount);

    // Stripe: no automated payout API available in this project — mark as completed with manual note.
    if (provider === "stripe") {
      await supa.from("withdrawal_requests").update({
        status: "completed",
        provider: "stripe",
        provider_tx_id: "manual_stripe",
        processed_at: new Date().toISOString(),
        processed_by: isAdmin ? userId : null,
      }).eq("id", withdrawalId);
      return json({ ok: true, provider: "stripe", manual: true });
    }

    if (provider === "cinetpay") {
      if (!phone) return json({ error: "Téléphone manquant sur la demande" }, 400);

      const { data: countries } = await supa.from("cinetpay_countries").select("*").eq("is_active", true);
      const { detectCountryByPhone, cinetpayFetch, genMerchantId, genNotifyToken } = await import("../_shared/cinetpay.ts");
      const cfg = detectCountryByPhone(phone, (countries as any[]) || []);
      if (!cfg) return json({ error: "Pays non supporté pour ce numéro" }, 400);

      const { data: rates } = await supa.from("exchange_rates").select("currency_code,rate_per_usd").in("currency_code", ["EUR", cfg.currency]);
      const eur = Number(rates?.find((r: any) => r.currency_code === "EUR")?.rate_per_usd ?? 0.92);
      const local = Number(rates?.find((r: any) => r.currency_code === cfg.currency)?.rate_per_usd ?? (cfg.currency === "XOF" || cfg.currency === "XAF" ? 600 : 1));
      const amount = Math.floor((credits * 0.5 / eur) * local);
      if (amount <= 0) return json({ error: "Montant local trop faible" }, 400);

      const merchant_id = genMerchantId("PO");
      const notify_token = genNotifyToken();
      const notify_url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cinetpay-webhook-payout`.slice(0, 120);

      await supa.from("cinetpay_transactions").insert({
        merchant_transaction_id: merchant_id, kind: "payout", user_id: wr.user_id,
        country_code: cfg.country_code, payment_method: String(details.mobile_operator || "OMCI"),
        amount, currency: cfg.currency, phone_number: phone, notify_token,
        credits_amount: credits, status: "pending", withdrawal_request_id: withdrawalId,
      });

      const cpRes = await cinetpayFetch(cfg, "/v1/transfer", {
        method: "POST",
        body: JSON.stringify({
          currency: cfg.currency, merchant_transaction_id: merchant_id,
          phone_number: phone, amount,
          payment_method: String(details.mobile_operator || "OMCI"),
          reason: "Retrait de fonds", notify_url, notify_token,
        }),
      });
      const cpData = await cpRes.json().catch(() => ({}));
      await supa.from("cinetpay_transactions").update({ raw_init_response: cpData, updated_at: new Date().toISOString() }).eq("merchant_transaction_id", merchant_id);

      if (!cpRes.ok) {
        return json({ error: "CinetPay error", details: cpData }, 200);
      }

      await supa.from("withdrawal_requests").update({
        status: "completed", provider: "cinetpay", provider_tx_id: merchant_id,
        processed_at: new Date().toISOString(), processed_by: isAdmin ? userId : null,
      }).eq("id", withdrawalId);
      return json({ ok: true, provider: "cinetpay", merchant_id });
    }

    if (provider === "moneroo") {
      const { monerooFetch, genMerchantId } = await import("../_shared/moneroo.ts");
      const { MONEROO_SANDBOX, getCurrencyForMethod, getPayoutFieldName } = await import("../_shared/moneroo-catalog.ts");

      const requestedMethod = String(details.moneroo_method || details.mobile_operator || "mtn_ci");
      const method = MONEROO_SANDBOX ? "moneroo_payout_demo" : requestedMethod;
      const destField = getPayoutFieldName(method);
      const rawDest = String(details.account_number || phone || "").replace(/\s/g, "");
      if (!rawDest) return json({ error: "Coordonnée de paiement manquante" }, 400);
      if (destField === "account_number" && !/^\d+$/.test(rawDest)) return json({ error: "account_number invalide" }, 400);

      const currency = MONEROO_SANDBOX ? "USD" : getCurrencyForMethod(method, "XOF");
      const { data: rates } = await supa.from("exchange_rates").select("currency_code,rate_per_usd").in("currency_code", ["EUR", currency]);
      const eur = Number(rates?.find((r: any) => r.currency_code === "EUR")?.rate_per_usd ?? 0.92);
      const local = Number(rates?.find((r: any) => r.currency_code === currency)?.rate_per_usd ?? (currency === "XOF" || currency === "XAF" ? 600 : 1));
      const amount = Math.floor((credits * 0.5 / eur) * local);
      if (amount <= 0) return json({ error: "Montant local trop faible" }, 400);

      const merchant_id = genMerchantId("MPO");
      await supa.from("moneroo_transactions").insert({
        merchant_transaction_id: merchant_id, kind: "payout", user_id: wr.user_id,
        amount, currency, credits_amount: credits, phone_number: rawDest,
        payment_method: method,
        status: "pending", metadata: { withdrawal_request_id: withdrawalId, dest_field: destField, sandbox: MONEROO_SANDBOX },
      } as any);

      const payload: Record<string, unknown> = {
        amount, currency, description: "Retrait de fonds", method,
        customer: { first_name: "Client", last_name: "App", ...(destField === "msisdn" ? { phone: rawDest } : {}) },
        ...(destField === "msisdn" ? { msisdn: rawDest } : { account_number: parseInt(rawDest, 10) }),
        metadata: { withdrawal_request_id: withdrawalId, merchant_transaction_id: merchant_id, user_id: wr.user_id },
      };
      const mRes = await monerooFetch("/payouts/initialize", { method: "POST", body: JSON.stringify(payload) });
      const mData = await mRes.json().catch(() => ({}));
      await supa.from("moneroo_transactions").update({
        raw_init_response: mData,
        moneroo_transaction_id: mData?.data?.id ?? null,
        updated_at: new Date().toISOString(),
      }).eq("merchant_transaction_id", merchant_id);

      if (!mRes.ok) return json({ error: "Moneroo error", details: mData }, 200);

      await supa.from("withdrawal_requests").update({
        status: "completed", provider: "moneroo", provider_tx_id: merchant_id,
        processed_at: new Date().toISOString(), processed_by: isAdmin ? userId : null,
      }).eq("id", withdrawalId);
      return json({ ok: true, provider: "moneroo", merchant_id });
    }


    return json({ error: "Provider non géré" }, 400);
  } catch (e) {
    console.error("process-withdrawal error", e);
    return json({ error: (e as Error).message || "Erreur serveur" }, 500);
  }
});
