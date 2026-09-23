'use client'

import { useEffect, useState } from 'react'
import { 
  Building2, 
  GitCommitHorizontal, 
  ArrowUpRight, 
  Loader2, 
  Check, 
  DatabaseZap,
  Radio
} from 'lucide-react'

type VersionData = {
  buildTime: number
  commit: string
}

export default function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateStep, setUpdateStep] = useState<string>('')
  const [incomingCommit, setIncomingCommit] = useState<string | null>(null)
  const [activeCommit, setActiveCommit] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

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
            localStorage.setItem('app_build_commit', data.commit)
            setActiveCommit(data.commit)
          } else {
            setActiveCommit(storedCommit)
            if (storedCommit !== data.commit) {
              setIncomingCommit(data.commit)
              setUpdateAvailable(true)
            }
          }
        }
      } catch {
        // Mode offline
      }
    }

    void checkVersion()

    const interval = setInterval(checkVersion, 30000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkVersion()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  // Verrouillage de la page
  useEffect(() => {
    if (!updateAvailable) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const trapKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') e.preventDefault()
    }

    window.addEventListener('keydown', trapKey, true)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', trapKey, true)
    }
  }, [updateAvailable])

  const handleApplyUpdate = async () => {
    if (updating) return
    setUpdating(true)

    try {
      setUpdateStep('Écriture du nouveau descripteur...')
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const data: VersionData = await res.json()
        localStorage.setItem('app_build_commit', data.commit)
      }

      setUpdateStep('Purge des Service Workers PWA...')
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const reg of registrations) {
          await reg.unregister()
        }
      }

      setUpdateStep('Nettoyage du CacheStorage...')
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        for (const name of cacheNames) {
          await caches.delete(name)
        }
      }

      setUpdateStep('Redémarrage de l’application...')
      await new Promise((r) => setTimeout(r, 600))
      window.location.reload()
    } catch {
      window.location.reload()
    }
  }

  if (!updateAvailable) return null

  const commitShort = incomingCommit ? incomingCommit.slice(0, 7) : 'prod'
  const activeShort = activeCommit ? activeCommit.slice(0, 7) : 'local'

  return (
    <div 
      className="fixed inset-0 z-[999999] bg-[#000000]/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm bg-[#121214] border border-[#2C2C2E] rounded-3xl shadow-[0_24px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col">

        <div className="p-6 sm:p-7 space-y-6">

          {/* En-tête : Indicateur d'état & Version */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-mono tracking-widest text-[#8E8E93] uppercase font-bold">
                Mise à jour système
              </span>
            </div>

            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1C1C1E] border border-[#2C2C2E] text-[10px] font-mono text-[#D1D1D6]">
              <GitCommitHorizontal size={12} className="text-[#34C759]" />
              <span>{commitShort}</span>
            </div>
          </div>

          {/* Titre & Description */}
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#1C1C1E] border border-[#2C2C2E] text-white flex items-center justify-center">
              <Building2 size={22} className="text-[#34C759]" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-black text-[#F5F5F7] tracking-tight">
                Nouvelle version prête
              </h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Une mise à jour vient d'être déployée. L'application doit purger son cache local pour charger les derniers correctifs sans interruption.
              </p>
            </div>
          </div>

          {/* Cartouche d'informations techniques */}
          <div className="p-3 rounded-2xl bg-[#1C1C1E] border border-[#2C2C2E] space-y-2 text-xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#8E8E93] flex items-center gap-1.5">
                <Radio size={12} className="text-emerald-500" />
                Version active
              </span>
              <span className="font-mono text-[#636366]">{activeShort}</span>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#2C2C2E]">
              <span className="text-[#8E8E93] flex items-center gap-1.5">
                <DatabaseZap size={12} className="text-blue-400" />
                Base locale
              </span>
              <span className="font-semibold text-emerald-400 flex items-center gap-1">
                <Check size={11} /> Préservée
              </span>
            </div>
          </div>

          {/* Action principale */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={handleApplyUpdate}
              disabled={updating}
              className="w-full py-3.5 px-4 bg-[#FFFFFF] hover:bg-[#E5E5EA] active:scale-[0.98] text-[#000000] font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-sm"
            >
              {updating ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span className="truncate">{updateStep || 'Mise à niveau…'}</span>
                </>
              ) : (
                <>
                  <span>Installer la mise à jour</span>
                  <ArrowUpRight size={15} />
                </>
              )}
            </button>
            <p className="text-[10px] text-center text-[#636366] font-medium">
              Purge du cache & rechargement instantané
            </p>
          </div>

        </div>

      </div>
    </div>
  )
}