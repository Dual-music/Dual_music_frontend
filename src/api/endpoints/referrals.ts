/**
 * Referrals endpoints — wrappers over `/referrals/*`.
 *
 * @module api/endpoints/referrals
 */

import { http } from "../http";

/** GET /referrals/config — public reward config (for the signup form). */
export function getConfig(): Promise<Record<string, unknown>> {
  return http.get("/referrals/config", { anonymous: true });
}

/** GET /referrals/me — the caller's referrals + rewards. */
export function myReferrals(): Promise<Record<string, unknown>> {
  return http.get("/referrals/me");
}

/** POST /referrals/:id/claim — claim a referral reward. */
export function claim(id: string): Promise<Record<string, unknown>> {
  return http.post(`/referrals/${id}/claim`);
}
