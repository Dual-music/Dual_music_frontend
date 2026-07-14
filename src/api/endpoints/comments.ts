/**
 * Comments endpoints — wrappers over `/comments/*`.
 *
 * Polymorphic: a comment targets a `contentType` (duel|live|lifestyle|blog|replay)
 * + `contentId`. The list is flat (newest first) with `likes_count` + per-caller
 * `liked`; the client builds the reply tree from `parent_id`.
 *
 * @module api/endpoints/comments
 */

import { http } from "../http";

export type CommentTarget = "duel" | "live" | "lifestyle" | "blog" | "replay";

/** GET /comments?contentType=&contentId= — flat list, enriched. */
export function listComments(
  contentType: CommentTarget,
  contentId: string,
): Promise<Array<Record<string, unknown>>> {
  return http.get("/comments", { query: { contentType, contentId } });
}

/** POST /comments — create (optionally a reply via `parentId`). */
export function createComment(input: {
  contentType: CommentTarget;
  contentId: string;
  content: string;
  parentId?: string;
}): Promise<Record<string, unknown>> {
  return http.post("/comments", input);
}

/** DELETE /comments/:id — soft-delete (author/staff). */
export function deleteComment(id: string): Promise<{ success?: boolean }> {
  return http.delete(`/comments/${id}`);
}

/** POST /comments/:id/likes — toggle like. */
export function toggleLike(id: string): Promise<Record<string, unknown>> {
  return http.post(`/comments/${id}/likes`);
}
