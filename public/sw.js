// Fichier public/sw.js
const CACHE_NAME = 'hajj-v4'; // Inclut le support complet Web Push (Android & iOS PWA)

// 1. Initialisation du cache PWA sans écran offline de remplacement.
self.addEventListener('install', () => {
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
    }).then(() => self.clients.claim())
  );
});

// 2. Interception des requêtes réseau
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Tauri doit fonctionner avec PowerSync et ne doit jamais recevoir offline.html.
  if (url.includes('tauri.localhost') || url.startsWith('tauri://')) {
    return;
  }

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
      fetch(event.request).then((networkResponse) => {
        if (networkResponse.ok && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          void caches.open(CACHE_NAME).then((cache) => {
            void cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Servir le shell déjà visité: PowerSync fournit ensuite les données locales.
        return caches.match(event.request).then((cachedPage) => {
          if (cachedPage) return cachedPage;
          return caches.match('/').then((cachedHome) => cachedHome || Response.error());
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

// 3. Réception des notifications Push Web (Android & iOS 16.4+ PWA)
self.addEventListener('push', (event) => {
  let data = {
    title: 'Agence Pro',
    body: 'Nouveau point de suivi disponible sur votre espace.',
    url: '/hajj/dashboard',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'agencepro-digest',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      const text = event.data.text();
      if (text) data.body = text;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/icon-192x192.png',
    tag: data.tag || 'agencepro-digest',
    renotify: true,
    vibrate: [120, 60, 120],
    data: {
      url: data.url || '/hajj/dashboard',
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// 4. Ouverture ciblée de la PWA au clic sur une notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/hajj/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl).catch(() => client);
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
