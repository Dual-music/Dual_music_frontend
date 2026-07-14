/**
 * Shared Moneroo HTTP client used by every `moneroo-*` edge function.
 *
 * Wraps the Moneroo v1 REST API (https://api.moneroo.io/v1) with Bearer auth
 * sourced from `MONEROO_SECRET_KEY`. Exposes helpers for merchant id
 * generation, signed POST/GET, and CORS headers. PayIn/PayOut callbacks are
 * authenticated via HMAC-SHA256 against `MONEROO_WEBHOOK_SECRET`.
 *
 * @see      supabase/functions/moneroo-payin-init, moneroo-payout-init
 * @env      MONEROO_SECRET_KEY
 */
const MONEROO_BASE = "https://api.moneroo.io/v1";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function genMerchantId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${prefix}-${Date.now()}-${rand}`;
}

export async function monerooFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = Deno.env.get("MONEROO_API_KEY");
  if (!apiKey) throw new Error("MONEROO_API_KEY not configured");
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> || {}),
  };
  return fetch(`${MONEROO_BASE}${path}`, { ...init, headers });
}

/**
 * Call Moneroo API and return a structured diagnostic envelope ready to be
 * persisted into moneroo_transactions (request_url/payload/headers/status/timestamps).
 * The Authorization header is redacted so we never store the raw API key.
 */
export interface MonerooCallLog {
  request_url: string;
  request_payload: unknown;
  request_headers: Record<string, string>;
  http_status: number;
  http_status_text: string;
  request_sent_at: string;
  response_received_at: string;
  raw_response: unknown;
  ok: boolean;
}

export async function monerooCall(
  path: string,
  payload: Record<string, unknown>,
): Promise<MonerooCallLog> {
  const apiKey = Deno.env.get("MONEROO_API_KEY");
  if (!apiKey) throw new Error("MONEROO_API_KEY not configured");
  const url = `${MONEROO_BASE}${path}`;
  const headers: Record<string, string> = {
    "Authorization": "Bearer ***redacted***",
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
  const sentAt = new Date().toISOString();
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const receivedAt = new Date().toISOString();
  const text = await res.text();
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { raw = { raw: text }; }
  return {
    request_url: url,
    request_payload: payload,
    request_headers: headers,
    http_status: res.status,
    http_status_text: res.statusText,
    request_sent_at: sentAt,
    response_received_at: receivedAt,
    raw_response: raw,
    ok: res.ok,
  };
}
