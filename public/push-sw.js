// Push handler injected into the Workbox-generated service worker via importScripts.
// Listens to Web Push events and shows native notifications.

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    try {
      payload = { title: "Dual Music", body: event.data ? event.data.text() : "" };
    } catch (_e2) {
      payload = {};
    }
  }

  const title = payload.title || "Dual Music";
  const options = {
    body: payload.body || payload.message || "",
    icon: payload.icon || "/pwa-192x192.png",
    badge: payload.badge || "/pwa-192x192.png",
    image: payload.image,
    tag: payload.tag || payload.type || "duel-music",
    renotify: true,
    requireInteraction: !!payload.requireInteraction,
    data: {
      url: payload.url || payload.link || "/",
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            client.focus();
            if ("navigate" in client) client.navigate(target);
            return;
          }
        } catch (_e) {}
      }
      return self.clients.openWindow(target);
    }),
  );
});
