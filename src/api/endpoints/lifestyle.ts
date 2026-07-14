/**
 * Lifestyle-videos endpoints — wrappers over `/lifestyle/*`.
 *
 * @module api/endpoints/lifestyle
 */

import { http } from "../http";

/** GET /lifestyle — list (optional `?artistId=`), newest first. */
export function listVideos(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/lifestyle", { query });
}

/** GET /lifestyle/:id — detail + artist + caller's `liked` flag. */
export function getVideo(id: string): Promise<Record<string, unknown>> {
  return http.get(`/lifestyle/${id}`);
}

/** POST /lifestyle — create (artist/admin). */
export function createVideo(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/lifestyle", input);
}

/** PATCH /lifestyle/:id — update (owner/staff). */
export function updateVideo(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/lifestyle/${id}`, patch);
}

/** DELETE /lifestyle/:id — soft-delete (owner/staff). */
export function deleteVideo(id: string): Promise<{ success?: boolean }> {
  return http.delete(`/lifestyle/${id}`);
}

/** POST /lifestyle/:id/views — increment view count. */
export function addView(id: string): Promise<Record<string, unknown>> {
  return http.post(`/lifestyle/${id}/views`);
}

/** POST /lifestyle/:id/likes — toggle like. */
export function toggleLike(id: string): Promise<Record<string, unknown>> {
  return http.post(`/lifestyle/${id}/likes`);
}

/** GET /lifestyle/liked/mine — ids of videos the caller has liked. */
export function likedByMe(): Promise<string[]> {
  return http.get<string[]>("/lifestyle/liked/mine");
}
