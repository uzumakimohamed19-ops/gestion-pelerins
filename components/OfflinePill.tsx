'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useNetworkStatus } from '@/lib/NetworkContext'

/**
 * Indicateur hors-ligne ultra-compact (zéro gêne, zéro masquage de données) :
 * 1) Au repos hors-ligne : fine pilule centrée en haut de page dans le flux (jamais collée à la barre du bas,
 *    ne recouvre AUCUNE carte ni donnée).
 * 2) Si l'utilisateur tente d'enregistrer hors-ligne : courte micro-pilule toast qui apparaît 2,8 s
 *    ("Connectez-vous pour enregistrer") puis s'efface automatiquement.
 * 3) Au retour du réseau : bascule en vert ("En ligne") 2,2 s puis disparaît sans à-coup.
 */
export default function OfflinePill() {
  const {
    isOffline,
    isChecking,
    justReconnected,
    writeAlertTick,
    writeAlertMessage,
    recheckConnection,
  } = useNetworkStatus()

  const [showWriteToast, setShowWriteToast] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (writeAlertTick === 0 || !isOffline) return
    setShowWriteToast(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setShowWriteToast(false)
      toastTimerRef.current = null
    }, 2800)
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [writeAlertTick, isOffline])

  if (!isOffline && !justReconnected) return null

  return (
    <>
      {/* 1. Micro-pilule discrète dans le flux en haut (ne masque aucune donnée et ne touche pas la nav du bas) */}
      <div
        role="status"
        aria-live="polite"
        className="w-full lg:pl-64 flex justify-center pt-[max(0.35rem,env(safe-area-inset-top))] pb-1 px-3 pointer-events-none select-none z-40"
      >
        {justReconnected ? (
          <div className="pointer-events-auto inline-flex items-center gap-1.5 h-6 px-3 rounded-full bg-emerald-600 text-white shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
            <Wifi size={11} className="shrink-0" />
            <span className="text-[11px] font-bold tracking-tight whitespace-nowrap">
              Connexion rétablie
            </span>
          </div>
        ) : (
          <div
            onClick={() => {
              setShowWriteToast(true)
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
              toastTimerRef.current = setTimeout(() => setShowWriteToast(false), 2600)
            }}
            className="pointer-events-auto inline-flex items-center gap-1.5 h-6 pl-2.5 pr-1 rounded-full bg-slate-900/90 text-white shadow-xs border border-white/10 cursor-pointer transition-all duration-200 animate-in fade-in slide-in-from-top-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <WifiOff size={11} className="text-amber-300 shrink-0" />
            <span className="text-[11px] font-bold tracking-tight whitespace-nowrap">
              Hors ligne
            </span>
            <span className="text-[10px] text-slate-300 font-medium hidden sm:inline">
              · Lecture seule
            </span>
            <button
              type="button"
              disabled={isChecking}
              onClick={(e) => {
                e.stopPropagation()
                void recheckConnection()
              }}
              aria-label="Vérifier la connexion"
              className="w-4 h-4 rounded-full bg-white/12 hover:bg-white/25 flex items-center justify-center text-white/90 transition shrink-0 cursor-pointer disabled:opacity-50 ml-0.5"
            >
              <RefreshCw size={9} className={isChecking ? 'animate-spin' : ''} />
            </button>
          </div>
        )}
      </div>

      {/* 2. Alerte courte éphémère uniquement lors d'une tentative d'enregistrement hors-ligne */}
      {isOffline && showWriteToast && (
        <div className="fixed top-[max(2.5rem,calc(env(safe-area-inset-top)+2.25rem))] left-1/2 -translate-x-1/2 lg:left-[calc(50%+8rem)] z-[9995] pointer-events-none px-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/95 text-white backdrop-blur-md shadow-lg border border-amber-400/50 animate-in fade-in zoom-in-95 duration-200">
            <WifiOff size={13} className="text-amber-300 shrink-0" />
            <span className="text-xs font-bold tracking-tight whitespace-nowrap">
              {writeAlertMessage}
            </span>
          </div>
        </div>
      )}
    </>
  )
}
