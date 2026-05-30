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

// 2. Interception des requêtes réseaux avec gestion du mode hors-ligne
self.addEventListener('fetch', (event) => {
  // On applique le traitement de secours uniquement aux requêtes de navigation (les pages HTML)
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
    // Pour le reste (images, styles CSS, scripts), on tente le réseau, sinon le cache si dispo
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
  }
});