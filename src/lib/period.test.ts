import { describe, expect, it } from "vitest";

import { sinceForPeriod } from "./period";

const NOW = new Date("2026-07-13T15:30:00.000Z");

describe("sinceForPeriod", () => {
  it("returns undefined for 'all' (no bound)", () => {
    expect(sinceForPeriod("all", NOW)).toBeUndefined();
  });

  it("returns start-of-day for 'day'", () => {
    // Local midnight of the reference instant, serialized to ISO.
    const expected = (() => {
      const d = new Date(NOW);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    })();
    expect(sinceForPeriod("day", NOW)).toBe(expected);
  });

  it("returns now-7d for 'week'", () => {
    expect(sinceForPeriod("week", NOW)).toBe(new Date("2026-07-06T15:30:00.000Z").toISOString());
  });

  it("returns now-30d for 'month'", () => {
    expect(sinceForPeriod("month", NOW)).toBe(new Date("2026-06-13T15:30:00.000Z").toISOString());
  });

  it("treats an unknown period as no bound", () => {
    expect(sinceForPeriod("bogus", NOW)).toBeUndefined();
  });
});
