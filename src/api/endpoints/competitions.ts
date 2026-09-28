/**
 * Competitions endpoints — wrappers over `/competitions/*`.
 *
 * Covers the full lifecycle: catalog, creation, candidate application/review,
 * publish, performer/focus selection, finalize ranking, plus paid actions
 * (vote, gift, ticket) which settle atomically and accept an Idempotency-Key.
 *
 * @module api/endpoints/competitions
 */

import { http } from "../http";

const idem = (key?: string) => (key ? { headers: { "Idempotency-Key": key } } : {});

/** GET /competitions — catalog. */
export function listCompetitions(
  query?: Record<string, string | number | undefined>,
): Promise<Array<Record<string, unknown>>> {
  return http.get("/competitions", { query });
}

/** POST /competitions — create (admin). */
export function createCompetition(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/competitions", input);
}

/** GET /competitions/:id */
export function getCompetition(id: string): Promise<Record<string, unknown>> {
  return http.get(`/competitions/${id}`);
}

/** GET /competitions/mine — the caller's competitions (manager/admin), all statuses. */
export function myCompetitions(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/competitions/mine", { query });
}

/** PATCH /competitions/:id — update (manager owner/admin); `{status:'cancelled'}` to cancel. */
export function updateCompetition(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/competitions/${id}`, patch);
}

/** GET /competitions/:id/my-ticket — whether the caller holds a ticket + count. */
export function myTicket(id: string): Promise<{ hasTicket: boolean; count?: number }> {
  return http.get(`/competitions/${id}/my-ticket`);
}

/** GET /competitions/candidacies/mine — the caller's own candidacies (artist), newest first. */
export function myCandidacies(): Promise<Array<Record<string, unknown>>> {
  return http.get("/competitions/candidacies/mine");
}

/** GET /competitions/tickets/mine — distinct competition ids the caller holds a ticket for. */
export function myTickets(): Promise<string[]> {
  return http.get("/competitions/tickets/mine");
}

/** GET /competitions/:id/candidates */
export function listCandidates(id: string): Promise<Array<Record<string, unknown>>> {
  return http.get(`/competitions/${id}/candidates`);
}

/** POST /competitions/:id/apply — apply as a candidate. */
export function apply(id: string, input?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/competitions/${id}/apply`, input ?? {});
}

/**
 * POST /competitions/:id/candidates/manual — manager/admin adds a candidate directly (walk-in,
 * onsite events), bypassing self-application + review. Gated by the `manual_candidates_config`
 * platform setting (disabled by default).
 */
export function addCandidateManually(id: string, input: { artistId: string; pitch?: string }): Promise<Record<string, unknown>> {
  return http.post(`/competitions/${id}/candidates/manual`, input);
}

/** POST /competitions/candidates/:id/review — approve/reject a candidate (admin). */
export function reviewCandidate(candidateId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/competitions/candidates/${candidateId}/review`, input);
}

/**
 * DELETE /competitions/candidates/:id — remove a candidate (any status). The server refunds the
 * entry fee automatically if it was actually charged (idempotent — safe even if nothing was paid).
 */
export function removeCandidate(candidateId: string): Promise<{ removed: boolean; refunded: boolean }> {
  return http.delete(`/competitions/candidates/${candidateId}`);
}

/**
 * GET /competitions/candidates/pending-count/mine — manager-only cumulative count of pending
 * candidates across all of the caller's competitions (sidebar badge).
 */
export function myPendingCandidatesCount(): Promise<{ count: number }> {
  return http.get("/competitions/candidates/pending-count/mine");
}

/**
 * POST /competitions/candidates/:id/jury-votes — sets (absolute, not increment) a candidate's
 * cumulative jury votes (manager), added to paid votes + gift credits in the live/final ranking.
 */
export function setJuryVotes(candidateId: string, juryVotes: number): Promise<Record<string, unknown>> {
  return http.post(`/competitions/candidates/${candidateId}/jury-votes`, { juryVotes });
}

/** POST /competitions/:id/publish */
export function publish(id: string, input?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/competitions/${id}/publish`, input ?? {});
}

/** POST /competitions/:id/performer — set the current performer. */
export function setPerformer(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/competitions/${id}/performer`, input);
}

/** POST /competitions/:id/focus — set the focused candidate. */
export function setFocus(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/competitions/${id}/focus`, input);
}

/** POST /competitions/:id/finalize — finalize the ranking. */
export function finalize(id: string, input?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/competitions/${id}/finalize`, input ?? {});
}

/** POST /competitions/:id/vote — paid vote for a candidate (atomic). */
export function vote(id: string, input: Record<string, unknown>, idempotencyKey?: string): Promise<Record<string, unknown>> {
  return http.post(`/competitions/${id}/vote`, input, idem(idempotencyKey));
}

/** POST /competitions/:id/gifts — send a gift in a competition (atomic). */
export function sendGift(id: string, input: Record<string, unknown>, idempotencyKey?: string): Promise<Record<string, unknown>> {
  return http.post(`/competitions/${id}/gifts`, input, idem(idempotencyKey));
}

/** POST /competitions/:id/tickets — buy a competition ticket (atomic). */
export function buyTicket(id: string, input?: Record<string, unknown>, idempotencyKey?: string): Promise<Record<string, unknown>> {
  return http.post(`/competitions/${id}/tickets`, input ?? {}, idem(idempotencyKey));
}
