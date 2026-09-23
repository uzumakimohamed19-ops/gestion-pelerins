'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Sparkles, ShieldAlert, CheckCircle2 } from 'lucide-react'

type VersionData = {
  buildTime: number
  commit: string
}

export default function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [currentCommit, setCurrentCommit] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. Contrôle instantané de la version dès le démarrage
    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { 
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        })
        
        if (res.ok) {
          const data: VersionData = await res.json()
          const storedCommit = localStorage.getItem('app_build_commit')

          if (!storedCommit) {
            // Premier démarrage de l'app sur cet appareil
            localStorage.setItem('app_build_commit', data.commit)
            setCurrentCommit(data.commit)
          } else {
            setCurrentCommit(storedCommit)
            // Détection formelle d'un git push / nouveau build
            if (storedCommit !== data.commit) {
              setUpdateAvailable(true)
            }
          }
        }
      } catch (e) {
        // Mode hors-ligne ou développement local
      }
    }

    // Exécution immédiate
    void checkVersion()

    // 2. Vérification réactive (au retour sur l'onglet et toutes les 30s)
    const interval = setInterval(checkVersion, 30000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkVersion()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  // 3. Verrouillage du scroll et des touches quand l'écran de MAJ est actif
  useEffect(() => {
    if (!updateAvailable) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const trapKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', trapKey, true)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', trapKey, true)
    }
  }, [updateAvailable])

  // 4. Procédure de purge complète et rechargement propre
  const handleApplyUpdate = async () => {
    if (updating) return
    setUpdating(true)

    try {
      // A. Récupérer et sauvegarder le nouveau commit en local
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const data: VersionData = await res.json()
        localStorage.setItem('app_build_commit', data.commit)
      }

      // B. Désinscrire tous les Service Workers résiduels (évite le ChunkLoadError)
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const reg of registrations) {
          await reg.unregister()
        }
      }

      // C. Vider l'intégralité du CacheStorage du navigateur
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        for (const name of cacheNames) {
          await caches.delete(name)
        }
      }

      // D. Pause technique pour garantir l'écriture I/O
      await new Promise((resolve) => setTimeout(resolve, 600))

      // E. Rechargement dur forcé
      window.location.reload()
    } catch {
      window.location.reload()
    }
  }

  if (!updateAvailable) return null

  return (
    <div 
      className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-[#1C1C1E] border border-[#2C2C2E] rounded-3xl p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex flex-col items-center text-center space-y-6 animate-in zoom-in-95 duration-200">
        
        {/* Icône d'alerte mise à jour */}
        <div className="relative flex items-center justify-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-900/40">
            <Sparkles size={38} className="text-white animate-pulse" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
          </span>
        </div>

        {/* Textes explicatifs */}
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-black text-[#F5F5F7] tracking-tight">
            Mise à jour obligatoire
          </h2>
          <p className="text-xs sm:text-sm text-[#8E8E93] leading-relaxed max-w-xs mx-auto">
            Une nouvelle version de l'application a été déployée. Pour éviter tout conflit de données ou dysfonctionnement, veuillez installer la mise à jour maintenant.
          </p>
        </div>

        {/* Badge informatif */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2C2C2E] border border-[#38383A] text-[11px] font-semibold text-emerald-400">
          <ShieldAlert size={14} className="shrink-0" />
          <span>Synchronisation et purge automatique du cache</span>
        </div>

        {/* Bouton d'action unique */}
        <button
          type="button"
          onClick={handleApplyUpdate}
          disabled={updating}
          className="w-full py-4 bg-[#34C759] hover:bg-[#30B750] active:scale-[0.98] text-black font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
        >
          {updating ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              <span>Installation de la version en cours...</span>
            </>
          ) : (
            <>
              <RefreshCw size={16} />
              <span>Mettre à jour maintenant</span>
            </>
          )}
        </button>

      </div>
    </div>
  )
}