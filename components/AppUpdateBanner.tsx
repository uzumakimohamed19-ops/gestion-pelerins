'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react'

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

    // 1. Charger la version actuelle au montage
    const checkInitialVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const data: VersionData = await res.json()
          const storedCommit = localStorage.getItem('app_build_commit')
          
          if (!storedCommit) {
            localStorage.setItem('app_build_commit', data.commit)
            setCurrentCommit(data.commit)
          } else {
            setCurrentCommit(storedCommit)
            if (storedCommit !== data.commit) {
              setUpdateAvailable(true)
            }
          }
        }
      } catch (e) {
        // En local ou hors-ligne
      }
    }

    checkInitialVersion()

    // 2. Vérifier périodiquement (toutes les 60 secondes ou quand l'utilisateur revient sur l'onglet)
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { credentials: 'omit', cache: 'no-store' })
        if (res.ok) {
          const data: VersionData = await res.json()
          const active = localStorage.getItem('app_build_commit')
          if (active && active !== data.commit) {
            setUpdateAvailable(true)
          }
        }
      } catch (err) {}
    }, 60000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInitialVersion()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  // 3. Procédure de purge complète sans conflit de cache
  const handleApplyUpdate = async () => {
    setUpdating(true)
    try {
      // A. Mettre à jour l'identifiant de version en local
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const data: VersionData = await res.json()
        localStorage.setItem('app_build_commit', data.commit)
      }

      // B. Désinscrire les Service Workers PWA obsolètes
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const reg of registrations) {
          await reg.unregister()
        }
      }

      // C. Vider le cache de l'API CacheStorage
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        for (const name of cacheNames) {
          await caches.delete(name)
        }
      }

      // D. Laisser 500ms pour finaliser l'écriture
      await new Promise(r => setTimeout(r, 500))

      // E. Forcer un rechargement dur sans cache
      window.location.reload()
    } catch (err) {
      window.location.reload()
    }
  }

  if (!updateAvailable) return null

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[999999] w-[94%] max-w-md animate-in slide-in-from-top-4 duration-300">
      <div className="bg-[#1C1C1E] text-white border border-[#2C2C2E] shadow-[0_12px_40px_rgba(0,0,0,0.6)] p-3.5 sm:p-4 rounded-2xl flex items-center justify-between gap-3 backdrop-blur-md">
        
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center shrink-0 shadow-md shadow-emerald-900/30">
            <Sparkles size={18} className="text-white animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              Nouvelle Version Disponible
            </p>
            <p className="text-[11px] text-slate-300 font-medium truncate mt-0.5">
              Une mise à jour vient d'être déployée.
            </p>
          </div>
        </div>

        <button
          onClick={handleApplyUpdate}
          disabled={updating}
          className="bg-[#34C759] hover:bg-[#30B750] text-black px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer shadow-md"
        >
          <RefreshCw size={13} className={updating ? 'animate-spin' : ''} />
          <span>{updating ? 'Mise à jour…' : 'Mettre à jour'}</span>
        </button>

      </div>
    </div>
  )
}