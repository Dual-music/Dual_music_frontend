/**
 * Blogs endpoints — wrappers over `/blogs/*`.
 *
 * @module api/endpoints/blogs
 */

import { http } from "../http";

/** GET /blogs — published for public; staff may pass `?published=all|false`; `?category=`. */
export function listBlogs(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/blogs", { query });
}

/** GET /blogs/:id */
export function getBlog(id: string): Promise<Record<string, unknown>> {
  return http.get(`/blogs/${id}`);
}

/** POST /blogs — create (admin). */
export function createBlog(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/blogs", input);
}

/** PATCH /blogs/:id — update (admin). */
export function updateBlog(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/blogs/${id}`, patch);
}

/** DELETE /blogs/:id — soft-delete (admin). */
export function deleteBlog(id: string): Promise<{ success?: boolean }> {
  return http.delete(`/blogs/${id}`);
}

/** POST /blogs/:id/views — increment view count. */
export function addView(id: string): Promise<Record<string, unknown>> {
  return http.post(`/blogs/${id}/views`);
}
