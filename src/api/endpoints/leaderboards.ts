/**
 * Leaderboards / seasons / rewards endpoints — wrappers over `/leaderboards/*`.
 *
 * @module api/endpoints/leaderboards
 */

import { http } from "../http";

/** GET /leaderboards/seasons */
export function listSeasons(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/leaderboards/seasons", { query });
}

/** A per-context gift/vote engagement leaderboard row (top sender). */
export interface GiftEngagementEntry {
  user_id: string;
  total: number;
  full_name: string | null;
  avatar_url: string | null;
}

/** The event context a gift-engagement leaderboard is scoped to. */
export type GiftEngagementContext =
  | { contextType: "duel"; contextId: string }
  | { contextType: "concert"; contextId: string }
  | { contextType: "live"; contextId: string }
  | { contextType: "competition"; contextId: string };

/**
 * GET /leaderboards/gifts — top engagement senders for a single event context.
 * Server-side aggregation of the relevant gift/vote tables per context type.
 */
export function giftEngagement(ctx: GiftEngagementContext): Promise<GiftEngagementEntry[]> {
  return http.get("/leaderboards/gifts", { query: { ...ctx }, anonymous: true });
}

/** GET /leaderboards/artists — all-time artist leaderboard. */
export function allTimeArtists(query?: { limit?: number }): Promise<Array<{ id: string; name: string | null; avatar_url: string | null; score: number }>> {
  return http.get("/leaderboards/artists", { query, anonymous: true });
}

/** GET /leaderboards/donors — all-time donor leaderboard. */
export function allTimeDonors(query?: { limit?: number }): Promise<Array<{ id: string; name: string | null; avatar_url: string | null; score: number }>> {
  return http.get("/leaderboards/donors", { query, anonymous: true });
}

/** GET /leaderboards/winners — all season winners (history). */
export function allWinners(): Promise<Array<Record<string, unknown>>> {
  return http.get("/leaderboards/winners", { anonymous: true });
}

/** GET /leaderboards/seasons/:id */
export function getSeason(id: string): Promise<Record<string, unknown>> {
  return http.get(`/leaderboards/seasons/${id}`);
}

/** GET /leaderboards/seasons/:id/ranking */
export function getRanking(id: string, query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get(`/leaderboards/seasons/${id}/ranking`, { query });
}

/** GET /leaderboards/seasons/:id/live — realtime-friendly live ranking snapshot. */
export function getLiveRanking(id: string): Promise<Array<Record<string, unknown>>> {
  return http.get(`/leaderboards/seasons/${id}/live`);
}

/** GET /leaderboards/seasons/:id/winners */
export function getWinners(id: string): Promise<Array<Record<string, unknown>>> {
  return http.get(`/leaderboards/seasons/${id}/winners`);
}

/** POST /leaderboards/seasons (admin) */
export function createSeason(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/leaderboards/seasons", input);
}

/** PATCH /leaderboards/seasons/:id (admin) */
export function updateSeason(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/leaderboards/seasons/${id}`, patch);
}

/** DELETE /leaderboards/seasons/:id (admin) */
export function deleteSeason(id: string): Promise<void> {
  return http.delete(`/leaderboards/seasons/${id}`);
}

/** POST /leaderboards/seasons/:id/rewards (admin) — define a rank reward. */
export function createReward(seasonId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/leaderboards/seasons/${seasonId}/rewards`, input);
}

/** PATCH /leaderboards/rewards/:id (admin) */
export function updateReward(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/leaderboards/rewards/${id}`, patch);
}

/** DELETE /leaderboards/rewards/:id (admin) */
export function deleteReward(id: string): Promise<void> {
  return http.delete(`/leaderboards/rewards/${id}`);
}

/** POST /leaderboards/seasons/:id/winners (admin) — create a season winner row. */
export function createWinner(seasonId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/leaderboards/seasons/${seasonId}/winners`, input);
}

/** PATCH /leaderboards/winners/:id (admin) — update winner/meeting state. */
export function updateWinner(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/leaderboards/winners/${id}`, patch);
}

/** POST /leaderboards/winners/:id/respond — winner responds to a reward meeting. */
export function respondMeeting(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/leaderboards/winners/${id}/respond`, input);
}

/** POST /leaderboards/winners/:id/distribute (admin) — distribute a reward (atomic). */
export function distributeReward(id: string): Promise<Record<string, unknown>> {
  return http.post(`/leaderboards/winners/${id}/distribute`);
}

/** POST /leaderboards/winners/:id/mark-received — winner confirms receipt. */
export function markReceived(id: string): Promise<Record<string, unknown>> {
  return http.post(`/leaderboards/winners/${id}/mark-received`);
}

/** POST /leaderboards/seasons/:id/notify-winners (admin) */
export function notifyWinners(seasonId: string): Promise<Record<string, unknown>> {
  return http.post(`/leaderboards/seasons/${seasonId}/notify-winners`);
}
