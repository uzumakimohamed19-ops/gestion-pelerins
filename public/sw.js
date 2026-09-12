// Fichier public/sw.js
const CACHE_NAME = 'hajj-v2'; // Version incrémentée pour invalider l'ancien cache
const OFFLINE_URL = '/offline.html';

// 1. Mise en cache de la page hors-ligne à l'installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Nettoyer les anciens caches lors d'une mise à jour de version
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => clients.claim())
  );
});

// 2. Interception des requêtes réseau
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 🔴 RÈGLE CRITIQUE : Ne jamais intercepter ni cacher :
  // - Les requêtes non-GET (POST, PUT, DELETE...)
  // - Les requêtes Supabase
  // - Les requêtes et flux de streaming continu PowerSync
  // - Les endpoints API
  if (
    event.request.method !== 'GET' ||
    url.includes('/api/') ||
    url.includes('supabase.co') ||
    url.includes('powersync') ||
    url.includes('/sync/stream')
  ) {
    return; // Laisse passer directement sur le réseau
  }

  // Traitement des pages de navigation HTML
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // En cas de panne de réseau sur une page non mise en cache
        return caches.open(CACHE_NAME).then((cache) => {
          return cache.match(OFFLINE_URL);
        });
      })
    );
  } else {
    // Stratégie Stale-While-Revalidate sécurisée pour les assets statiques (JS, CSS, images)
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            // On vérifie que la réponse est exploitable et non consommée avant de cloner
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === 'basic' &&
              !networkResponse.bodyUsed
            ) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Erreur réseau silencieuse pour les assets
          });

        return cachedResponse || fetchPromise;
      })
    );
  }
});