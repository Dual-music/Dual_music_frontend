/**
 * Duels endpoints — wrappers over `/duels/*`.
 *
 * Voting is a wallet operation (`endpoints/wallet.ts#vote`). This module owns
 * the duel catalog, creation, the duel-request lifecycle, and vote reads.
 *
 * @module api/endpoints/duels
 */

import { http } from "../http";

/** GET /duels — duel catalog (supports pagination/status query). */
export function listDuels(
  query?: Record<string, string | number | undefined>,
): Promise<Array<Record<string, unknown>>> {
  return http.get("/duels", { query });
}

/** POST /duels — create a duel (admin/manager). */
export function createDuel(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/duels", input);
}

/** GET /duels/:id */
export function getDuel(id: string): Promise<Record<string, unknown>> {
  return http.get(`/duels/${id}`);
}

/** GET /duels/batch?ids=a,b — duels by id list (enrichment). */
export function batch(ids: string[]): Promise<Array<Record<string, unknown>>> {
  if (!ids.length) return Promise.resolve([]);
  return http.get("/duels/batch", { query: { ids: ids.join(",") } });
}

/** PATCH /duels/:id — update state (start/end/etc). */
export function updateDuel(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/duels/${id}`, patch);
}

/** GET /duels/:id/votes — vote tallies for a duel. */
export function getDuelVotes(id: string): Promise<Record<string, unknown>> {
  return http.get(`/duels/${id}/votes`);
}

/**
 * GET /duels/votes/batch?ids=a,b,c — bulk per-duel/per-artist vote tallies for
 * list-page rendering (avoids an N+1 of per-duel calls). Ids capped at 500.
 */
export function votesBatch(
  ids: string[],
): Promise<Array<{ duel_id: string; artist_id: string; total: number }>> {
  if (!ids.length) return Promise.resolve([]);
  return http.get("/duels/votes/batch", { query: { ids: ids.join(",") } });
}

/** GET /duels/votes/mine — the caller's duel-vote history (enriched). */
export function myVoteHistory(): Promise<Array<Record<string, unknown>>> {
  return http.get("/duels/votes/mine");
}

/** GET /duels/:id/my-ticket — whether the caller holds a ticket (+ count). */
export function myTicket(id: string): Promise<{ hasTicket: boolean; count: number }> {
  return http.get(`/duels/${id}/my-ticket`);
}

/** GET /duels/requests/mine — the caller's duel requests. */
export function myDuelRequests(): Promise<Array<Record<string, unknown>>> {
  return http.get("/duels/requests/mine");
}

/** POST /duels/requests — send a duel request. */
export function createDuelRequest(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/duels/requests", input);
}

/** POST /duels/requests/:id/respond — accept/decline a duel request. */
export function respondDuelRequest(
  id: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return http.post(`/duels/requests/${id}/respond`, input);
}
