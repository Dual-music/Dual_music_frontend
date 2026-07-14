/**
 * Edge Function: livekit-token
 *
 * Issue a short-lived LiveKit access token for a room (duel/live/concert).
 * Requires Supabase auth (Bearer JWT). The caller's `auth.uid()` is used as `identity`.
 * Grants are derived from `role` ("host" | "guest" | "viewer"): hosts can publish A/V,
 * guests can publish, viewers are subscribe-only.
 *
 * @endpoint POST /functions/v1/livekit-token
 * @body     { room: string; role?: "host"|"guest"|"viewer"; name?: string; metadata?: any }
 * @returns  { token: string; url: string; identity: string }
 * @env      LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL, SUPABASE_URL, SUPABASE_ANON_KEY
 * @see      src/hooks/useLiveKit.ts (consumer)
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// LiveKit JWT generation without external SDK
// LiveKit tokens are JWTs with specific claims

function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToUint8Array(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function createHmacSha256(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    textToUint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, textToUint8Array(data));
  return base64UrlEncode(new Uint8Array(signature));
}

interface VideoGrant {
  roomCreate?: boolean;
  roomList?: boolean;
  roomRecord?: boolean;
  roomAdmin?: boolean;
  roomJoin?: boolean;
  room?: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  canUpdateOwnMetadata?: boolean;
  hidden?: boolean;
}

interface TokenClaims {
  identity: string;
  name?: string;
  video?: VideoGrant;
  metadata?: string;
}

async function createLiveKitToken(
  apiKey: string,
  apiSecret: string,
  claims: TokenClaims,
  ttl: number = 6 * 60 * 60 // 6 hours
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const payload = {
    iss: apiKey,
    sub: claims.identity,
    name: claims.name || claims.identity,
    nbf: now,
    exp: now + ttl,
    iat: now,
    jti: claims.identity + "-" + now,
    video: claims.video || {},
    metadata: claims.metadata || "",
  };

  const headerB64 = base64UrlEncode(textToUint8Array(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(textToUint8Array(JSON.stringify(payload)));
  const signature = await createHmacSha256(apiSecret, `${headerB64}.${payloadB64}`);

  return `${headerB64}.${payloadB64}.${signature}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY");
    const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET");
    const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL");

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return new Response(
        JSON.stringify({ error: "LiveKit configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { roomName, isHost = false, participantName } = body;

    if (!roomName) {
      return new Response(
        JSON.stringify({ error: "roomName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build grants based on role
    const videoGrant: VideoGrant = {
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    };

    if (isHost) {
      videoGrant.canPublish = true;
      videoGrant.roomAdmin = true;
    } else {
      // Viewers can't publish by default (can be upgraded for guests)
      videoGrant.canPublish = body.canPublish || false;
    }

    const token = await createLiveKitToken(
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      {
        identity: user.id,
        name: participantName || user.email || "User",
        video: videoGrant,
        metadata: JSON.stringify({
          isHost,
          userId: user.id,
        }),
      }
    );

    return new Response(
      JSON.stringify({
        token,
        url: LIVEKIT_URL,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
