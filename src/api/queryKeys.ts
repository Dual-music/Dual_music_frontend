/**
 * Central TanStack Query key factory.
 *
 * Keeping keys in one place makes cross-domain cache invalidation explicit:
 * a gift purchase invalidates `queryKeys.wallet.balance`, a follow invalidates
 * `queryKeys.users.profile(id)`, etc.
 *
 * @module api/queryKeys
 */

export const queryKeys = {
  wallet: {
    all: ["wallet"] as const,
    balance: ["wallet", "balance"] as const,
    revenues: ["wallet", "revenues"] as const,
    transactions: (sourceId?: string) => ["wallet", "transactions", sourceId] as const,
  },
  users: {
    profile: (id: string) => ["users", "profile", id] as const,
    following: ["users", "me", "following"] as const,
    preferences: ["users", "me", "preferences"] as const,
  },
  auth: {
    me: ["auth", "me"] as const,
  },
} as const;

export default queryKeys;
