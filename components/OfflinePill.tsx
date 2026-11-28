'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useNetworkStatus } from '@/lib/NetworkContext'

/**
 * Pilule hors-ligne flottante, compacte et translucide :
 * - Positionnée en bas à droite avec une marge nette au-dessus de la barre de navigation mobile (jamais collée).
 * - Petite et transparente (verre dépoli) pour ne jamais masquer les textes ou données.
 * - Dès que l'utilisateur commence à scroller, elle se rétracte fluidement en une mini-bulle circulaire
 *   pour libérer encore plus d'espace à l'écran (un tap sur la bulle la ré-ouvre brièvement).
 * - Lors d'une tentative d'enregistrement hors-ligne, une courte alerte translucide s'affiche 2,8 s.
 */
export default function OfflinePill() {
  const pathname = usePathname()
  const {
    isOffline,
    isChecking,
    justReconnected,
    writeAlertTick,
    writeAlertMessage,
    recheckConnection,
  } = useNetworkStatus()

  const [isScrolled, setIsScrolled] = useState(false)
  const [manualExpand, setManualExpand] = useState(false)
  const [showWriteToast, setShowWriteToast] = useState(false)

  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pages disposant de la barre de navigation basse sur mobile
  const hasBottomNav = Boolean(
    pathname && (pathname.startsWith('/hajj') || pathname.startsWith('/agence'))
  )

  // Détection fluide du scroll (fenêtre principale + conteneurs internes)
  useEffect(() => {
    if (!isOffline) {
      setIsScrolled(false)
      setManualExpand(false)
      return
    }

    const handleScroll = (event: Event) => {
      let scrollTop = window.scrollY || document.documentElement.scrollTop || 0
      const target = event.target
      if (target instanceof HTMLElement && target.scrollTop > scrollTop) {
        scrollTop = target.scrollTop
      }
      const nextScrolled = scrollTop > 14
      setIsScrolled(nextScrolled)
      if (nextScrolled) {
        setManualExpand(false)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOffline])

  // Alerte éphémère en cas de tentative d'écriture hors-ligne
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

  useEffect(() => {
    return () => {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  if (!isOffline && !justReconnected) return null

  const isBubbleMode = isOffline && isScrolled && !manualExpand
  const bottomPositionClass = hasBottomNav
    ? 'bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] lg:bottom-5'
    : 'bottom-[max(1.25rem,env(safe-area-inset-bottom))] lg:bottom-5'

  const handleTogglePill = () => {
    if (isBubbleMode) {
      setManualExpand(true)
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current)
      expandTimerRef.current = setTimeout(() => {
        setManualExpand(false)
        expandTimerRef.current = null
      }, 3400)
      return
    }

    setShowWriteToast(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setShowWriteToast(false)
      toastTimerRef.current = null
    }, 2600)
  }

  return (
    <>
      {/* 1. Alerte éphémère (au-dessus même des modales) lors d'une tentative d'enregistrement hors-ligne */}
      {isOffline && showWriteToast && (
        <div
          className={`fixed right-3.5 lg:right-5 z-[9995] pointer-events-none select-none transition-all duration-200 ${
            hasBottomNav
              ? 'bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] lg:bottom-14'
              : 'bottom-[calc(env(safe-area-inset-bottom)+3.75rem)] lg:bottom-14'
          }`}
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/75 text-white backdrop-blur-md shadow-lg border border-amber-300/40 animate-in fade-in slide-in-from-bottom-1 duration-200">
            <WifiOff size={11} className="text-amber-300 shrink-0" />
            <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
              {writeAlertMessage}
            </span>
          </div>
        </div>
      )}

      {/* 2. Pilule translucide flottante (se rétracte en mini-bulle au scroll) */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed right-3.5 lg:right-5 z-[82] pointer-events-none select-none transition-all duration-300 ${bottomPositionClass}`}
      >
        {justReconnected ? (
          <div className="pointer-events-auto inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-emerald-600/70 backdrop-blur-md text-white border border-emerald-200/35 shadow-[0_6px_20px_-6px_rgba(5,150,105,0.45)] animate-in fade-in zoom-in-95 duration-200">
            <Wifi size={11} className="shrink-0" />
            <span className="text-[10.5px] font-semibold tracking-tight whitespace-nowrap">
              En ligne
            </span>
          </div>
        ) : (
          <div
            onClick={handleTogglePill}
            title={isBubbleMode ? 'Hors ligne — toucher pour agrandir' : 'Hors ligne · Lecture seule'}
            className={`pointer-events-auto relative inline-flex items-center justify-center rounded-full bg-slate-900/45 hover:bg-slate-900/60 backdrop-blur-md text-white border border-white/25 shadow-[0_6px_18px_-6px_rgba(15,23,42,0.32)] cursor-pointer transition-all duration-300 ease-out overflow-hidden ${
              isBubbleMode ? 'w-8 h-8 px-0 gap-0' : 'h-7 pl-2.5 pr-1.5 gap-1.5'
            }`}
          >
            {/* Point ambre discret : en coin sur la bulle, aligné dans la pilule */}
            <span
              className={`rounded-full bg-amber-400 shrink-0 transition-all duration-300 ${
                isBubbleMode
                  ? 'absolute top-1.5 right-1.5 w-1.5 h-1.5 ring-1 ring-slate-900/50'
                  : 'w-1.5 h-1.5'
              }`}
            />

            <WifiOff
              size={isBubbleMode ? 13 : 11}
              className="text-amber-200 shrink-0 transition-all duration-300"
            />

            {/* Texte + bouton de reconnexion masqués fluidement en mode bulle */}
            <div
              className={`inline-flex items-center overflow-hidden transition-all duration-300 ease-out ${
                isBubbleMode ? 'max-w-0 opacity-0 gap-0' : 'max-w-[140px] opacity-100 gap-1.5'
              }`}
            >
              <span className="text-[10.5px] font-semibold tracking-tight whitespace-nowrap text-white/95">
                Hors ligne
              </span>

              <button
                type="button"
                disabled={isChecking}
                onClick={(e) => {
                  e.stopPropagation()
                  void recheckConnection()
                }}
                aria-label="Vérifier la connexion"
                className="w-4 h-4 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white/90 transition shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={9} className={isChecking ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
