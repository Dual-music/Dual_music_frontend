/**
 * Wallet endpoints — wrappers over `/wallet/*`.
 *
 * Mirrors `wallet.routes.js`. Balance is in integer credits. All financial
 * mutations (vote, gift purchase/send, tickets, replay unlock) accept an
 * optional `Idempotency-Key` and settle via atomic stored procedures on the
 * backend.
 *
 * @module api/endpoints/wallet
 */

import { http } from "../http";

export interface WalletBalance {
  balance: number;
  eurValue: number;
}

/** GET /wallet — current credit balance for the authenticated user. */
export function getBalance(): Promise<WalletBalance> {
  return http.get<WalletBalance>("/wallet");
}

/** GET /wallet/revenues — earnings grouped by source event, optionally since an ISO date. */
export function getRevenues(since?: string): Promise<Array<Record<string, unknown>>> {
  return http.get("/wallet/revenues", { query: since ? { since } : undefined });
}

/** GET /wallet/spending — the caller's outgoing payments (gifts/votes/tickets). */
export function getSpending(
  query?: { limit?: number; offset?: number },
): Promise<Array<Record<string, unknown>>> {
  return http.get("/wallet/spending", { query });
}

/** GET /wallet/revenues/breakdown?sourceId= — optionally scoped to one source event. */
export function getRevenueBreakdown(sourceId?: string): Promise<Record<string, unknown>> {
  return http.get("/wallet/revenues/breakdown", { query: sourceId ? { sourceId } : undefined });
}

export interface EventTransactionsQuery {
  sourceId?: string;
  limit?: number;
  offset?: number;
}

/** GET /wallet/transactions — paginated revenue rows for one source event. */
export function getEventTransactions(
  query: EventTransactionsQuery,
): Promise<{ data: Array<Record<string, unknown>>; total: number }> {
  return http.requestWithMeta<Array<Record<string, unknown>>>("/wallet/transactions", {
    method: "GET",
    query,
  }).then(({ data, meta }) => ({ data, total: Number(meta.total ?? data.length) }));
}

/** Idempotency-Key header helper for financial POSTs. */
function idem(key?: string): { headers?: Record<string, string> } {
  return key ? { headers: { "Idempotency-Key": key } } : {};
}

/** POST /wallet/vote — paid vote for an artist in a duel. */
export function vote(
  input: { duelId: string; artistId: string; amount: number },
  idempotencyKey?: string,
): Promise<{ success: boolean }> {
  return http.post("/wallet/vote", input, idem(idempotencyKey));
}

/** POST /wallet/gifts/purchase */
export function purchaseGift(
  input: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  return http.post("/wallet/gifts/purchase", input, idem(idempotencyKey));
}

/** POST /wallet/gifts/send */
export function sendGift(
  input: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  return http.post("/wallet/gifts/send", input, idem(idempotencyKey));
}

/** POST /wallet/tickets/duel */
export function buyDuelTicket(
  input: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  return http.post("/wallet/tickets/duel", input, idem(idempotencyKey));
}

/** POST /wallet/tickets/concert */
export function buyConcertTicket(
  input: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  return http.post("/wallet/tickets/concert", input, idem(idempotencyKey));
}

/** POST /wallet/replays/unlock */
export function unlockReplay(
  input: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  return http.post("/wallet/replays/unlock", input, idem(idempotencyKey));
}
