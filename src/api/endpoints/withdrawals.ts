/**
 * Withdrawals endpoints — wrappers over `/withdrawals/*`.
 *
 * Includes the withdrawal-PIN lifecycle (bcrypt-hashed on the backend), saved
 * payout methods, net-amount calculation, and the request/approve/complete flow.
 * Replaces the `process-withdrawal` and `withdrawal-pin-reset` edge functions.
 *
 * @module api/endpoints/withdrawals
 */

import { http } from "../http";

// --- PIN ---------------------------------------------------------------------

/** GET /withdrawals/pin — whether the caller has a withdrawal PIN set. */
export function hasPin(): Promise<{ hasPin: boolean }> {
  return http.get("/withdrawals/pin");
}

/** POST /withdrawals/pin — set/replace the withdrawal PIN. */
export function setPin(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/withdrawals/pin", input);
}

/** POST /withdrawals/pin/verify */
export function verifyPin(input: Record<string, unknown>): Promise<{ valid: boolean }> {
  return http.post("/withdrawals/pin/verify", input);
}

/** POST /withdrawals/pin/reset/request */
export function requestPinReset(): Promise<Record<string, unknown>> {
  return http.post("/withdrawals/pin/reset/request");
}

/** POST /withdrawals/pin/reset/confirm */
export function confirmPinReset(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/withdrawals/pin/reset/confirm", input);
}

/** POST /withdrawals/net — compute net amount after fees for a gross request. */
export function calcNet(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/withdrawals/net", input);
}

// --- Payout methods ----------------------------------------------------------

/** GET /withdrawals/methods */
export function listMethods(): Promise<Array<Record<string, unknown>>> {
  return http.get("/withdrawals/methods");
}

/** POST /withdrawals/methods */
export function addMethod(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/withdrawals/methods", input);
}

/** PATCH /withdrawals/methods/:id */
export function updateMethod(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/withdrawals/methods/${id}`, patch);
}

/** DELETE /withdrawals/methods/:id */
export function removeMethod(id: string): Promise<void> {
  return http.delete(`/withdrawals/methods/${id}`);
}

// --- Requests ----------------------------------------------------------------

/** GET /withdrawals/me — the caller's withdrawal requests. */
export function myRequests(): Promise<Array<Record<string, unknown>>> {
  return http.get("/withdrawals/me");
}

/** GET /withdrawals — all requests (admin). */
export function listRequests(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/withdrawals", { query });
}

/** POST /withdrawals — create a withdrawal request. */
export function createRequest(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/withdrawals", input);
}

/** POST /withdrawals/:id/approve (admin) */
export function approve(id: string, input?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/withdrawals/${id}/approve`, input ?? {});
}

/** POST /withdrawals/:id/reject (admin) */
export function reject(id: string, input?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/withdrawals/${id}/reject`, input ?? {});
}

/** POST /withdrawals/:id/complete (admin) — mark paid out. */
export function complete(id: string, input?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post(`/withdrawals/${id}/complete`, input ?? {});
}
