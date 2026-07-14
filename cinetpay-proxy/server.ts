// Tiny HTTP proxy server — Deno runtime, deployable on Fly.io / Render / Railway.
// Receives POST /forward { url, method, headers, body } and forwards the request,
// returning { status, headers, body } as JSON. Egress IP = the platform's fixed IP.

const PORT = Number(Deno.env.get("PORT") || 8080);
const PROXY_TOKEN = Deno.env.get("PROXY_TOKEN") || "";

const ALLOWED_HOST_SUFFIXES = [
  "api.cinetpay.net",
  "api.cinetpay.co",
  "api.ipify.org",
];

function isAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_HOST_SUFFIXES.some(h => u.hostname === h || u.hostname.endsWith("." + h));
  } catch { return false; }
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }

  if (url.pathname !== "/forward") return new Response("Not found", { status: 404 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (PROXY_TOKEN) {
    const auth = req.headers.get("Authorization") || "";
    if (auth !== `Bearer ${PROXY_TOKEN}`) return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try { payload = await req.json(); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const { url: targetUrl, method = "GET", headers = {}, body = null } = payload || {};
  if (typeof targetUrl !== "string" || !isAllowed(targetUrl)) {
    return new Response(JSON.stringify({ error: "Target host not allowed" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: headers as Record<string, string>,
      body: body == null ? undefined : body,
    });
    const respBody = await upstream.text();
    const respHeaders: Record<string, string> = {};
    upstream.headers.forEach((v, k) => { respHeaders[k] = v; });

    return new Response(JSON.stringify({
      status: upstream.status,
      headers: respHeaders,
      body: respBody,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
});
