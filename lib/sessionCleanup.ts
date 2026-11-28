import { del, keys } from 'idb-keyval'
import { powersync } from '@/lib/powersync/db'
import { supabase } from '@/lib/supabase'

const STATIC_AUTH_KEYS = [
  'auth_verified_offline_marker',
  'has_created_profile_marker',
  'compta_access_level',
  'main_direction_profile_id',
  'is_selected_main_direction',
]

const USER_SCOPED_PREFIXES = [
  'active_profile_id_',
  'active_profile_data_',
  'profile_last_activity_',
  'last_selected_profile_id_',
  'cached_nom_agence_',
  'cached_user_name_',
  'cached_user_role_',
  'bio_enrolled_',
  'last_pin_date_',
  'pin_attempts_',
]

/**
 * Purge toutes les traces de session, de profils et de caches locaux de l'agence précédente.
 * Préserve l'email mémorisé (`remembered_email`) et la préférence de thème sombre.
 */
export function clearAllLocalSessionArtifacts() {
  if (typeof window === 'undefined') return

  try {
    for (const key of STATIC_AUTH_KEYS) {
      localStorage.removeItem(key)
    }

    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (USER_SCOPED_PREFIXES.some((prefix) => k.startsWith(prefix))) {
        keysToRemove.push(k)
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k)
    }
  } catch {}

  try {
    sessionStorage.removeItem('hajj_add_pelerin_draft_v2')
  } catch {}

  // Nettoyage asynchrone des caches IndexedDB (virements, cacheFirst, etc.)
  void (async () => {
    try {
      const allKeys = await keys()
      await Promise.all(
        allKeys
          .filter((k) => {
            const s = String(k)
            return (
              s.startsWith('virements_') ||
              s.startsWith('cache_first_') ||
              s.startsWith('hajj_') ||
              s.startsWith('agence_')
            )
          })
          .map((k) => del(k).catch(() => {}))
      )
    } catch {}
  })()
}

/**
 * Déconnexion complète et sécurisée :
 * 1. Purge toutes les clés de session & caches locaux (zéro fuite vers un autre compte)
 * 2. Déconnecte ET vide la base SQLite PowerSync locale (`disconnectAndClear`)
 * 3. Ferme la session Supabase (avec timeout pour ne jamais bloquer hors-ligne)
 */
export async function performFullLogout(options?: {
  scope?: 'local' | 'global' | 'others'
}): Promise<void> {
  clearAllLocalSessionArtifacts()

  // Vider la base SQLite locale pour empêcher toute fuite de données entre agences
  try {
    await Promise.race([
      powersync.disconnectAndClear(),
      new Promise<void>((resolve) => setTimeout(resolve, 3500)),
    ])
  } catch {
    try {
      await powersync.disconnect()
    } catch {}
  }

  try {
    await Promise.race([
      supabase.auth.signOut({ scope: options?.scope ?? 'local' }),
      new Promise<void>((resolve) => setTimeout(resolve, 3500)),
    ])
  } catch {}

  // Sécurité supplémentaire : purger les jetons sb-*-auth-token si signOut a expiré hors-ligne
  if (typeof window !== 'undefined') {
    try {
      const sbKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          sbKeys.push(k)
        }
      }
      for (const k of sbKeys) localStorage.removeItem(k)
    } catch {}
  }
}
