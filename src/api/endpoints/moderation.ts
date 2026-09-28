/**
 * Moderation endpoints — wrappers over `/moderation/*`.
 *
 * Reports (account/live/competition), stream/competition/platform bans, and
 * warnings.
 *
 * @module api/endpoints/moderation
 */

import { http, request } from "../http";

/** POST /moderation/reports/account */
export function reportAccount(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/moderation/reports/account", input);
}

/** POST /moderation/reports/live */
export function reportLive(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/moderation/reports/live", input);
}

/** POST /moderation/reports/competition */
export function reportCompetition(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/moderation/reports/competition", input);
}

/** GET /moderation/reports/:kind — kind ∈ account|live|competition (admin). */
export function listReports(kind: string, query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get(`/moderation/reports/${kind}`, { query });
}

/** PATCH /moderation/reports/:kind/:id — resolve a report (admin). */
export function reviewReport(kind: string, id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/moderation/reports/${kind}/${id}`, patch);
}

/** GET /moderation/stream-bans */
export function listStreamBans(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/moderation/stream-bans", { query });
}

/** POST /moderation/stream-bans */
export function createStreamBan(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/moderation/stream-bans", input);
}

/** DELETE /moderation/stream-bans/:id */
export function removeStreamBan(id: string): Promise<void> {
  return http.delete(`/moderation/stream-bans/${id}`);
}

/** POST /moderation/competition-bans */
export function createCompetitionBan(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/moderation/competition-bans", input);
}

/** DELETE /moderation/competition-bans/:id */
export function removeCompetitionBan(id: string): Promise<void> {
  return http.delete(`/moderation/competition-bans/${id}`);
}

/** GET /moderation/platform-bans (admin) */
export function listPlatformBans(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/moderation/platform-bans", { query });
}

/** POST /moderation/platform-bans (admin) */
export function createPlatformBan(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/moderation/platform-bans", input);
}

/** DELETE /moderation/platform-bans (admin) — lift a platform ban (body: { userId }). */
export function unbanPlatform(userId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/moderation/platform-bans", { method: "DELETE", body: { userId } });
}

/** GET /moderation/warnings/me */
export function myWarnings(): Promise<Array<Record<string, unknown>>> {
  return http.get("/moderation/warnings/me");
}

/** GET /moderation/warnings — all account warnings (admin). */
export function listWarnings(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/moderation/warnings", { query });
}

/** GET /moderation/reports/account/aggregate — per-user report counts (admin). */
export function aggregateAccountReports(): Promise<Array<Record<string, unknown>>> {
  return http.get("/moderation/reports/account/aggregate");
}

/** GET /moderation/competition-bans?competitionId= (admin). */
export function listCompetitionBans(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/moderation/competition-bans", { query });
}

/** POST /moderation/warnings (admin) */
export function createWarning(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/moderation/warnings", input);
}

export type EventType = "live" | "concert" | "duel" | "competition";

/**
 * GET /moderation/events/:type/:id/viewers — users currently connected to this
 * event's room (host only). Source pool for {@link appointModerator}.
 */
export function listCurrentViewers(type: EventType, id: string): Promise<Array<Record<string, unknown>>> {
  return http.get(`/moderation/events/${type}/${id}/viewers`);
}

/** GET /moderation/events/:type/:id/moderators — this event's appointed moderators. */
export function listEventModerators(type: EventType, id: string): Promise<Array<Record<string, unknown>>> {
  return http.get(`/moderation/events/${type}/${id}/moderators`);
}

/**
 * POST /moderation/events/:type/:id/moderators — appoints a viewer as this
 * event's moderator (host only, max 2 per event).
 */
export function appointModerator(type: EventType, id: string, userId: string): Promise<Record<string, unknown>> {
  return http.post(`/moderation/events/${type}/${id}/moderators`, { userId });
}

/** DELETE /moderation/events/:type/:id/moderators/:userId — revokes an appointed moderator (host only). */
export function revokeModerator(type: EventType, id: string, userId: string): Promise<void> {
  return http.delete(`/moderation/events/${type}/${id}/moderators/${userId}`);
}
