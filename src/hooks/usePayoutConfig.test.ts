import { describe, expect, it } from "vitest";

import { DEFAULT_PAYOUT_CONFIG } from "./usePayoutConfig";

/**
 * Regression guard: the payout method codes MUST match the backend enum
 * (withdrawal.validation → mobile_money | bank | paypal). The legacy
 * `bank_transfer` code was rejected by the API (400), so it must never return.
 */
describe("DEFAULT_PAYOUT_CONFIG", () => {
  it("uses the backend 'bank' code, not the legacy 'bank_transfer'", () => {
    expect(DEFAULT_PAYOUT_CONFIG.methods).toContain("bank");
    expect(DEFAULT_PAYOUT_CONFIG.methods).not.toContain("bank_transfer" as never);
  });

  it("offers the three supported payout methods", () => {
    expect([...DEFAULT_PAYOUT_CONFIG.methods].sort()).toEqual(["bank", "mobile_money", "paypal"]);
  });
});
