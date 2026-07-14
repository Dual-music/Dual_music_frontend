/**
 * Admin endpoints — wrappers over `/admin/*`.
 *
 * Stats, logs, role assignment, analytics (revenue / credit-purchases /
 * top-earners / distribution compare), announcements, and settings CRUD.
 *
 * @module api/endpoints/admin
 */

import { http, request } from "../http";

/** GET /admin/stats */
export function getStats(): Promise<Record<string, unknown>> {
  return http.get("/admin/stats");
}

/** GET /admin/logs */
export function getLogs(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/admin/logs", { query });
}

export interface AdminDashboard {
  profiles: Array<Record<string, unknown>>;
  artistConcerts: Array<Record<string, unknown>>;
  duels: Array<Record<string, unknown>>;
  artistLives: Array<Record<string, unknown>>;
  replayVideos: Array<Record<string, unknown>>;
  artistRequests: Array<Record<string, unknown>>;
  managerRequests: Array<Record<string, unknown>>;
  duelRequests: Array<Record<string, unknown>>;
  withdrawalRequests: Array<Record<string, unknown>>;
  managerProfiles: Array<Record<string, unknown>>;
  artistProfiles: Array<Record<string, unknown>>;
}

/** GET /admin/dashboard — consolidated dashboard data set (11 lists). */
export function getDashboard(): Promise<AdminDashboard> {
  return http.get<AdminDashboard>("/admin/dashboard");
}

/** GET /admin/roles/:userId */
export function getRoles(userId: string): Promise<Array<Record<string, unknown>>> {
  return http.get(`/admin/roles/${userId}`);
}

/** POST /admin/roles — grant a role. */
export function grantRole(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/admin/roles", input);
}

/** DELETE /admin/roles — revoke a role (body: { userId, role }). */
export function revokeRole(input: Record<string, unknown>): Promise<void> {
  return request<void>("/admin/roles", { method: "DELETE", body: input });
}

/** GET /admin/analytics/revenue?period= */
export function revenueStats(query?: Record<string, string | number | undefined>): Promise<Record<string, unknown>> {
  return http.get("/admin/analytics/revenue", { query });
}

/** GET /admin/analytics/credit-purchases */
export function creditPurchaseStats(query?: Record<string, string | number | undefined>): Promise<Record<string, unknown>> {
  return http.get("/admin/analytics/credit-purchases", { query });
}

/** GET /admin/analytics/top-earners?period=&limit= */
export function topEarners(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/admin/analytics/top-earners", { query });
}

/** GET /admin/analytics/distribution/:id/compare */
export function compareDistribution(id: string): Promise<Record<string, unknown>> {
  return http.get(`/admin/analytics/distribution/${id}/compare`);
}

export interface PlatformAnalytics {
  registrationsPerDay: Array<{ date: string; count: number }>;
  duelsPerWeek: Array<{ week: string; count: number }>;
  roleDistribution: Array<{ role: string; count: number }>;
  topArtistsByVotes: Array<{ artist_id: string; total: number; full_name: string | null; avatar_url: string | null }>;
}

/** GET /admin/analytics — platform-wide dashboard analytics. */
export function analytics(): Promise<PlatformAnalytics> {
  return http.get<PlatformAnalytics>("/admin/analytics");
}

export interface ReferralsAggregate {
  total: number;
  completed: number;
  totalCredits: number;
}

/** GET /admin/referrals — referral-programme aggregate stat cards. */
export function referrals(): Promise<ReferralsAggregate> {
  return http.get<ReferralsAggregate>("/admin/referrals");
}

export interface AdminLedger {
  purchases: Array<Record<string, unknown>>;
  distributions: Array<Record<string, unknown>>;
}

/** GET /admin/ledger?limit= — platform-wide financial ledger (two lists). */
export function ledger(query?: { limit?: number }): Promise<AdminLedger> {
  return http.get<AdminLedger>("/admin/ledger", { query });
}

/** GET /admin/revenue-distributions?sourceType= — recent distributions. */
export function revenueDistributions(query?: { sourceType?: string; limit?: number }): Promise<Array<Record<string, unknown>>> {
  return http.get("/admin/revenue-distributions", { query });
}

/** POST /admin/logs — write an admin audit-log row (best-effort). */
export function writeLog(input: {
  actionType: string;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<{ logged: boolean }> {
  return http.post<{ logged: boolean }>("/admin/logs", input);
}

/** GET /admin/users/search?q= — search profiles by name/email (admin). */
export function searchUsers(q: string): Promise<Array<Record<string, unknown>>> {
  return http.get("/admin/users/search", { query: { q } });
}

/** GET /admin/users?limit= — profile picker list (admin). */
export function listUsers(query?: { limit?: number }): Promise<Array<Record<string, unknown>>> {
  return http.get("/admin/users", { query });
}

/** POST /admin/roles/batch — resolve roles for many users at once. */
export function rolesBatch(userIds: string[]): Promise<Array<{ user_id: string; role: string }>> {
  return http.post("/admin/roles/batch", { userIds });
}

/** POST /admin/profiles/batch — batch profiles WITH email + ban state (admin). */
export function profilesBatch(
  userIds: string[],
): Promise<Array<{ id: string; full_name: string | null; email: string | null; avatar_url: string | null; is_banned: boolean }>> {
  return http.post("/admin/profiles/batch", { userIds });
}

/** GET /admin/dedications?limit= — platform-wide dedications (admin). */
export function listDedications(query?: { limit?: number }): Promise<Array<Record<string, unknown>>> {
  return http.get("/admin/dedications", { query });
}

/** DELETE /admin/users/:id */
export function deleteUser(id: string): Promise<Record<string, unknown>> {
  return http.delete(`/admin/users/${id}`);
}

/** DELETE /admin/duels/:id */
export function deleteDuel(id: string): Promise<Record<string, unknown>> {
  return http.delete(`/admin/duels/${id}`);
}

/** DELETE /admin/lives/:id */
export function deleteLive(id: string): Promise<Record<string, unknown>> {
  return http.delete(`/admin/lives/${id}`);
}

/** POST /admin/duel-requests/:id/approve — approve + create the duel + notify. */
export function approveDuelRequest(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/admin/duel-requests/${id}/approve`, input);
}

/** POST /admin/duel-requests/:id/reject */
export function rejectDuelRequest(id: string): Promise<Record<string, unknown>> {
  return http.post(`/admin/duel-requests/${id}/reject`);
}

/** POST /admin/announcements — broadcast an announcement to all users. */
export function broadcastAnnouncement(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/admin/announcements", input);
}

/** GET /admin/settings — all settings (admin) as a `{ key: value }` map. */
export function getSettings(): Promise<Record<string, unknown>> {
  return http.get("/admin/settings");
}

/** GET /admin/settings/:key */
export function getSetting(key: string): Promise<{ key: string; value: unknown }> {
  return http.get(`/admin/settings/${key}`);
}

/** PUT /admin/settings/:key */
export function upsertSetting(key: string, value: unknown): Promise<unknown> {
  return http.put(`/admin/settings/${key}`, { value });
}
