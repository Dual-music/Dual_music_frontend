/**
 * Replays endpoints — wrappers over `/replays/*`.
 *
 * Unlocking paid access is a wallet op (`endpoints/wallet.ts#unlockReplay`).
 *
 * @module api/endpoints/replays
 */

import { http } from "../http";

/** GET /replays — replay catalog. */
export function listReplays(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/replays", { query });
}

/** POST /replays — create/publish a replay. */
export function createReplay(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/replays", input);
}

/** GET /replays/:id */
export function getReplay(id: string): Promise<Record<string, unknown>> {
  return http.get(`/replays/${id}`);
}

/** PATCH /replays/:id */
export function updateReplay(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/replays/${id}`, patch);
}

/** DELETE /replays/:id */
export function deleteReplay(id: string): Promise<void> {
  return http.delete(`/replays/${id}`);
}

/** GET /replays/:id/access — whether the caller has unlocked this replay. */
export function getAccess(id: string): Promise<{ hasAccess: boolean; [key: string]: unknown }> {
  return http.get(`/replays/${id}/access`);
}

/** POST /replays/:id/views — increment view count. */
export function addView(id: string): Promise<Record<string, unknown>> {
  return http.post(`/replays/${id}/views`);
}

/** POST /replays/:id/likes — toggle/like a replay. */
export function likeReplay(id: string): Promise<Record<string, unknown>> {
  return http.post(`/replays/${id}/likes`);
}
