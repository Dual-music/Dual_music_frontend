/**
 * Event chat endpoints — the threaded-chat sub-resource attached to duels,
 * concerts, competitions and lives (`/:kind/:id/messages`).
 *
 * Realtime delivery of new messages is handled by the Socket.IO `/chat`
 * namespace (event `message`, room `kind:id`) — see `realtime/useEventChat`.
 *
 * @module api/endpoints/chat
 */

import { http } from "../http";

export type ChatKind = "duel" | "concert" | "competition" | "live";

/** Maps a chat kind to its REST collection base path. */
const BASE: Record<ChatKind, string> = {
  duel: "/duels",
  concert: "/concerts",
  competition: "/competitions",
  live: "/lives",
};

/** GET /:kind/:id/messages — paginated, author-hydrated history. */
export function listMessages(
  kind: ChatKind,
  eventId: string,
  query?: Record<string, string | number | undefined>,
): Promise<Array<Record<string, unknown>>> {
  return http.get(`${BASE[kind]}/${eventId}/messages`, { query });
}

/** POST /:kind/:id/messages — post a message or a reply. */
export function postMessage(
  kind: ChatKind,
  eventId: string,
  input: { message: string; parentId?: string | null },
): Promise<Record<string, unknown>> {
  return http.post(`${BASE[kind]}/${eventId}/messages`, input);
}

/** DELETE /:kind/:id/messages/:msgId — author/moderator hides a message. */
export function deleteMessage(kind: ChatKind, eventId: string, msgId: string): Promise<{ moderated: boolean }> {
  return http.delete(`${BASE[kind]}/${eventId}/messages/${msgId}`);
}
