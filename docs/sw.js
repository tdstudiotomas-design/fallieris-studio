/* =====================================================================
   Service worker mínimo.
   Regla simple: la red manda. El caché es solo un paracaídas para cuando
   no hay internet. Nunca se cachean las llamadas a Supabase: los horarios
   libres tienen que ser siempre los de verdad.
   ===================================================================== */
const CACHE = 'barberia-v1';
const BASE = [
  './',
  './index.html',
  './reservar.html',
  './css/estilos.css',
  './js/config.js',
  './js/landing.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Nada de la API, ni el panel, pasa por el caché
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co')) return;
  if (url.pathname.endsWith('/admin.html') || url.pathname.endsWith('/js/admin.js')) return;

  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.status === 200 && url.origin === location.origin) {
          const copia = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
