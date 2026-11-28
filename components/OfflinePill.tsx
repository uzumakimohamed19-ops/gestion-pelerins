'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useNetworkStatus } from '@/lib/NetworkContext'

/**
 * Pilule hors-ligne flottante 60fps (zéro reflow, zéro saccade au scroll) :
 * - Positionnée en bas à droite avec une marge nette au-dessus de la barre de navigation mobile.
 * - Petite et transparente (verre dépoli léger) pour ne jamais masquer les textes.
 * - Morphing 100 % GPU (transform + opacity uniquement sur 2 calques pré-dimensionnés,
 *   zéro animation de width/padding/max-width) vers une mini-bulle circulaire dès le scroll.
 * - Écouteur de scroll throttlé via requestAnimationFrame + hystérésis : zéro re-render React pendant le défilement.
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

  const isScrolledRef = useRef(false)
  const manualExpandRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pages disposant de la barre de navigation basse sur mobile
  const hasBottomNav = Boolean(
    pathname && (pathname.startsWith('/hajj') || pathname.startsWith('/agence'))
  )

  useEffect(() => {
    manualExpandRef.current = manualExpand
  }, [manualExpand])

  // Écouteur ultra-léger : rAF + hystérésis (28px / 8px) → aucun re-render React pendant le scroll continu
  useEffect(() => {
    if (!isOffline) {
      isScrolledRef.current = false
      setIsScrolled(false)
      setManualExpand(false)
      return
    }

    const evaluateScroll = () => {
      rafRef.current = null
      const y = window.scrollY || document.documentElement.scrollTop || 0

      if (!isScrolledRef.current && y > 28) {
        isScrolledRef.current = true
        setIsScrolled(true)
        if (manualExpandRef.current) {
          manualExpandRef.current = false
          setManualExpand(false)
        }
      } else if (isScrolledRef.current && y < 8) {
        isScrolledRef.current = false
        setIsScrolled(false)
      }
    }

    const onScroll = () => {
      if (rafRef.current !== null) return
      rafRef.current = window.requestAnimationFrame(evaluateScroll)
    }

    evaluateScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
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

  const handleOpenBubble = () => {
    setManualExpand(true)
    if (expandTimerRef.current) clearTimeout(expandTimerRef.current)
    expandTimerRef.current = setTimeout(() => {
      setManualExpand(false)
      expandTimerRef.current = null
    }, 3400)
  }

  const handleTapPill = () => {
    setShowWriteToast(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setShowWriteToast(false)
      toastTimerRef.current = null
    }, 2600)
  }

  return (
    <>
      {/* 1. Alerte courte éphémère lors d'une tentative d'enregistrement hors-ligne */}
      {isOffline && showWriteToast && (
        <div
          className={`fixed right-3.5 lg:right-5 z-[9995] pointer-events-none select-none ${
            hasBottomNav
              ? 'bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] lg:bottom-14'
              : 'bottom-[calc(env(safe-area-inset-bottom)+3.75rem)] lg:bottom-14'
          }`}
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/75 text-white backdrop-blur-sm shadow-md border border-amber-300/35">
            <WifiOff size={11} className="text-amber-300 shrink-0" />
            <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
              {writeAlertMessage}
            </span>
          </div>
        </div>
      )}

      {/* 2. Conteneur flottant GPU (2 calques pré-dimensionnés : pilule ↔ bulle, transition transform+opacity uniquement) */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed right-3.5 lg:right-5 z-[82] pointer-events-none select-none ${bottomPositionClass}`}
      >
        {justReconnected ? (
          <div className="pointer-events-auto inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-emerald-600/65 backdrop-blur-sm text-white border border-emerald-200/35 shadow-sm">
            <Wifi size={11} className="shrink-0" />
            <span className="text-[10.5px] font-semibold tracking-tight whitespace-nowrap">
              En ligne
            </span>
          </div>
        ) : (
          <div className="relative h-8 flex items-center justify-end">
            {/* Calque A : Pilule compacte translucide (visible au repos ou après tap sur la bulle) */}
            <div
              onClick={handleTapPill}
              style={{ willChange: 'transform, opacity' }}
              className={`inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full bg-slate-900/45 backdrop-blur-sm text-white border border-white/25 shadow-sm origin-right transition-[transform,opacity] duration-200 ease-out cursor-pointer ${
                isBubbleMode
                  ? 'opacity-0 scale-75 pointer-events-none'
                  : 'opacity-100 scale-100 pointer-events-auto'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <WifiOff size={11} className="text-amber-200 shrink-0" />
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
                className="w-4 h-4 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white/90 shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={9} className={isChecking ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Calque B : Mini-bulle circulaire translucide (visible pendant le scroll) */}
            <button
              type="button"
              onClick={handleOpenBubble}
              aria-label="Hors ligne — toucher pour afficher"
              style={{ willChange: 'transform, opacity' }}
              className={`absolute right-0 top-0 w-8 h-8 rounded-full bg-slate-900/45 backdrop-blur-sm text-white border border-white/25 shadow-sm flex items-center justify-center origin-center transition-[transform,opacity] duration-200 ease-out cursor-pointer ${
                isBubbleMode
                  ? 'opacity-100 scale-100 pointer-events-auto'
                  : 'opacity-0 scale-75 pointer-events-none'
              }`}
            >
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
              <WifiOff size={13} className="text-amber-200" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
