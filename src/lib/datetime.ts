/**
 * datetime
 * --------
 * Helpers de formatage de dates localisés (FR par défaut, EN si
 * `localStorage.lang === 'en'`). Centralise les patterns pour garantir un
 * affichage cohérent (`dd/MM/yyyy HH:mm` en FR, `MM/dd/yyyy hh:mm a` en EN).
 *
 * Toujours préférer ces helpers à `Date#toLocaleString` direct.
 */
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

/**
 * Format a date in the user's selected timezone (or GMT/UTC by default).
 * Works as a drop-in replacement for `format(new Date(x), pattern)` calls.
 *
 * Usage:
 *   formatTz(value, "dd/MM/yyyy HH:mm", { timezone: prefs.timezone, language })
 *
 * "GMT" is treated as UTC. Any IANA tz string (e.g. "Europe/Paris") is supported.
 */
export const formatTz = (
  value: string | number | Date | null | undefined,
  pattern: string,
  opts?: { timezone?: string; language?: "fr" | "en" }
): string => {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const tz = opts?.timezone || "GMT";
  const language = opts?.language || "fr";
  const locale = language === "fr" ? fr : enUS;

  try {
    const hasTime = pattern.includes("H") || pattern.includes("h");
    if (tz === "GMT" || tz === "UTC") {
      const utc = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
      return format(utc, pattern, { locale }) + (hasTime ? " GMT" : "");
    }
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
    const shifted = new Date(
      Number(get("year")), Number(get("month")) - 1, Number(get("day")),
      Number(get("hour")) === 24 ? 0 : Number(get("hour")),
      Number(get("minute")), Number(get("second"))
    );
    let tzLabel = "";
    if (hasTime) {
      try {
        const tzParts = new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", {
          timeZone: tz, timeZoneName: "short",
        }).formatToParts(d);
        tzLabel = " " + (tzParts.find((p) => p.type === "timeZoneName")?.value || tz);
      } catch { tzLabel = " " + tz; }
    }
    return format(shifted, pattern, { locale }) + tzLabel;
  } catch {
    return format(d, pattern, { locale });
  }
};

/**
 * Convert a stored UTC ISO instant to the `"yyyy-MM-ddTHH:mm"` string expected by
 * `<input type="datetime-local">`, expressed as a wall-clock in the user's TZ.
 *
 * Inverse of {@link toWireUtc}. "GMT"/"UTC" ⇒ the UTC wall-clock; any IANA tz shifts.
 * Use this to seed every event date input so edit round-trips are lossless.
 */
export const toTzInputValue = (iso: string | null | undefined, timezone?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const tz = timezone || "GMT";
  if (tz === "GMT" || tz === "UTC") {
    return new Date(d.getTime()).toISOString().slice(0, 16);
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
    const h = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${h}:${get("minute")}`;
  } catch {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
};

/**
 * Parse a `"yyyy-MM-ddTHH:mm"` wall-clock (from a datetime-local input or a mobile
 * picker) as a time in the user's TZ and return the canonical **UTC ISO string**.
 *
 * This is THE single normalization every event date must pass through before hitting
 * the API, so web and mobile agree on the instant regardless of the browser/device
 * timezone. "GMT"/"UTC" ⇒ the wall-clock is taken as UTC (default). Returns null on empty.
 */
export const toWireUtc = (localValue: string | null | undefined, timezone?: string): string | null => {
  if (!localValue) return null;
  const s = localValue.length === 16 ? localValue : localValue.slice(0, 16);
  const tz = timezone || "GMT";
  if (tz === "GMT" || tz === "UTC") return new Date(s + "Z").toISOString();
  try {
    const naive = new Date(s + "Z"); // treat the wall-clock as if it were UTC first
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(naive);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || "0");
    const hourTz = get("hour") === 24 ? 0 : get("hour");
    const asTz = Date.UTC(get("year"), get("month") - 1, get("day"), hourTz, get("minute"), get("second"));
    const offset = asTz - naive.getTime(); // tz offset at that wall-clock
    return new Date(naive.getTime() - offset).toISOString();
  } catch {
    return new Date(s).toISOString();
  }
};
