/**
 * Edge Function: cinetpay-balances
 *
 * Admin dashboard helper. Iterates every active row of `cinetpay_countries`
 * and queries `/v1/balances` per country/currency via the shared OAuth client.
 * Returns an aggregated balances report consumed by `CinetPayAdminPanel.tsx`.
 *
 * @endpoint GET /functions/v1/cinetpay-balances
 * @auth     Bearer JWT — must hold `admin` role in `user_roles`.
 * @returns  application/json { balances: Array<{country, currency, ok, data|error}> }
 * @see      supabase/functions/_shared/cinetpay.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, cinetpayFetch, type CountryConfig } from "../_shared/cinetpay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return unauth();
    const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims) return unauth();
    const { data: roles } = await supaUser.from("user_roles").select("role").eq("user_id", claims.claims.sub as string);
    if (!roles?.some((r: any) => r.role === "admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: countries } = await supa.from("cinetpay_countries").select("*").eq("is_active", true);

    const results: any[] = [];
    for (const c of (countries as CountryConfig[]) || []) {
      try {
        const r = await cinetpayFetch(c, "/v1/balances", { method: "GET" });
        const j = await r.json().catch(() => ({}));
        results.push({ country: c.country_code, currency: c.currency, ok: r.ok, data: j });
      } catch (e) {
        results.push({ country: c.country_code, currency: c.currency, ok: false, error: (e as Error).message });
      }
    }
    return new Response(JSON.stringify({ balances: results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function unauth() { return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
