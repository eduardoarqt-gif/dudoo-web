// Dudoo Web — service worker: guarda o app (shell) para abrir offline; os dados vêm da rede e caem no cache local do app.
const VERSAO = "dudoo-web-v25";
const ARQUIVOS = ["./", "index.html", "styles.css", "app.js", "demo.js", "mascaras.js", "cronograma.js", "cronograma.css", "manifest.webmanifest", "icon.svg", "icon-maskable.svg", "icon-180.png", "icon-192.png", "icon-512.png"];

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
