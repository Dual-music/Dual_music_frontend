/**
 * Users & profiles endpoints — wrappers over `/users/*`.
 *
 * Mirrors `user.routes.js`. {@link getDisplayProfiles} is the drop-in replacement
 * for the former `get_display_profiles` RPC and returns the identical row shape
 * `{ id, full_name, avatar_url }`, so call sites only change the transport.
 *
 * @module api/endpoints/users
 */

import { http } from "../http";

export interface DisplayProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

/**
 * Batch-resolves public display profiles by user id.
 * Drop-in for `supabase.rpc("get_display_profiles", { user_ids })`.
 */
export function getDisplayProfiles(userIds: string[]): Promise<DisplayProfile[]> {
  const ids = [...new Set((userIds ?? []).filter(Boolean))];
  if (ids.length === 0) return Promise.resolve([]);
  return http.post<DisplayProfile[]>("/users/display-profiles", { userIds: ids });
}

/** Convenience: resolves display profiles into an id→profile Map. */
export async function getDisplayProfileMap(
  userIds: string[],
): Promise<Map<string, DisplayProfile>> {
  const rows = await getDisplayProfiles(userIds);
  return new Map(rows.map((r) => [r.id, r]));
}

export interface PublicProfile {
  profile: Record<string, unknown> & { id: string };
  artistProfile: Record<string, unknown> | null;
  followerCount: number;
  isFollowing: boolean;
}

/** GET /users/:id — public profile with follower count + follow state. */
export function getPublicProfile(userId: string): Promise<PublicProfile> {
  return http.get<PublicProfile>(`/users/${userId}`);
}

/** GET /users/:id/badges — a user's active badges (public). */
export function getBadges(userId: string): Promise<Array<Record<string, unknown>>> {
  return http.get(`/users/${userId}/badges`);
}

/** GET /users/me/ui-preferences */
export function getUiPreferences(): Promise<Record<string, unknown> | null> {
  return http.get("/users/me/ui-preferences");
}

/** PUT /users/me/ui-preferences */
export function setUiPreferences(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.put("/users/me/ui-preferences", patch);
}

/** PATCH /users/me — updates the caller's own profile. */
export function updateMe(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch("/users/me", patch);
}

/** POST /users/me/deletion — programme la suppression du compte (grâce 20 jours). */
export function requestAccountDeletion(): Promise<{ deletionScheduledAt: string }> {
  return http.post("/users/me/deletion");
}

/** DELETE /users/me/deletion — annule une suppression programmée. */
export function cancelAccountDeletion(): Promise<{ cancelled: boolean }> {
  return http.delete("/users/me/deletion");
}

/** GET /users/me/following — artists the caller follows. */
export function myFollowing(): Promise<Array<Record<string, unknown>>> {
  return http.get("/users/me/following");
}

/** GET /users/me/preferences */
export function getPreferences(): Promise<Record<string, unknown>> {
  return http.get("/users/me/preferences");
}

export interface MyStats {
  artistStats: { totalVotes: number; totalGifts: number; totalDuels: number; wonDuels: number };
  managerStats: { totalDuelsManaged: number; activeDuels: number; totalGiftsReceived: number };
  fanStats: { totalVotesCast: number; totalGiftsSent: number; totalTickets: number };
  myDuels: Array<Record<string, unknown>>;
  managedDuels: Array<Record<string, unknown>>;
}

/** GET /users/me/stats — profile-page stats (artist/manager/fan) + duels. */
export function myStats(): Promise<MyStats> {
  return http.get<MyStats>("/users/me/stats");
}

/** PUT /users/me/preferences/currency */
export function setCurrency(currency: string): Promise<Record<string, unknown>> {
  return http.put("/users/me/preferences/currency", { currency });
}

/** POST /users/:id/follow */
export function follow(userId: string): Promise<{ following: boolean }> {
  return http.post(`/users/${userId}/follow`);
}

/** DELETE /users/:id/follow */
export function unfollow(userId: string): Promise<{ following: boolean }> {
  return http.delete(`/users/${userId}/follow`);
}
