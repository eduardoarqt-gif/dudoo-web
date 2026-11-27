// Dudoo Web — service worker: guarda o app (shell) para abrir offline; os dados vêm da rede e caem no cache local do app.
const VERSAO = "dudoo-web-v44";
const ARQUIVOS = ["./", "index.html", "styles.css", "app.js", "quadro.js", "revisao.js", "escolhas.js", "demo.js", "mascaras.js", "cronograma.js", "pareamento.js", "notificacoes.js", "cronograma.css", "manifest.webmanifest", "icon.svg", "icon-maskable.svg", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // API do Wix: nunca do cache do SW
  e.respondWith(
    fetch(req).then((r) => {
      const copia = r.clone();
      caches.open(VERSAO).then((c) => c.put(req, copia));
      return r;
    }).catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});

// Notificações push (23/11/2026): o aviso chega como {titulo, texto, aba, tag}. No iOS TODO push tem que mostrar uma notificação (userVisibleOnly).
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { titulo: "Dudoo", texto: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Dudoo", {
    body: d.texto || "", tag: d.tag || undefined, icon: "icon-192.png", badge: "icon-192.png", data: { aba: d.aba || "hoje" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const aba = (e.notification.data || {}).aba || "hoje";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
    for (const j of janelas) if ("focus" in j) { j.postMessage({ tipo: "abrir-aba", aba }); return j.focus(); }
    return self.clients.openWindow("./?aba=" + encodeURIComponent(aba));
  }));
});
