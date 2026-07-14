/**
 * Moneroo official method catalog — Deno mirror of `src/lib/moneroo-config.ts`.
 *
 * Centralizes the supported PayIn / PayOut method codes, the field name
 * expected by each method (`msisdn` vs `account_number`), and the canonical
 * currency per method (defaults to XOF). Sandbox vs production is toggled
 * via the `MONEROO_SANDBOX` env var (defaults to "true").
 *
 * @env      MONEROO_SANDBOX ("true"|"false")
 * @see      src/lib/moneroo-config.ts, supabase/functions/moneroo-payin-init
 */

export const MONEROO_SANDBOX =
  (Deno.env.get("MONEROO_SANDBOX") ?? "true").toLowerCase() !== "false";

export const getPayoutFieldName = (methodCode: string): "msisdn" | "account_number" =>
  methodCode === "moneroo_payout_demo" ? "account_number" : "msisdn";

// Map a Moneroo method code to its required currency.
// Only the most common methods are listed; defaults to XOF.
const METHOD_CURRENCY: Record<string, string> = {
  // demo
  moneroo_payment_demo: "USD", moneroo_payout_demo: "USD",
  // XOF
  orange_ci:"XOF", mtn_ci:"XOF", moov_ci:"XOF", wave_ci:"XOF", djamo_ci:"XOF",
  orange_sn:"XOF", wave_sn:"XOF", freemoney_sn:"XOF", e_money_sn:"XOF", wizall_sn:"XOF", djamo_sn:"XOF",
  orange_bf:"XOF", moov_bf:"XOF", orange_ml:"XOF", moov_ml:"XOF", mobi_cash_ml:"XOF",
  mtn_bj:"XOF", moov_bj:"XOF", togocel:"XOF", moov_tg:"XOF", airtel_ne:"XOF",
  card_xof:"XOF", crypto_xof:"XOF",
  // XAF
  mtn_cm:"XAF", orange_cm:"XAF", eu_mobile_cm:"XAF", card_xaf:"XAF", crypto_xaf:"XAF",
  // CDF
  orange_cd:"CDF", airtel_cd:"CDF", vodacom_cd:"CDF",
  // NGN
  mtn_ng:"NGN", airtel_ng:"NGN", bank_transfer_ng:"NGN", barter:"NGN", card_ngn:"NGN", crypto_ngn:"NGN", qr_ngn:"NGN", ussd_ngn:"NGN",
  // GHS
  mtn_gh:"GHS", vodafone_gh:"GHS", tigo_gh:"GHS", card_ghs:"GHS", crypto_ghs:"GHS",
  // GNF
  mtn_gn:"GNF", orange_gn:"GNF",
  // KES, TZS, UGX, RWF, MWK, ZMW, ZAR
  mpesa_ke:"KES", card_kes:"KES",
  mpesa_tz:"TZS", airtel_tz:"TZS", tigo_tz:"TZS", halopesa_tz:"TZS", card_tzs:"TZS",
  mtn_ug:"UGX", airtel_ug:"UGX", card_ugx:"UGX",
  mtn_rw:"RWF", airtel_rw:"RWF",
  tnm_mw:"MWK", airtel_mw:"MWK",
  mtn_zm:"ZMW", airtel_zm:"ZMW", zamtel_zm:"ZMW",
  card_zar:"ZAR",
  // International
  card_usd:"USD", crypto_usd:"USD", crypto_eur:"EUR",
};

export const getCurrencyForMethod = (methodCode: string, fallback = "XOF") =>
  METHOD_CURRENCY[methodCode] ?? fallback;
