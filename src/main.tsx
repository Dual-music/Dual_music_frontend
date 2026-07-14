import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

const clearAllCaches = async () => {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
};

const unregisterAllSW = async () => {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((r) => r.unregister()));
};

const isEmbeddedPreview = window.self !== window.top;
const isPreviewToken = new URLSearchParams(window.location.search).has("__lovable_token");
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("preview--") ||
  window.location.hostname.endsWith(".lovableproject.com");
const isPreviewRuntime = isEmbeddedPreview || isPreviewHost || isPreviewToken;

const forcePreviewReloadIfStale = () => {
  const url = new URL(window.location.href);
  const hasBust = url.searchParams.has("__preview_bust");

  // Ensure at least one cache-busting navigation in preview runtime.
  if (!hasBust) {
    url.searchParams.set("__preview_bust", Date.now().toString());
    window.location.replace(url.toString());
    return true;
  }

  return false;
};

const setupPreviewAutoRefresh = () => {
  const refreshMs = 20_000;

  const getCurrentEntryPath = () => new URL(import.meta.url).pathname;

  const extractEntryPathFromHtml = (html: string) => {
    const scriptMatch = html.match(/<script[^>]+type=\"module\"[^>]+src=\"([^\"]+)\"/i);
    if (!scriptMatch?.[1]) return null;
    return new URL(scriptMatch[1], window.location.origin).pathname;
  };

  const reloadWithFreshBust = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("__preview_bust", Date.now().toString());
    window.location.replace(url.toString());
  };

  const checkIfPreviewIsOutdated = async () => {
    try {
      const response = await fetch(window.location.pathname, { cache: "no-store" });
      if (!response.ok) return;

      const html = await response.text();
      const latestEntryPath = extractEntryPathFromHtml(html);
      const currentEntryPath = getCurrentEntryPath();

      if (latestEntryPath && latestEntryPath !== currentEntryPath) {
        reloadWithFreshBust();
      }
    } catch {
      // Ignore transient network/parsing issues in preview polling
    }
  };

  window.setInterval(() => {
    void checkIfPreviewIsOutdated();
  }, refreshMs);
};

const boot = async () => {
  // Always clean up SW and caches in preview environments
  if (isPreviewRuntime) {
    // Clear on EVERY load, not just once
    await clearAllCaches();
    await unregisterAllSW();

    // Force navigation with cache-busting query when preview URL is stale
    if (forcePreviewReloadIfStale()) return;

    // Keep embedded preview synced during long sessions
    setupPreviewAutoRefresh();
  } else if ("serviceWorker" in navigator) {
    // Production: register PWA with auto-update
    const { registerSW } = await import("virtual:pwa-register");
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        updateSW(true);
      },
    });
    window.setInterval(() => void updateSW(), 60_000);
  }

  // Render app
  createRoot(document.getElementById("root")!).render(
    <HelmetProvider>
      <App />
    </HelmetProvider>,
  );
};

boot();
