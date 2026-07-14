/**
 * Creators (artists & managers) endpoints — wrappers over `/artists/*` and
 * `/managers/*`.
 *
 * Covers the public artist directory, the artist/manager application (request)
 * lifecycle with admin review, and the artist self-profile update.
 *
 * @module api/endpoints/creators
 */

import { http } from "../http";

// --- Artists -----------------------------------------------------------------

/** GET /artists — public artist directory. */
export function listArtists(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/artists", { query });
}

/** POST /artists/requests — apply to become an artist. */
export function applyArtist(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/artists/requests", input);
}

/** GET /artists/requests/me — the caller's own artist applications. */
export function myArtistRequests(): Promise<Array<Record<string, unknown>>> {
  return http.get("/artists/requests/me");
}

/** GET /artists/requests — artist applications (admin). */
export function listArtistRequests(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/artists/requests", { query });
}

/** POST /artists/requests/:id/review — approve/reject an application (admin). */
export function reviewArtistRequest(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/artists/requests/${id}/review`, input);
}

/** PATCH /artists/me — update the caller's artist profile. */
export function updateArtistProfile(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch("/artists/me", patch);
}

/** GET /managers/me — read the caller's manager profile. */
export function myManagerProfile(): Promise<Record<string, unknown>> {
  return http.get("/managers/me");
}

/** GET /managers/:id — public manager profile by user id (404 when none/private). */
export function getManagerById(id: string): Promise<Record<string, unknown>> {
  return http.get(`/managers/${id}`);
}

/** PATCH /managers/me — update the caller's manager profile. */
export function updateManagerProfile(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch("/managers/me", patch);
}

// --- Managers ----------------------------------------------------------------

/** POST /managers/requests — apply to become a manager. */
export function applyManager(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/managers/requests", input);
}

/** GET /managers/requests/me — the caller's own manager applications. */
export function myManagerRequests(): Promise<Array<Record<string, unknown>>> {
  return http.get("/managers/requests/me");
}

/** GET /managers/requests — manager applications (admin). */
export function listManagerRequests(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/managers/requests", { query });
}

/** POST /managers/requests/:id/review — approve/reject an application (admin). */
export function reviewManagerRequest(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/managers/requests/${id}/review`, input);
}
