/**
 * Mini proxy HTTP à IP sortante fixe — runtime Deno, déployable sur Fly.io / Render / Railway.
 *
 * Reçoit `POST /forward { url, method, headers, body }`, relaie la requête et renvoie
 * `{ status, headers, body }`. L'IP vue par CinetPay est celle de la plateforme d'hébergement,
 * donc stable et whitelistable — ce que ne permettent pas les Edge Functions (pool d'IP dynamique).
 *
 * ## Modèle de menace
 *
 * Ce service prend une URL en entrée et l'appelle : sans garde-fous c'est un SSRF ouvert,
 * utilisable pour atteindre des ressources internes ou faire du rebond. D'où :
 *
 * - **Liste blanche d'hôtes** stricte ({@link ALLOWED_HOSTS}) et **schéma HTTPS obligatoire**.
 * - **Jeton porteur** exigé entre l'appelant et le proxy (`PROXY_TOKEN`), comparé en temps constant.
 * - **Aucune redirection suivie** : une réponse 30x d'un hôte autorisé pourrait pointer ailleurs.
 * - **Plafond de taille** en entrée comme en sortie, et **timeout** par requête.
 * - **Filtrage des en-têtes** relayés : ni `host`, ni cookies, ni en-têtes de plateforme.
 *
 * @env PORT, PROXY_TOKEN
 */

const PORT = Number(Deno.env.get("PORT") || 8080);
const PROXY_TOKEN = Deno.env.get("PROXY_TOKEN") || "";

/** Hôtes joignables. Correspondance exacte : pas de suffixe, un sous-domaine peut être pris par un tiers. */
const ALLOWED_HOSTS = new Set([
  "api.cinetpay.net",
  "api.cinetpay.co",
  "api.ipify.org",
]);

/** En-têtes autorisés à traverser vers l'amont (liste blanche, minuscules). */
const FORWARDABLE_HEADERS = new Set(["authorization", "content-type", "accept"]);

/** Taille maximale du corps, en entrée comme en sortie (1 Mio). */
const MAX_BODY_BYTES = 1024 * 1024;

/** Délai maximal d'un appel amont (ms). */
const UPSTREAM_TIMEOUT_MS = 20_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Comparaison en temps constant, pour ne pas divulguer le jeton octet par octet. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** N'autorise que HTTPS vers un hôte explicitement listé. */
function isAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") return json({ ok: true });
  if (url.pathname !== "/forward") return new Response("Not found", { status: 404 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Le jeton est obligatoire : sans lui, n'importe qui dispose d'un relais anonyme.
  if (!PROXY_TOKEN) {
    console.error("PROXY_TOKEN manquant — le proxy refuse de relayer.");
    return json({ error: "Proxy misconfigured" }, 503);
  }
  const auth = req.headers.get("Authorization") || "";
  if (!safeEqual(auth, `Bearer ${PROXY_TOKEN}`)) return new Response("Unauthorized", { status: 401 });

  const rawIn = await req.arrayBuffer();
  if (rawIn.byteLength > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawIn));
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const targetUrl = payload.url;
  const method = typeof payload.method === "string" ? payload.method.toUpperCase() : "GET";
  const body = payload.body == null ? undefined : String(payload.body);

  if (typeof targetUrl !== "string" || !isAllowed(targetUrl)) {
    return json({ error: "Target host not allowed" }, 400);
  }
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return json({ error: "Method not allowed" }, 400);
  }
  if (body !== undefined && body.length > MAX_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  // Seuls les en-têtes utiles au protocole CinetPay traversent : rien qui puisse
  // trahir l'appelant ou détourner le routage amont.
  const upstreamHeaders: Record<string, string> = {};
  const incoming = payload.headers;
  if (incoming && typeof incoming === "object") {
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      if (FORWARDABLE_HEADERS.has(k.toLowerCase()) && typeof v === "string") upstreamHeaders[k] = v;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: upstreamHeaders,
      body,
      // Une 30x est renvoyée telle quelle à l'appelant : la suivre sortirait de la
      // liste blanche sans nouveau contrôle.
      redirect: "manual",
      signal: controller.signal,
    });

    const respBuf = await upstream.arrayBuffer();
    if (respBuf.byteLength > MAX_BODY_BYTES) return json({ error: "Upstream response too large" }, 502);

    const respHeaders: Record<string, string> = {};
    upstream.headers.forEach((v, k) => {
      // `set-cookie` et compagnie n'ont rien à faire dans la réponse relayée.
      if (k.toLowerCase() === "content-type") respHeaders[k] = v;
    });

    return json({
      status: upstream.status,
      headers: respHeaders,
      body: new TextDecoder().decode(respBuf),
    });
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    return json({ error: aborted ? "Upstream timeout" : (e as Error).message }, 502);
  } finally {
    clearTimeout(timer);
  }
});
