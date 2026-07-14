/**
 * Shared CinetPay V2 (Seamless) OAuth client used by every `cinetpay-*` edge function.
 *
 * Endpoints:
 *   - Auth:    POST /v1/oauth/login { api_key, api_password } -> { access_token }
 *   - PayIn:   POST /v1/payment  (Bearer) -> { payment_token, payment_url }
 *   - PayOut:  POST /v1/transfer (Bearer)
 *   - Status:  GET  /v1/payment/{merchant_id} or /v1/transfer/{merchant_id}
 *
 * Base URL auto-detected from key prefix:
 *   - sk_test_* → https://api.cinetpay.net (sandbox)
 *   - sk_live_* → https://api.cinetpay.co  (production)
 *
 * Credentials are looked up per country from `cinetpay_countries` and read
 * from Supabase secrets (`secret_key_name` / `secret_password_name`). Access
 * tokens are cached in-memory for ~45 minutes per country.
 *
 * Optional egress proxy: when `CINETPAY_PROXY_URL` is set AND the admin
 * toggle `platform_settings.cinetpay_proxy_enabled` is true, all CinetPay
 * traffic is routed through the fixed-IP proxy (see `cinetpay-proxy/`) so
 * CinetPay's IP whitelist remains stable.
 *
 * @env      CINETPAY_BASE_URL, CINETPAY_PROXY_URL, CINETPAY_PROXY_TOKEN
 * @throws   CinetPayIpRejectedError — surfaces the backend egress IP so the
 *           admin can whitelist it directly from the error message.
 * @see      supabase/functions/cinetpay-payin-init, cinetpay-payout-init
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_BASE = "https://api.cinetpay.net";
const BASE_URL = (Deno.env.get("CINETPAY_BASE_URL") || DEFAULT_BASE).replace(/\/$/, "");
const CINETPAY_PROXY_URL = (Deno.env.get("CINETPAY_PROXY_URL") || "").replace(/\/$/, "");
const CINETPAY_PROXY_TOKEN = Deno.env.get("CINETPAY_PROXY_TOKEN") || "";

interface CountryConfig {
  country_code: string;
  currency: string;
  phone_prefix: string;
  secret_key_name: string;
  secret_password_name: string;
  is_active: boolean;
}

// in-memory token cache (per isolate)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function getCredentials(cfg: CountryConfig): { key: string; password: string } {
  const key = Deno.env.get(cfg.secret_key_name);
  const password = Deno.env.get(cfg.secret_password_name);
  if (!key || !password) {
    throw new Error(`Missing CinetPay credentials for ${cfg.country_code} (${cfg.secret_key_name})`);
  }
  return { key, password };
}

/** Auto-detect base URL from key prefix (sk_test_ -> .net sandbox, sk_live_ -> .co prod). */
function baseForKey(key: string): string {
  if (Deno.env.get("CINETPAY_BASE_URL")) return BASE_URL;
  if (key.startsWith("sk_live_")) return "https://api.cinetpay.co";
  return DEFAULT_BASE;
}

async function bodyToText(body: BodyInit | null | undefined): Promise<string | null> {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Blob) return await body.text();
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  throw new Error("CinetPay proxy only supports text-compatible request bodies");
}

// Cache the admin-controlled proxy toggle (platform_settings.cinetpay_proxy_enabled)
let proxyToggleCache: { enabled: boolean; expiresAt: number } | null = null;
async function isProxyEnabledByAdmin(): Promise<boolean> {
  if (proxyToggleCache && proxyToggleCache.expiresAt > Date.now()) return proxyToggleCache.enabled;
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/platform_settings?key=eq.cinetpay_proxy_enabled&select=value`;
    const res = await fetch(url, {
      headers: {
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`,
      },
    });
    const rows = await res.json().catch(() => []);
    const enabled = rows?.[0]?.value?.enabled === true;
    proxyToggleCache = { enabled, expiresAt: Date.now() + 15_000 };
    return enabled;
  } catch (e) {
    console.warn("isProxyEnabledByAdmin failed, defaulting to false:", (e as Error).message);
    return false;
  }
}

async function cinetpayDirectOrProxyFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const adminEnabled = await isProxyEnabledByAdmin();
  if (!CINETPAY_PROXY_URL || !adminEnabled) return fetch(url, init);


  const targetHeaders = Object.fromEntries(new Headers(init.headers || {}).entries());
  const proxyHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (CINETPAY_PROXY_TOKEN) proxyHeaders.Authorization = `Bearer ${CINETPAY_PROXY_TOKEN}`;

  const proxyRes = await fetch(CINETPAY_PROXY_URL, {
    method: "POST",
    headers: proxyHeaders,
    body: JSON.stringify({
      url,
      method: init.method || "GET",
      headers: targetHeaders,
      body: await bodyToText(init.body),
    }),
  });

  const contentType = proxyRes.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return proxyRes;

  const proxied = await proxyRes.clone().json().catch(() => null);
  if (typeof proxied?.status === "number" && typeof proxied?.body === "string") {
    return new Response(proxied.body, {
      status: proxied.status,
      headers: proxied.headers || { "Content-Type": "application/json" },
    });
  }

  return proxyRes;
}

export class CinetPayIpRejectedError extends Error {
  egressIp: string | null;
  rawResponse: string;
  status: number;

  constructor(egressIp: string | null, rawResponse: string, status: number) {
    super(
      `CinetPay refuse l'IP du backend. IP sortante détectée: ${egressIp ?? "inconnue"}. ` +
      `Ajoute-la à la whitelist CinetPay. Réponse brute: ${rawResponse.slice(0, 300)}`
    );
    this.name = "CinetPayIpRejectedError";
    this.egressIp = egressIp;
    this.rawResponse = rawResponse;
    this.status = status;
  }
}

export async function getAccessToken(cfg: CountryConfig): Promise<string> {
  const cached = tokenCache.get(cfg.country_code);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const { key, password } = getCredentials(cfg);
  const base = baseForKey(key);
  const loginUrl = `${base}/v1/oauth/login`;

  try {
    const res = await cinetpayDirectOrProxyFetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ api_key: key, api_password: password }),
    });

    const rawText = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(rawText); } catch { /* not json */ }

    if (!res.ok) {
      // ALWAYS probe egress IP on any auth failure — both direct and via proxy when configured —
      // so the user sees which IP CinetPay sees, regardless of error code (404, 401, NOT_ALLOWED…).
      let directIp: string | null = null;
      let proxyIp: string | null = null;
      try {
        const r = await fetch("https://api.ipify.org?format=json");
        if (r.ok) directIp = (await r.json().catch(() => null))?.ip ?? null;
      } catch (_) { /* ignore */ }
      if (CINETPAY_PROXY_URL) {
        try {
          const proxyHeaders: Record<string, string> = { "Content-Type": "application/json" };
          if (CINETPAY_PROXY_TOKEN) proxyHeaders.Authorization = `Bearer ${CINETPAY_PROXY_TOKEN}`;
          const pr = await fetch(CINETPAY_PROXY_URL, {
            method: "POST",
            headers: proxyHeaders,
            body: JSON.stringify({ url: "https://api.ipify.org?format=json", method: "GET", headers: {}, body: null }),
          });
          const pj = await pr.json().catch(() => null);
          if (pj?.body) { try { proxyIp = JSON.parse(pj.body)?.ip ?? null; } catch {} }
        } catch (_) { /* ignore */ }
      }

      const lower = rawText.toLowerCase();
      const isIpReject =
        lower.includes("not_allowed") ||
        lower.includes("whitelist") ||
        (lower.includes("ip") && (lower.includes("not allowed") || lower.includes("autoris")));

      // Treat unknown auth failures with empty body (e.g. CinetPay returning bare 404 to non-whitelisted IPs)
      // as probable IP rejection so the IP is surfaced to the user.
      const adminProxyOn = await isProxyEnabledByAdmin();
      const probableIpReject = isIpReject || (rawText.trim() === "" && (res.status === 404 || res.status === 401 || res.status === 403));

      const egressIp = adminProxyOn && CINETPAY_PROXY_URL ? proxyIp : directIp;

      if (probableIpReject) {

        console.error("===== CinetPay IP REJECTION =====");
        console.error("URL:", loginUrl);
        console.error("Proxy enabled:", CINETPAY_PROXY_URL ? "yes" : "no");
        if (CINETPAY_PROXY_URL) console.error("Proxy URL:", CINETPAY_PROXY_URL);
        console.error("HTTP status:", res.status);
        console.error("Response headers:", JSON.stringify(Object.fromEntries(res.headers.entries())));
        console.error("Raw response body:", rawText);
        if (parsed) console.error("Parsed response:", JSON.stringify(parsed, null, 2));
        console.error("Backend egress IP (à whitelister chez CinetPay):", egressIp ?? "inconnue");
        console.error("=================================");

        throw new CinetPayIpRejectedError(egressIp, rawText, res.status);
      }

      console.error("===== CinetPay AUTH FAIL (non-IP) =====");
      console.error("URL:", loginUrl, "status:", res.status);
      console.error("Direct egress IP (Supabase, dynamique):", directIp ?? "inconnue");
      console.error("Proxy egress IP (à whitelister si proxy ON):", proxyIp ?? (CINETPAY_PROXY_URL ? "échec sonde proxy" : "proxy non configuré"));
      console.error("Admin proxy toggle:", adminProxyOn ? "ON" : "OFF");
      console.error("Raw body:", rawText.slice(0, 500));
      console.error("========================================");
      throw new Error(`CinetPay auth failed (${res.status}): ${rawText.slice(0, 300)}`);
    }

    const data = parsed ?? {};
    const token: string | undefined = data?.access_token || data?.data?.token || data?.token;
    if (!token) throw new Error(`CinetPay auth: no token in response: ${rawText.slice(0, 200)}`);
    tokenCache.set(cfg.country_code, { token, expiresAt: Date.now() + 45 * 60 * 1000 });
    return token;
  } catch (err) {
    console.error("getAccessToken error for", cfg.country_code, "->", (err as Error).message);
    throw err;
  }
}

export async function cinetpayFetch(cfg: CountryConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken(cfg);
  const { key } = getCredentials(cfg);
  const base = baseForKey(key);
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return cinetpayDirectOrProxyFetch(`${base}${path}`, { ...init, headers });
}

export function genMerchantId(prefix: "PI" | "PO" = "PI"): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rnd}`.slice(0, 30);
}

export function genNotifyToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function detectCountryByPhone(phone: string, countries: CountryConfig[]): CountryConfig | null {
  const normalized = phone.replace(/\s/g, "");
  return countries.find(c => normalized.startsWith(c.phone_prefix)) || null;
}

export { BASE_URL };
export type { CountryConfig };
