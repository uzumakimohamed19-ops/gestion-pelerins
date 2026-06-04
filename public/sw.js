// Fichier public/sw.js

const CACHE_NAME = 'hajj-v1';
const OFFLINE_URL = '/offline.html';

// 1. Mise en cache de la page hors-ligne personnalisée au moment de l'installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // On force la mise en cache du fichier HTML de secours
      return cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// 2. Interception des requêtes réseaux avec gestion de cache ultra-rapide
self.addEventListener('fetch', (event) => {
  // On ignore les requêtes vers l'API ou ta base de données (Supabase) pour ne pas bloquer les vraies données en temps réel
  if (event.request.url.includes('/api/') || event.request.url.includes('supabase.co')) {
    return;
  }

  // Traitement des pages HTML (Navigation)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si le réseau échoue (pas d'internet), on renvoie la page offline.html
        return caches.open(CACHE_NAME).then((cache) => {
          return cache.match(OFFLINE_URL);
        });
      })
    );
  } else {
    // STRATÉGIE ULTRA-RAPIDE : Stale-While-Revalidate pour les assets (JS, CSS, Images, Icônes)
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        
        // On lance la requête réseau en tâche de fond pour mettre à jour le cache
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {
          // Erreur réseau silencieuse (gérée par le retour du cache ci-dessous)
        });

        // On retourne la réponse du cache IMMEDIATEMENT si elle existe, sinon on attend le réseau
        return cachedResponse || fetchPromise;
      })
    );
  }
});