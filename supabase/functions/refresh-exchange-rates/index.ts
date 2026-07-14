/**
 * Edge Function: refresh-exchange-rates
 *
 * Scheduled (pg_cron) job that pulls the latest USD-based exchange rates for
 * all currencies the platform supports (USD/EUR/XOF/XAF/NGN/GHS/KES/...) and
 * upserts them into `exchange_rates(currency_code, rate_per_usd)`. Consumed
 * by `useCurrency`, `RechargeBreakdown`, and `computeCreditsForRecharge`.
 *
 * @endpoint POST /functions/v1/refresh-exchange-rates
 * @returns  application/json { updated: number, rates: Record<string, number> }
 * @see      src/hooks/useCurrency.ts, supabase/functions/_shared/recharge-credits.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_CURRENCIES: Array<{ code: string; name: string; symbol: string }> = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "XOF", name: "CFA franc BCEAO", symbol: "FCFA" },
  { code: "XAF", name: "CFA franc BEAC", symbol: "FCFA" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "DH" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Free, no-key API
    const symbols = TARGET_CURRENCIES.map((c) => c.code).join(",");
    const url = `https://api.exchangerate.host/latest?base=USD&symbols=${symbols}`;
    const res = await fetch(url);
    let rates: Record<string, number> = {};
    if (res.ok) {
      const json = await res.json();
      rates = json?.rates || {};
    }

    const upserts = TARGET_CURRENCIES.map((c) => ({
      currency_code: c.code,
      name: c.name,
      symbol: c.symbol,
      rate_per_usd: rates[c.code] ?? (c.code === "USD" ? 1 : null),
      updated_at: new Date().toISOString(),
    })).filter((r) => r.rate_per_usd !== null);

    const { error } = await supabase
      .from("exchange_rates")
      .upsert(upserts, { onConflict: "currency_code" });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, updated: upserts.length, source: res.ok ? "api" : "fallback" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[refresh-exchange-rates]", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
