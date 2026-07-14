/**
 * Edge Function: cinetpay-proxy-check
 *
 * Diagnostic endpoint that probes the egress IP both directly (Supabase) and
 * via the optional CinetPay proxy (`CINETPAY_PROXY_URL`). Use this once after
 * deploying the Fly.io proxy to discover the fixed IP to whitelist in the
 * CinetPay dashboard.
 *
 * @endpoint GET /functions/v1/cinetpay-proxy-check
 * @auth     Bearer JWT — admin only.
 * @env      CINETPAY_PROXY_URL, CINETPAY_PROXY_TOKEN
 * @returns  application/json { direct: {ip}, proxy: {ip} }
 * @see      cinetpay-proxy/server.ts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cinetpay.ts";

const CINETPAY_PROXY_URL = (Deno.env.get("CINETPAY_PROXY_URL") || "").replace(/\/$/, "");
const CINETPAY_PROXY_TOKEN = Deno.env.get("CINETPAY_PROXY_TOKEN") || "";

async function probe(url: string, viaProxy: boolean): Promise<{ ok: boolean; ip: string | null; raw?: string; error?: string }> {
  try {
    if (!viaProxy) {
      const r = await fetch(url);
      const j = await r.json().catch(() => null);
      return { ok: r.ok, ip: j?.ip ?? null };
    }
    if (!CINETPAY_PROXY_URL) return { ok: false, ip: null, error: "CINETPAY_PROXY_URL non configuré" };
    const headers: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
    if (CINETPAY_PROXY_TOKEN) headers.Authorization = `Bearer ${CINETPAY_PROXY_TOKEN}`;
    const r = await fetch(CINETPAY_PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ url, method: "GET", headers: {}, body: null }),
    });
    const proxied = await r.clone().json().catch(() => null);
    if (proxied?.body) {
      const j = JSON.parse(proxied.body);
      return { ok: true, ip: j?.ip ?? null, raw: proxied.body };
    }
    return { ok: r.ok, ip: null, raw: await r.text() };
  } catch (e) {
    return { ok: false, ip: null, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims) return json(401, { error: "Unauthorized" });
    const { data: roles } = await supa.from("user_roles").select("role").eq("user_id", claims.claims.sub as string);
    if (!roles?.some((r: any) => r.role === "admin")) return json(403, { error: "Forbidden — admin only" });

    const direct = await probe("https://api.ipify.org?format=json", false);
    const viaProxy = await probe("https://api.ipify.org?format=json", true);

    return json(200, {
      proxy_configured: !!CINETPAY_PROXY_URL,
      proxy_url: CINETPAY_PROXY_URL || null,
      direct_egress_ip: direct.ip,
      direct_note: "IP Supabase (dynamique — change à chaque requête, NE PAS whitelister)",
      proxy_egress_ip: viaProxy.ip,
      proxy_note: viaProxy.ip
        ? "👉 IP FIXE à coller dans la whitelist CinetPay (sandbox + prod)"
        : "Aucune IP retournée via le proxy — vérifie CINETPAY_PROXY_URL et le format de réponse",
      proxy_raw_response: viaProxy.raw,
      proxy_error: viaProxy.error,
    });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
