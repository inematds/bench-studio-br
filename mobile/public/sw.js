// Service worker mínimo: guarda só o esqueleto da interface, para o app abrir
// instantaneamente e continuar abrindo se o telefone perder a rede por um
// instante.
//
// O que ele NUNCA guarda: qualquer coisa sob /api, /media, /inputs, /previews
// ou /projects. Cachear /api/ledger mostraria uma galeria velha como se fosse a
// atual, e cachear mídia encheria o telefone com vídeo. Preço e resultado têm
// que vir do servidor, sempre.

const CACHE = "bench-mobile-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const dinamico = ["/api/", "/media/", "/inputs/", "/previews/", "/projects/"]
    .some((prefixo) => url.pathname.startsWith(prefixo));
  if (event.request.method !== "GET" || dinamico || url.origin !== self.location.origin) return;

  // Rede primeiro, cache como rede de segurança: assim uma versão nova entra
  // sozinha e o app ainda abre offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copia = response.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copia)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit ?? caches.match("/index.html"))),
  );
});
