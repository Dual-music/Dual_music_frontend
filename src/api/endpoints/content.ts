/**
 * Content-shares endpoints — wrappers over `/content/*`.
 *
 * @module api/endpoints/content
 */

import { http } from "../http";

/** POST /content/:type/:id/share — record a share. */
export function share(type: string, id: string, platform = "unknown"): Promise<Record<string, unknown>> {
  return http.post(`/content/${type}/${id}/share`, { platform });
}

/** GET /content/:type/:id/shares — total share count. */
export function shareCount(type: string, id: string): Promise<{ count: number }> {
  return http.get(`/content/${type}/${id}/shares`, { anonymous: true });
}
