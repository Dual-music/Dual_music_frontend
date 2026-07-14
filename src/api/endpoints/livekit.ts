/**
 * LiveKit endpoints — wrapper over `/livekit/*`.
 *
 * Replaces the `livekit-token` edge function.
 *
 * @module api/endpoints/livekit
 */

import { http } from "../http";

/** POST /livekit/token — mint a room access token for the caller. */
export function getToken(
  input: { room: string; identity?: string; [key: string]: unknown },
): Promise<{ token: string; url?: string; [key: string]: unknown }> {
  return http.post("/livekit/token", input);
}
