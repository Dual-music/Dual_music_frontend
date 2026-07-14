/**
 * Period helpers shared by revenue/earnings views.
 *
 * Maps a coarse period selector to an ISO "since" bound the API filters on
 * server-side. Kept pure (takes `now`) so it is deterministic and unit-testable.
 */
export type RevenuePeriod = "day" | "week" | "month" | "all";

/**
 * Returns the inclusive lower-bound ISO timestamp for a period, or `undefined`
 * for "all" (no bound).
 * @param period - one of day | week | month | all
 * @param now - reference instant (defaults to the current time)
 */
export function sinceForPeriod(period: RevenuePeriod | string, now: Date = new Date()): string | undefined {
  if (period === "day") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "week") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (period === "month") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return undefined; // "all" or unknown → no bound
}
