/**
 * Concerts & dedications endpoints — wrappers over `/concerts/*` and
 * `/artist-concerts/*`.
 *
 * Ticket purchase is a wallet op (`endpoints/wallet.ts#buyConcertTicket`).
 * Dedication purchase settles atomically on the backend and accepts an
 * Idempotency-Key.
 *
 * @module api/endpoints/concerts
 */

import { http } from "../http";

const idem = (key?: string) => (key ? { headers: { "Idempotency-Key": key } } : {});

/** GET /concerts — admin-programmed concert catalog. */
export function listConcerts(
  query?: Record<string, string | number | undefined>,
): Promise<Array<Record<string, unknown>>> {
  return http.get("/concerts", { query });
}

/** POST /concerts — create an admin concert. */
export function createConcert(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/concerts", input);
}

/** PATCH /concerts/:id — update an admin concert (status/recording, admin). */
export function updateConcert(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/concerts/${id}`, patch);
}

/** GET /concerts/:id */
export function getConcert(id: string): Promise<Record<string, unknown>> {
  return http.get(`/concerts/${id}`);
}

/** GET /artist-concerts/:id — single artist concert, hydrated with artist. */
export function getArtistConcert(id: string): Promise<Record<string, unknown>> {
  return http.get(`/artist-concerts/${id}`);
}

/** GET /artist-concerts — artist-created concerts (default: approved). */
export function listArtistConcerts(
  query?: Record<string, string | number | undefined>,
): Promise<Array<Record<string, unknown>>> {
  return http.get("/artist-concerts", { query });
}

/** GET /artist-concerts/me — the caller's own artist concerts (all statuses). */
export function myArtistConcerts(): Promise<Array<Record<string, unknown>>> {
  return http.get("/artist-concerts/me");
}

/** POST /artist-concerts — create an artist concert (pending approval). */
export function createArtistConcert(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/artist-concerts", input);
}

/** PATCH /artist-concerts/:id — update an artist concert (owner/admin). */
export function updateArtistConcert(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/artist-concerts/${id}`, patch);
}

/** DELETE /artist-concerts/:id — delete an artist concert (owner/admin). */
export function deleteArtistConcert(id: string): Promise<{ success: boolean }> {
  return http.delete(`/artist-concerts/${id}`);
}

/** POST /artist-concerts/:id/review — admin approve/reject. */
export function reviewArtistConcert(id: string, input: { approve: boolean; rejectionReason?: string }): Promise<Record<string, unknown>> {
  return http.post(`/artist-concerts/${id}/review`, input);
}

/** GET /concerts/:id/ticket-info — caller's ticket (or null) + total sold. */
export function ticketInfo(concertId: string): Promise<{ ticket: Record<string, unknown> | null; count: number }> {
  return http.get(`/concerts/${concertId}/ticket-info`);
}

// --- Reminders ---------------------------------------------------------------

/** GET /concerts/:id/reminder — whether the caller has a reminder set. */
export function getReminder(concertId: string): Promise<{ active: boolean }> {
  return http.get(`/concerts/${concertId}/reminder`);
}

/** PUT /concerts/:id/reminder — enable a reminder for the caller. */
export function setReminder(concertId: string, reminderType = "30min"): Promise<{ active: boolean }> {
  return http.put(`/concerts/${concertId}/reminder`, { reminderType });
}

/** DELETE /concerts/:id/reminder — disable the caller's reminder. */
export function removeReminder(concertId: string): Promise<{ active: boolean }> {
  return http.delete(`/concerts/${concertId}/reminder`);
}

// --- Dedications -------------------------------------------------------------

/** POST /concerts/dedications — purchase a concert/live dedication (atomic). */
export function purchaseDedication(
  input: { concertId: string; concertType: string; message: string; priceCredits: number },
  idempotencyKey?: string,
): Promise<{ dedicationId: string }> {
  return http.post("/concerts/dedications", input, idem(idempotencyKey));
}

/** GET /concerts/dedications/me — the caller's dedications (fan view). */
export function myDedications(): Promise<Array<Record<string, unknown>>> {
  return http.get("/concerts/dedications/me");
}

/**
 * GET /concerts/dedications/artist/me — dedications RECEIVED by the caller
 * (artist inbox), newest first, each enriched with the fan display profile.
 */
export function myReceivedDedications(): Promise<Array<Record<string, unknown>>> {
  return http.get("/concerts/dedications/artist/me");
}

/**
 * GET /artist-concerts/titles?ids=a,b — resolve artist-concert titles by id.
 * Returns only found rows; callers keep a graceful fallback for missing ids.
 * (Live-event titles resolve via `/lives/titles` — see {@link dedicationEventTitles}.)
 */
export function titlesByIds(ids: string[]): Promise<Array<{ id: string; title: string }>> {
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (clean.length === 0) return Promise.resolve([]);
  return http.get("/artist-concerts/titles", { query: { ids: clean.join(",") } });
}

/**
 * Resolves the linked-event title for a batch of dedications, dispatching by
 * `concert_type`: `artist_concert` ids via `/artist-concerts/titles`, live ids
 * via the lives domain (`/lives/titles`, owned by the lives endpoints). Returns
 * a `Map<concert_id, title>`; unresolved ids are simply absent so callers keep
 * their fallback label.
 */
export async function dedicationEventTitles(
  refs: Array<{ concert_id: string; concert_type?: string }>,
): Promise<Map<string, string>> {
  const concertIds = refs.filter((r) => r.concert_type !== "artist_live").map((r) => r.concert_id);
  const liveIds = Array.from(
    new Set(refs.filter((r) => r.concert_type === "artist_live").map((r) => r.concert_id).filter(Boolean)),
  );
  const [concerts, lives] = await Promise.all([
    titlesByIds(concertIds),
    liveIds.length
      ? http.get<Array<{ id: string; title: string }>>("/lives/titles", { query: { ids: liveIds.join(",") } })
      : Promise.resolve([] as Array<{ id: string; title: string }>),
  ]);
  const map = new Map<string, string>();
  for (const r of concerts) if (r.title) map.set(r.id, r.title);
  for (const r of lives) if (r.title) map.set(r.id, r.title);
  return map;
}

/** GET /concerts/dedications?concertId=&concertType= — event dedications (host/artist). */
export function listConcertDedications(
  query: { concertId: string; concertType: string },
): Promise<Array<Record<string, unknown>>> {
  return http.get("/concerts/dedications", { query });
}

/** POST /concerts/dedications/:id/deliver — mark a dedication delivered. */
export function deliverDedication(id: string): Promise<Record<string, unknown>> {
  return http.post(`/concerts/dedications/${id}/deliver`);
}
