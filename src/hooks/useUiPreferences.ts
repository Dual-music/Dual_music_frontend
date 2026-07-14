/**
 * Hook préférences UI : timezone, langue, balance visibility, etc. Persistance localStorage + DB.
 * Utilisé partout pour formatage.
 */
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import * as users from "@/api/endpoints/users";

export type TopDonorMode = "full" | "reduced" | "off";
export type TopDonorAnimation = "default" | "traversing";

export interface UiPreferences {
  top_donor_mode: TopDonorMode;
  top_donor_animation: TopDonorAnimation;
  reduce_animations: boolean;
  timezone: string; // IANA tz, "GMT" for UTC
}

const DEFAULTS: UiPreferences = {
  top_donor_mode: "full",
  top_donor_animation: "traversing",
  reduce_animations: false,
  timezone: "GMT",
};

const LS_KEY = "ui_prefs_v2";

const readLocal = (): UiPreferences => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    // Migrate legacy v1
    const legacy = localStorage.getItem("ui_prefs_v1");
    if (legacy) return { ...DEFAULTS, ...JSON.parse(legacy) };
  } catch {}
  return DEFAULTS;
};

// ---- Global in-memory store with subscribers (sync across components & tabs) ----
let _state: UiPreferences = readLocal();
const _subs = new Set<() => void>();

const _subscribe = (cb: () => void) => {
  _subs.add(cb);
  return () => _subs.delete(cb);
};
const _getSnapshot = () => _state;
export const getUiPrefs = (): UiPreferences => _state;
const _emit = () => _subs.forEach((cb) => cb());

const _setState = (next: UiPreferences, persist = true) => {
  _state = next;
  if (persist) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  }
  _emit();
};

// Cross-tab sync via storage event
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY && e.newValue) {
      try {
        const parsed = { ...DEFAULTS, ...JSON.parse(e.newValue) };
        _setState(parsed, false);
      } catch {}
    }
  });
}

let _hydratedFromServer = false;
const hydrateFromServer = async () => {
  if (_hydratedFromServer) return;
  _hydratedFromServer = true;
  let data: any = null;
  try {
    data = await users.getUiPreferences();
  } catch {
    return;
  }
  if (data) {
    _setState({
      top_donor_mode: (data.top_donor_mode as TopDonorMode) || DEFAULTS.top_donor_mode,
      top_donor_animation: (data.top_donor_animation as TopDonorAnimation) || DEFAULTS.top_donor_animation,
      reduce_animations: !!data.reduce_animations,
      timezone: (data.timezone as string) || DEFAULTS.timezone,
    });
  }
};

export const useUiPreferences = () => {
  const prefs = useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
  const [loading, setLoading] = useState(!_hydratedFromServer);

  useEffect(() => {
    let cancel = false;
    hydrateFromServer().finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  const update = useCallback(async (patch: Partial<UiPreferences>) => {
    const next = { ..._state, ...patch };
    _setState(next);
    try {
      await users.setUiPreferences({
        topDonorMode: next.top_donor_mode,
        topDonorAnimation: next.top_donor_animation,
        reduceAnimations: next.reduce_animations,
        timezone: next.timezone,
      });
    } catch {
      /* best-effort; local state already updated */
    }
  }, []);

  return { prefs, update, loading };
};
