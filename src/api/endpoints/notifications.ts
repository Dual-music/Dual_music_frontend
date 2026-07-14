/**
 * Notifications endpoints — wrappers over `/notifications/*`.
 *
 * @module api/endpoints/notifications
 */

import { http, request } from "../http";

/** GET /notifications — the caller's notifications (paginated). */
export function listNotifications(query?: Record<string, string | number | undefined>): Promise<Array<Record<string, unknown>>> {
  return http.get("/notifications", { query });
}

/** GET /notifications/unread-count */
export function unreadCount(): Promise<{ count: number }> {
  return http.get("/notifications/unread-count");
}

/** GET /notifications/preferences */
export function getPreferences(): Promise<Record<string, unknown>> {
  return http.get("/notifications/preferences");
}

/** PUT /notifications/preferences/email */
export function setEmailPreferences(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.put("/notifications/preferences/email", input);
}

/** POST /notifications/push/subscribe */
export function subscribePush(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return http.post("/notifications/push/subscribe", input);
}

/** DELETE /notifications/push/subscribe */
export function unsubscribePush(input?: Record<string, unknown>): Promise<void> {
  return request<void>("/notifications/push/subscribe", { method: "DELETE", body: input });
}

/** POST /notifications/read-all */
export function markAllRead(): Promise<Record<string, unknown>> {
  return http.post("/notifications/read-all");
}

/** POST /notifications/:id/read */
export function markRead(id: string): Promise<Record<string, unknown>> {
  return http.post(`/notifications/${id}/read`);
}

/** DELETE /notifications/:id */
export function remove(id: string): Promise<void> {
  return http.delete(`/notifications/${id}`);
}
