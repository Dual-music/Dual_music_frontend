/**
 * Artist-lives endpoints — wrappers over `/lives/*`.
 *
 * @module api/endpoints/lives
 */

import { http } from "../http";

/** GET /lives — live catalog (query: status, artistId, pagination). */
export function listLives(
  query?: Record<string, string | number | undefined>,
): Promise<Array<Record<string, unknown>>> {
  return http.get("/lives", { query });
}

/** POST /lives — start/create a live (artist). */
export function createLive(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/lives", input);
}

/** GET /lives/titles?ids=a,b — resolve live titles by id list. */
export function titlesByIds(ids: string[]): Promise<Array<{ id: string; title: string | null }>> {
  if (ids.length === 0) return Promise.resolve([]);
  return http.get("/lives/titles", { query: { ids: ids.join(",") } });
}

/** GET /lives/:id */
export function getLive(id: string): Promise<Record<string, unknown>> {
  return http.get(`/lives/${id}`);
}

/** GET /lives/:id/reports/summary — report count + caller's own report status. */
export function reportSummary(id: string): Promise<{ count: number; hasReported: boolean }> {
  return http.get(`/lives/${id}/reports/summary`);
}

/** POST /lives/:id/end — end a live (host). */
export function endLive(id: string): Promise<Record<string, unknown>> {
  return http.post(`/lives/${id}/end`);
}

/** PATCH /lives/:id — update lifecycle status (host/admin). */
export function updateStatus(id: string, status: "live" | "ended" | "upcoming"): Promise<Record<string, unknown>> {
  return http.patch(`/lives/${id}`, { status });
}

/** DELETE /lives/join-requests/:id — requester (or host/admin) cancels a request. */
export function cancelJoinRequest(id: string): Promise<Record<string, unknown>> {
  return http.delete(`/lives/join-requests/${id}`);
}

/** POST /lives/:id/likes — like a live. */
export function likeLive(id: string): Promise<Record<string, unknown>> {
  return http.post(`/lives/${id}/likes`);
}

/** GET /lives/:id/likes — current like count. */
export function getLikes(id: string): Promise<{ likes: number }> {
  return http.get(`/lives/${id}/likes`);
}

/** POST /lives/:id/join — request to join a live. */
export function joinLive(id: string, input?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/lives/${id}/join`, input ?? {});
}

/** GET /lives/:id/join-requests?status= — host/admin lists join requests. */
export function listJoinRequests(id: string, query?: { status?: string }): Promise<Array<Record<string, unknown>>> {
  return http.get(`/lives/${id}/join-requests`, { query });
}

/** POST /lives/join-requests/:id/respond — host accepts/declines a join request. */
export function respondJoinRequest(
  id: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return http.post(`/lives/join-requests/${id}/respond`, input);
}
