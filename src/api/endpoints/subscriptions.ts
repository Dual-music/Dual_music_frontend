/**
 * Subscriptions endpoints — wrappers over `/subscriptions/*`.
 *
 * @module api/endpoints/subscriptions
 */

import { http } from "../http";

/** GET /subscriptions/plans — public plan catalog. */
export function listPlans(): Promise<Array<Record<string, unknown>>> {
  return http.get("/subscriptions/plans", { anonymous: true });
}

/** POST /subscriptions/plans (admin) */
export function createPlan(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/subscriptions/plans", input);
}

/** PATCH /subscriptions/plans/:id (admin) */
export function updatePlan(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.patch(`/subscriptions/plans/${id}`, patch);
}

/** DELETE /subscriptions/plans/:id (admin) */
export function removePlan(id: string): Promise<void> {
  return http.delete(`/subscriptions/plans/${id}`);
}

/** GET /subscriptions/me — the caller's active subscription. */
export function mySubscription(): Promise<Record<string, unknown> | null> {
  return http.get("/subscriptions/me");
}

/** POST /subscriptions/checkout — start a subscription checkout (atomic). */
export function checkout(input: Record<string, unknown>, idempotencyKey?: string): Promise<Record<string, unknown>> {
  return http.post("/subscriptions/checkout", input, idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {});
}

/** POST /subscriptions/activate — direct activate a plan (free/manual path). */
export function activate(plan: string): Promise<Record<string, unknown>> {
  return http.post("/subscriptions/activate", { plan });
}

/** POST /subscriptions/cancel */
export function cancel(input?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/subscriptions/cancel", input ?? {});
}
