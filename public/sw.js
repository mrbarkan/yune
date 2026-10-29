// Yune service worker: casca offline + Web Push.
const CACHE = "yune-v4";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // /__/ é do Firebase (login com Google/Apple): sempre direto da rede.
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/__/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/")));
    return;
  }
  // cache-first só para o que é versionado/estático; o resto vai direto à rede.
  const p = url.pathname;
  if (!(p.startsWith("/assets/") || p.startsWith("/icons/") || p === "/manifest.webmanifest")) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
      return res;
    })),
  );
});

self.addEventListener("push", (e) => {
  let data = { title: "Yune", body: "", tag: "yune", url: "/" };
  try { data = { ...data, ...e.data.json() }; } catch { if (e.data) data.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: data.url },
    actions: data.actions ?? [],
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action === "nada") return;
  const target = e.notification.data?.url || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // App já aberto: foca e manda a URL (navigate() recarregaria e falha em cliente não controlado).
      for (const c of list) {
        if ("focus" in c) {
          return c.focus().catch(() => {}).then(() => c.postMessage({ type: "deeplink", url: target }));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
