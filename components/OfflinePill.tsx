'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useNetworkStatus } from '@/lib/NetworkContext'

/**
 * Pilule flottante moderne (style WhatsApp / Apple) :
 * - Hors-ligne au repos : discrète ("Hors ligne · Lecture seule")
 * - Si l'utilisateur tente d'enregistrer ou touche la pilule : se met en avant
 *   fluidement avec "Connectez-vous pour enregistrer"
 * - Au retour du réseau : passe au vert ("Connexion rétablie") puis disparaît doucement
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

  const [highlightWriteHint, setHighlightWriteHint] = useState(false)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (writeAlertTick === 0 || !isOffline) return
    setHighlightWriteHint(true)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    hintTimerRef.current = setTimeout(() => {
      setHighlightWriteHint(false)
      hintTimerRef.current = null
    }, 3600)
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    }
  }, [writeAlertTick, isOffline])

  if (!isOffline && !justReconnected) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-5 z-[9990] pointer-events-none px-4 w-full max-w-md flex justify-center"
    >
      {justReconnected ? (
        <div className="pointer-events-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600/95 text-white backdrop-blur-md shadow-lg shadow-emerald-950/20 border border-emerald-400/30 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Wifi size={14} className="shrink-0" />
          <span className="text-xs font-bold tracking-tight whitespace-nowrap">
            Connexion rétablie
          </span>
        </div>
      ) : (
        <div
          onClick={() => setHighlightWriteHint((v) => !v)}
          className={`pointer-events-auto inline-flex items-center gap-2.5 pl-3.5 pr-2 py-2 rounded-full backdrop-blur-md shadow-xl transition-all duration-300 ease-out cursor-pointer select-none animate-in fade-in slide-in-from-bottom-2 ${
            highlightWriteHint
              ? 'bg-slate-950/95 text-white border border-amber-400/60 ring-2 ring-amber-400/25 scale-[1.03]'
              : 'bg-slate-900/90 text-white border border-white/12 shadow-slate-950/25'
          }`}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
          </span>

          <WifiOff size={14} className="text-amber-300 shrink-0" />

          <span className="text-xs font-bold tracking-tight whitespace-nowrap">
            {highlightWriteHint ? writeAlertMessage : 'Hors ligne · Connectez-vous pour enregistrer'}
          </span>

          <button
            type="button"
            disabled={isChecking}
            onClick={(e) => {
              e.stopPropagation()
              void recheckConnection()
            }}
            aria-label="Vérifier la connexion"
            title="Vérifier la connexion"
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-white/90 transition shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={isChecking ? 'animate-spin' : ''} />
          </button>
        </div>
      )}
    </div>
  )
}
