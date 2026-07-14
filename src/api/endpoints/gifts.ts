/**
 * Gifts endpoints — wrappers over `/gifts/*`.
 *
 * Catalog + inventory + top-donor reads. Gift *purchase* and *send* are wallet
 * operations — see `endpoints/wallet.ts` (`purchaseGift`, `sendGift`).
 *
 * @module api/endpoints/gifts
 */

import { http } from "../http";

export interface VirtualGift {
  id: string;
  name: string;
  price_credits: number;
  image_url?: string | null;
  animation_url?: string | null;
  is_active?: boolean;
  [key: string]: unknown;
}

/** GET /gifts — active virtual-gift catalog. */
export function listGifts(): Promise<VirtualGift[]> {
  return http.get<VirtualGift[]>("/gifts");
}

/** GET /gifts/inventory — the caller's owned/received gifts. */
export function myInventory(): Promise<Array<Record<string, unknown>>> {
  return http.get("/gifts/inventory");
}

/** GET /gifts/top-donor?... — top donor for a given scope. */
export function topDonor(
  query?: Record<string, string | number | undefined>,
): Promise<Record<string, unknown> | null> {
  return http.get("/gifts/top-donor", { query });
}

/** POST /gifts (admin) — create a virtual gift. */
export function createGift(input: { name: string; price: number; image_url?: string | null }): Promise<VirtualGift> {
  return http.post<VirtualGift>("/gifts", input);
}

/** PATCH /gifts/:id (admin) — update a virtual gift. */
export function updateGift(id: string, patch: { name?: string; price?: number; image_url?: string | null }): Promise<VirtualGift> {
  return http.patch<VirtualGift>(`/gifts/${id}`, patch);
}

/** DELETE /gifts/:id (admin) — delete a virtual gift. */
export function deleteGift(id: string): Promise<{ success: boolean }> {
  return http.delete(`/gifts/${id}`);
}
