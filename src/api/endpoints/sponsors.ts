/**
 * Sponsors endpoints — wrappers over `/sponsors/*`.
 *
 * Price tiers, sponsor requests (create/pay/review/price/approve-reuse), and
 * ad playback (play/stop) + history.
 *
 * @module api/endpoints/sponsors
 */

import { http } from "../http";

/** GET /sponsors/tiers */
export function listTiers(): Promise<Array<Record<string, unknown>>> {
  return http.get("/sponsors/tiers");
}

/** GET /sponsors/default-price?seconds= */
export function defaultPrice(query?: Record<string, string | number | undefined>): Promise<Record<string, unknown>> {
  return http.get("/sponsors/default-price", { query });
}

/** POST /sponsors/tiers (admin) */
export function createTier(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/sponsors/tiers", input);
}

/** PATCH /sponsors/tiers/:id (admin) */
export function updateTier(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/sponsors/tiers/${id}`, patch);
}

/** DELETE /sponsors/tiers/:id (admin) */
export function removeTier(id: string): Promise<void> {
  return http.delete(`/sponsors/tiers/${id}`);
}

/** GET /sponsors/requests (admin) */
export function listRequests(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/sponsors/requests", { query });
}

/** GET /sponsors/requests/me */
export function myRequests(): Promise<Array<Record<string, unknown>>> {
  return http.get("/sponsors/requests/me");
}

/** POST /sponsors/requests */
export function createRequest(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/sponsors/requests", input);
}

/** POST /sponsors/requests/:id/pay — pay for a sponsor slot (atomic). */
export function payRequest(id: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<Record<string, unknown>> {
  return http.post(`/sponsors/requests/${id}/pay`, input ?? {}, idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {});
}

/** PATCH /sponsors/requests/:id/review (admin) — approve/reject. */
export function reviewRequest(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/sponsors/requests/${id}/review`, patch);
}

/** PATCH /sponsors/requests/:id/price (admin) — set a custom price. */
export function setRequestPrice(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/sponsors/requests/${id}/price`, patch);
}

/** PATCH /sponsors/requests/:id/approve-reuse (admin) — approve reuse media. */
export function approveReuse(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/sponsors/requests/${id}/approve-reuse`, patch);
}

/** GET /sponsors/ads — active/eligible ads for playback. */
export function listAds(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/sponsors/ads", { query });
}

/** GET /sponsors/ads/history?eventId=&eventType= */
export function adHistory(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/sponsors/ads/history", { query });
}

/** GET /sponsors/ad-videos — all ad videos incl. inactive (admin). */
export function listAdVideos(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/sponsors/ad-videos", { query });
}

/** POST /sponsors/ad-videos — create an ad video (admin). */
export function createAdVideo(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/sponsors/ad-videos", input);
}

/** PATCH /sponsors/ad-videos/:id — update an ad video (admin, e.g. toggle active). */
export function updateAdVideo(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/sponsors/ad-videos/${id}`, patch);
}

/** PATCH /sponsors/deadline — set an event's sponsor submission deadline (admin). */
export function setDeadline(input: { eventType: string; eventId: string; deadline: string | null }): Promise<Record<string, unknown>> {
  return http.patch("/sponsors/deadline", input);
}

/** POST /sponsors/ads/play — start an ad play (returns play id). */
export function playAd(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/sponsors/ads/play", input);
}

/** POST /sponsors/ads/plays/:id/stop — stop an ad play. */
export function stopAd(id: string, input?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/sponsors/ads/plays/${id}/stop`, input ?? {});
}
