'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, X, Share, PlusSquare, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  detectPushEnvironment,
  getCurrentBrowserSubscription,
  pingPushActivityIfNeeded,
  subscribeToPush,
} from '@/lib/pushClient'

const DISMISS_PROMPT_KEY = 'agencepro_push_prompt_dismissed_at'
const DISMISS_IOS_KEY = 'agencepro_push_ios_guide_dismissed_at'
const LAST_RESYNC_KEY = 'agencepro_push_last_resync_ms'
const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24h si l'utilisateur clique "Plus tard"
const IOS_GUIDE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000 // 3 jours
const RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000 // Resynchronise l'endpoint push toutes les 24h (auto-réparation après veille)

/**
 * 1. Met à jour `last_seen_at` discrètement (pour détecter l'inactivité).
 * 2. Active automatiquement les notifications push sur tout appareil connecté :
 *    - Si permission déjà accordée -> abonnement silencieux immédiat.
 *    - Si permission jamais demandée -> demande d'autorisation automatique (ou bandeau 1 tap sur iOS PWA / navigateurs stricts).
 * Les utilisateurs n'ont aucun réglage à gérer : réception uniquement (pilotage réservé à l'admin).
 */
export default function PushActivityTracker() {
  const pathname = usePathname()
  const [showPermissionBanner, setShowPermissionBanner] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    if (pathname === '/login') return

    let cancelled = false

    const initPushForSession = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session?.user?.id || cancelled) return

        // 1. Effacer la pastille de l'icône PWA dès l'ouverture + heartbeat d'activité
        if ('clearAppBadge' in navigator && typeof (navigator as any).clearAppBadge === 'function') {
          void (navigator as any).clearAppBadge().catch(() => {})
        }
        void pingPushActivityIfNeeded()

        const env = detectPushEnvironment()
        if (!env.vapidConfigured) return

        // 2. Cas iOS Safari non encore installé sur l'écran d'accueil
        if (env.needsIosInstall) {
          const dismissedAt = Number(localStorage.getItem(DISMISS_IOS_KEY) || '0')
          if (Date.now() - dismissedAt > IOS_GUIDE_COOLDOWN_MS && !cancelled) {
            setShowIosGuide(true)
          }
          return
        }

        if (!env.supported) return

        // 3. Si déjà autorisé : s'assurer que l'appareil est abonné ET resynchronisé toutes les 24h
        //    (répare automatiquement un endpoint tourné pendant une longue veille)
        if (env.permission === 'granted') {
          const existing = await getCurrentBrowserSubscription()
          const lastResync = Number(localStorage.getItem(LAST_RESYNC_KEY) || '0')
          if (!existing || Date.now() - lastResync > RESYNC_INTERVAL_MS) {
            localStorage.setItem(LAST_RESYNC_KEY, String(Date.now()))
            await subscribeToPush({ morning_enabled: true, evening_enabled: true }).catch(() => {})
          }
          return
        }

        // 4. Si permission jamais demandée ('default') : proposer / demander l'autorisation dès la connexion
        if (env.permission === 'default') {
          const dismissedAt = Number(localStorage.getItem(DISMISS_PROMPT_KEY) || '0')
          if (Date.now() - dismissedAt < PROMPT_COOLDOWN_MS) return

          // Sur Android/Desktop, tenter la demande directe ; si bloquée par la politique geste utilisateur (ou sur iOS PWA), afficher le bandeau 1 tap
          if (!env.isIOS) {
            try {
              const perm = await Notification.requestPermission()
              if (perm === 'granted') {
                await subscribeToPush({ morning_enabled: true, evening_enabled: true }).catch(() => {})
                return
              }
              if (perm === 'denied') return
            } catch {
              // Certains navigateurs exigent un clic utilisateur -> on affiche le bandeau 1 tap
            }
          }

          if (!cancelled) {
            setShowPermissionBanner(true)
          }
        }
      } catch {
        // Ne jamais bloquer l'application
      }
    }

    const timer = setTimeout(() => {
      void initPushForSession()
    }, 1500)

    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        void initPushForSession()
      }
    })

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void pingPushActivityIfNeeded()
      }
    }
    const handleYearChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<{ scope?: string; year?: number | 'all' }>).detail
      if (!detail || detail.scope !== 'hajj') return
      const nextCampagne =
        detail.year === 'all' || detail.year == null ? null : Number(detail.year)
      void pingPushActivityIfNeeded({
        force: true,
        activeCampagne: Number.isFinite(nextCampagne as number) ? nextCampagne : null,
      })
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('agencepro:year-changed', handleYearChanged)

    return () => {
      cancelled = true
      clearTimeout(timer)
      authSub.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('agencepro:year-changed', handleYearChanged)
    }
  }, [pathname])

  const handleAllowClick = async () => {
    setActivating(true)
    try {
      await subscribeToPush({ morning_enabled: true, evening_enabled: true })
      setShowPermissionBanner(false)
    } catch {
      // Si l'utilisateur refuse ou bloque, on referme proprement pour 24h
      localStorage.setItem(DISMISS_PROMPT_KEY, String(Date.now()))
      setShowPermissionBanner(false)
    } finally {
      setActivating(false)
    }
  }

  const handleDismissPrompt = () => {
    localStorage.setItem(DISMISS_PROMPT_KEY, String(Date.now()))
    setShowPermissionBanner(false)
  }

  const handleDismissIos = () => {
    localStorage.setItem(DISMISS_IOS_KEY, String(Date.now()))
    setShowIosGuide(false)
  }

  if (showPermissionBanner) {
    return (
      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-3 right-3 sm:left-auto sm:right-5 sm:max-w-sm z-[9995] animate-in fade-in slide-in-from-top-3 duration-200">
        <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-white/10 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
            <Bell size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black tracking-tight text-white">
              Activer les notifications Agence Pro
            </p>
            <p className="text-[11px] text-slate-300 font-medium mt-0.5 leading-snug">
              Autorisez les alertes pour recevoir vos points automatiques matin et soir.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                disabled={activating}
                onClick={handleAllowClick}
                className="h-8 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-1.5 active:scale-95 transition disabled:opacity-60 cursor-pointer"
              >
                {activating ? <Loader2 size={13} className="animate-spin" /> : null}
                <span>Autoriser</span>
              </button>
              <button
                type="button"
                onClick={handleDismissPrompt}
                className="h-8 px-2.5 rounded-lg bg-white/10 text-slate-300 text-[11px] font-bold cursor-pointer"
              >
                Plus tard
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissPrompt}
            aria-label="Fermer"
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  if (showIosGuide) {
    return (
      <div className="fixed bottom-24 left-3 right-3 z-[9995] animate-in fade-in slide-in-from-bottom-3 duration-200">
        <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-2xl border border-white/10 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
            <Bell size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-white">Recevez les alertes sur iPhone</p>
            <p className="text-[11px] text-slate-300 font-medium mt-0.5 leading-snug">
              Touchez <Share size={11} className="inline text-blue-400" /> <strong>Partager</strong> puis{' '}
              <PlusSquare size={11} className="inline text-slate-200" /> <strong>Sur l’écran d’accueil</strong> pour activer les notifications.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismissIos}
            aria-label="Fermer"
            className="p-1 text-slate-400 hover:text-white cursor-pointer shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return null
}
