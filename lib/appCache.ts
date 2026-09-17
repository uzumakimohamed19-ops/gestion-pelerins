'use client'

import packageJson from '../package.json'

const CACHE_VERSION_KEY = 'app_cache_version'
const DEFAULT_CACHE_VERSION = packageJson.version

function getCacheVersion() {
  return process.env.NEXT_PUBLIC_APP_VERSION || DEFAULT_CACHE_VERSION
}

/**
 * Invalide les caches techniques du WebView lors d'un changement de version.
 * Les profils, la session Supabase et la base SQLite sont volontairement
 * conservés pour ne pas déconnecter ni supprimer les données métier.
 */
export async function invalidateAppCacheOnUpdate() {
  if (typeof window === 'undefined') return

  const version = getCacheVersion()
  const previousVersion = window.localStorage.getItem(CACHE_VERSION_KEY)
  if (previousVersion === version) return

  // Écrire avant le nettoyage évite une boucle si le runtime redémarre.
  window.localStorage.setItem(CACHE_VERSION_KEY, version)

  try {
    window.sessionStorage.clear()
  } catch {
    // Certains WebViews peuvent bloquer le storage privé.
  }

  try {
    if ('caches' in window) {
      const cacheNames = await window.caches.keys()
      await Promise.all(cacheNames.map((name) => window.caches.delete(name)))
    }
  } catch (error) {
    console.warn('[AppCache] Cache Storage non disponible:', error)
  }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch (error) {
    console.warn('[AppCache] Service worker non réinitialisé:', error)
  }

  // Le rechargement force Capacitor, Tauri et le WebView à reprendre le
  // bundle correspondant à la nouvelle version installée.
  window.location.reload()
}
