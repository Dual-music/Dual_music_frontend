/**
 * Maps RPC error codes returned by purchase / gift functions to
 * user-facing translation keys. Centralised so every screen shows
 * consistent feedback.
 */
export type PurchaseErrorCode =
  | "insufficient_balance"
  | "already_purchased"
  | "sold_out"
  | "no_inventory"
  | "gift_not_found"
  | "concert_not_found"
  | "duel_not_found"
  | "replay_not_found";

export const purchaseErrorKey = (code?: string | null): string => {
  switch (code) {
    case "insufficient_balance":
      return "purchaseErrInsufficient";
    case "already_purchased":
      return "purchaseErrAlready";
    case "sold_out":
      return "purchaseErrSoldOut";
    case "no_inventory":
      return "purchaseErrNoInventory";
    case "gift_not_found":
      return "purchaseErrGiftMissing";
    case "concert_not_found":
    case "duel_not_found":
    case "replay_not_found":
      return "purchaseErrTargetMissing";
    default:
      return "purchaseErrGeneric";
  }
};

export const purchaseErrorTitleKey = (code?: string | null): string => {
  switch (code) {
    case "insufficient_balance":
      return "purchaseErrInsufficientTitle";
    case "already_purchased":
      return "purchaseErrAlreadyTitle";
    case "sold_out":
      return "purchaseErrSoldOutTitle";
    case "no_inventory":
      return "purchaseErrNoInventoryTitle";
    default:
      return "errorTitle";
  }
};
