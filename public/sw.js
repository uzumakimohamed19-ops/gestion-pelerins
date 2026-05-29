// Fichier public/sw.js
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Requis pour valider le critère d'installation PWA
self.addEventListener('fetch', () => {
  // Tu pourras ajouter de la mise en cache ici plus tard si nécessaire
});