/**
 * Payments endpoints — wrappers over `/payments/*`.
 *
 * Replaces the former Supabase edge functions:
 *  - `cinetpay-payin-init`  → {@link cinetpayInit}
 *  - `moneroo-payin-init`   → {@link monerooInit}
 *  - `create-checkout`      → {@link stripeCredits} / {@link stripeSubscription}
 *  - `cinetpay-verify-tx`   → {@link cinetpayVerify} (admin)
 *
 * `cinetpay-balances` / `cinetpay-proxy-check` are NOT covered (require the
 * CinetPay transfer API + live credentials — deferred).
 *
 * @module api/endpoints/payments
 */

import { http } from "../http";

const idem = (key?: string) =>
  key ? { headers: { "Idempotency-Key": key } } : {};

/** POST /payments/cinetpay/init → hosted payment URL. */
export function cinetpayInit(
  input: { amount: number; countryCode: string; phone?: string },
  idempotencyKey?: string,
): Promise<{ paymentUrl: string; merchantTransactionId: string; credits: number }> {
  return http.post("/payments/cinetpay/init", input, idem(idempotencyKey));
}

/** POST /payments/moneroo/init → checkout URL. */
export function monerooInit(
  input: { amount: number; currency: string; phone?: string; email?: string },
  idempotencyKey?: string,
): Promise<{ checkoutUrl: string; merchantTransactionId: string; credits: number }> {
  return http.post("/payments/moneroo/init", input, idem(idempotencyKey));
}

/** POST /payments/stripe/credits → Stripe Checkout URL. */
export function stripeCredits(
  input: { amount: number; currency: string },
  idempotencyKey?: string,
): Promise<{ url: string }> {
  return http.post("/payments/stripe/credits", input, idem(idempotencyKey));
}

/** POST /payments/stripe/subscription → Stripe Checkout URL. */
export function stripeSubscription(
  input: { plan: "pro" | "premium" },
  idempotencyKey?: string,
): Promise<{ url: string }> {
  return http.post("/payments/stripe/subscription", input, idem(idempotencyKey));
}

export interface CinetpayCountry {
  country_code: string;
  country_name: string;
  currency: string;
  phone_prefix: string;
  operators: Array<{ code: string; label: string }>;
}

/** GET /payments/cinetpay/countries — public active-country catalog. */
export function cinetpayCountries(): Promise<CinetpayCountry[]> {
  return http.get<CinetpayCountry[]>("/payments/cinetpay/countries", { anonymous: true });
}

/** GET /payments/history — the caller's recharge (credit-purchase) history. */
export function history(
  query?: { limit?: number },
): Promise<Array<Record<string, unknown>>> {
  return http.get("/payments/history", { query });
}

export interface MerchantTransaction {
  provider: "cinetpay" | "moneroo";
  amount: number;
  currency: string;
  credits: number;
  status: string;
  created_at: string;
}

/**
 * GET /payments/transaction?merchantId= — the caller's own recharge transaction
 * (CinetPay or Moneroo), for building the post-payment receipt. Ownership-scoped
 * server-side; 404 when the id is unknown or belongs to another user.
 */
export function transactionByMerchant(merchantId: string): Promise<MerchantTransaction> {
  return http.get<MerchantTransaction>("/payments/transaction", { query: { merchantId } });
}

/** GET /payments/cinetpay/transactions (admin) — CinetPay payin ledger. */
export function cinetpayTransactions(
  query?: { limit?: number },
): Promise<Array<Record<string, unknown>>> {
  return http.get("/payments/cinetpay/transactions", { query });
}

/** GET /payments/cinetpay/verify?merchantId= (admin diagnostic). */
export function cinetpayVerify(
  merchantId: string,
): Promise<{ merchantTransactionId: string; accepted: boolean; status: string }> {
  return http.get("/payments/cinetpay/verify", { query: { merchantId } });
}
