// Fichier public/sw.js
const CACHE_NAME = 'hajj-v9'; // Pré-cache complet HTML + manifest dynamique + chunks JS/CSS Next.js
const MEDIA_CACHE_NAME = 'hajj-media-v1';
const MAX_MEDIA_ENTRIES = 260;

const CORE_PRECACHE_ASSETS = [
  '/',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/splash-blank-512x512.png',
  '/manifest.webmanifest',
  '/manifest.json',
  '/offline.html',
];

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extrait tous les scripts/CSS `/_next/static/...` référencés dans un document HTML Next.js
 * et les met immédiatement en cache afin qu'une page pré-cachée s'affiche à 100 % hors-ligne.
 */
async function cacheHtmlAndReferencedAssets(cache, requestOrUrl, response) {
  try {
    const cloneForStore = response.clone();
    const cloneForParse = response.clone();
    await cache.put(requestOrUrl, cloneForStore);

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return;

    const html = await cloneForParse.text();
    const assetMatches = new Set();
    const regex = /(?:src|href)=["'](\/_next\/static\/[^"']+)["']/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      if (m[1]) assetMatches.add(m[1]);
    }

    await Promise.allSettled(
      Array.from(assetMatches).map(async (assetUrl) => {
        const already = await cache.match(assetUrl);
        if (already) return;
        const assetRes = await fetchWithTimeout(assetUrl, 6000);
        if (assetRes && assetRes.status === 200 && assetRes.type === 'basic') {
          await cache.put(assetUrl, assetRes.clone());
        }
      })
    );
  } catch {
    // Silencieux si interruption réseau pendant le pré-chargement
  }
}

async function trimMediaCache() {
  try {
    const cache = await caches.open(MEDIA_CACHE_NAME);
    const keys = await cache.keys();
    if (keys.length > MAX_MEDIA_ENTRIES) {
      const toDelete = keys.slice(0, keys.length - MAX_MEDIA_ENTRIES);
      await Promise.all(toDelete.map((k) => cache.delete(k)));
    }
  } catch {}
}

// 1. Installation : pré-cache immédiat du shell '/' + ses chunks JS/CSS + offline.html autonome
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await Promise.allSettled(
          CORE_PRECACHE_ASSETS.map(async (url) => {
            const res = await fetchWithTimeout(new Request(url, { credentials: 'same-origin' }), 6000);
            if (res && res.ok && res.type === 'basic') {
              await cacheHtmlAndReferencedAssets(cache, url, res);
            }
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== MEDIA_CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Pré-cache silencieux de toutes les pages principales + leurs chunks JS/CSS Next.js dès que l'app est en ligne
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'PRECACHE_ROUTES' || !Array.isArray(data.routes)) {
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const route of data.routes) {
        try {
          if (typeof route !== 'string' || !route.startsWith('/')) continue;
          const res = await fetchWithTimeout(new Request(route, { credentials: 'same-origin' }), 6000);
          if (res && res.ok && res.type === 'basic') {
            await cacheHtmlAndReferencedAssets(cache, route, res);
          }
        } catch {
          // Ignorer silencieusement si hors-ligne
        }
      }
    })
  );
});

// 2. Interception intelligente des requêtes réseau
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  if (url.includes('tauri.localhost') || url.startsWith('tauri://')) {
    return;
  }

  if (
    req.method !== 'GET' ||
    url.includes('/api/') ||
    url.includes('/version.json') ||
    url.includes('powersync') ||
    url.includes('/sync/stream')
  ) {
    return;
  }

  // Photos publiques Supabase Storage (pèlerins / passeports) : cache dédié pour affichage hors-ligne
  if (url.includes('supabase.co')) {
    if (url.includes('/storage/v1/object/public/')) {
      event.respondWith(
        caches.open(MEDIA_CACHE_NAME).then(async (cache) => {
          const cached = await cache.match(req);
          const networkPromise = fetchWithTimeout(req, 7000)
            .then((res) => {
              if (res && (res.status === 200 || res.type === 'opaque')) {
                void cache.put(req, res.clone()).then(() => trimMediaCache());
              }
              return res;
            })
            .catch(() => null);

          if (cached) {
            void networkPromise;
            return cached;
          }
          const fresh = await networkPromise;
          return fresh || new Response('', { status: 504 });
        })
      );
      return;
    }
    return;
  }

  const isSameOrigin = url.startsWith(self.location.origin);
  if (!isSameOrigin) return;

  // A. Navigation HTML : Network-First (3.5s max) → cache exact → cache sans ?query → '/' → offline.html
  // Ne renvoie JAMAIS Response.error() tant qu'une page de l'app ou offline.html est en cache (= zéro page dinosaure Chrome)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(req, 3500)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            void caches
              .open(CACHE_NAME)
              .then((cache) => cacheHtmlAndReferencedAssets(cache, req, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);

          const exact = await cache.match(req);
          if (exact) return exact;

          const withoutQuery = await cache.match(req, { ignoreSearch: true });
          if (withoutQuery) return withoutQuery;

          const dashboard = await cache.match('/hajj/dashboard');
          if (dashboard) return dashboard;

          const home = await cache.match('/');
          if (home) return home;

          const offline = await cache.match('/offline.html');
          if (offline) return offline;

          return new Response(
            '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agence Pro</title><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;color:#fff;margin:0;padding:24px;text-align:center"><div><h1 style="font-size:20px;margin:0 0 8px">Agence Pro</h1><p style="color:#94a3b8;font-size:14px;margin:0 0 20px">Connectez-vous une première fois pour activer le mode hors ligne.</p><button onclick="location.reload()" style="background:#2563eb;color:#fff;border:0;padding:12px 20px;border-radius:12px;font-weight:700">Réessayer</button></div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // B. Payloads Next.js RSC (navigation interne entre pages hors-ligne)
  const isRscRequest = req.headers.get('RSC') === '1' || url.includes('_rsc=');
  if (isRscRequest) {
    event.respondWith(
      fetchWithTimeout(req, 3000)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const exact = await cache.match(req);
          if (exact) return exact;
          const fallback = await cache.match(req, { ignoreSearch: true });
          return fallback || Response.error();
        })
    );
    return;
  }

  // C. Assets immuables Next.js & modèles locaux : Cache-First (0 ms hors-ligne)
  const isImmutableAsset =
    url.includes('/_next/static/') ||
    url.includes('/models/') ||
    url.includes('/tesseract/') ||
    url.includes('/model/') ||
    url.includes('/images/') ||
    url.endsWith('.woff2') ||
    url.endsWith('.png') ||
    url.endsWith('.svg');

  if (isImmutableAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200 && fresh.type === 'basic') {
            void cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          return Response.error();
        }
      })
    );
    return;
  }

  // D. Autres ressources GET : Stale-While-Revalidate sécurisé
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const networkPromise = fetchWithTimeout(req, 5000)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic' &&
            !networkResponse.bodyUsed
          ) {
            void cache.put(req, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => null);

      if (cached) {
        void networkPromise;
        return cached;
      }
      const fresh = await networkPromise;
      return fresh || Response.error();
    })
  );
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

  const origin = self.location.origin;
  const resolveAsset = (path) => {
    if (!path) return `${origin}/icon-192x192.png`;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  };

  const options = {
    body: data.body,
    icon: resolveAsset(data.icon || '/icon-192x192.png'),
    badge: resolveAsset(data.badge || '/icon-192x192.png'),
    tag: data.tag || 'agencepro-digest',
    renotify: true,
    silent: false,
    requireInteraction: data.requireInteraction !== false,
    timestamp: data.timestamp || Date.now(),
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/hajj/dashboard',
      priority: data.priority || 'high',
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      self.navigator && typeof self.navigator.setAppBadge === 'function'
        ? self.navigator.setAppBadge(1).catch(() => {})
        : Promise.resolve(),
    ])
  );
});

// 4. Ouverture / réveil ciblé de la PWA au clic sur une notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || '/hajj/dashboard';
  const targetUrl = rawUrl.startsWith('http')
    ? rawUrl
    : `${self.location.origin}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;

  event.waitUntil(
    Promise.all([
      self.navigator && typeof self.navigator.clearAppBadge === 'function'
        ? self.navigator.clearAppBadge().catch(() => {})
        : Promise.resolve(),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            return client.focus().then(() => {
              if ('navigate' in client) {
                return client.navigate(targetUrl).catch(() => client);
              }
              return client;
            });
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
    ])
  );
});

// 5. Auto-renouvellement silencieux si le navigateur fait tourner la clé push pendant une longue veille
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldKey = event.oldSubscription?.options?.applicationServerKey;
        if (!oldKey) return;
        await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: oldKey,
        });
      } catch {}
    })()
  );
});
