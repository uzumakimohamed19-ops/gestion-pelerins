'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import {
  NETWORK_FAILURE_EVENT,
  OFFLINE_WRITE_BLOCKED_EVENT,
  notifyOfflineWriteBlocked,
  setVerifiedOfflineState,
} from '@/lib/offlineGuard'

type NetworkContextValue = {
  isOnline: boolean
  isOffline: boolean
  isChecking: boolean
  justReconnected: boolean
  writeAlertTick: number
  writeAlertMessage: string
  recheckConnection: () => Promise<boolean>
  triggerOfflineNotice: (msg?: string) => void
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

export function useNetworkStatus(): NetworkContextValue {
  const ctx = useContext(NetworkContext)
  if (!ctx) {
    return {
      isOnline: true,
      isOffline: false,
      isChecking: false,
      justReconnected: false,
      writeAlertTick: 0,
      writeAlertMessage: 'Connectez-vous pour enregistrer',
      recheckConnection: async () => true,
      triggerOfflineNotice: notifyOfflineWriteBlocked,
    }
  }
  return ctx
}

/**
 * Teste une vraie joignabilité Internet (détecte les Wi-Fi sans accès Internet).
 */
async function probeRealInternet(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3500)

  try {
    const isLocalNativeShell =
      Capacitor.isNativePlatform() ||
      (typeof window !== 'undefined' &&
        (window.location.protocol.startsWith('tauri') ||
          window.location.hostname === 'tauri.localhost'))

    if (isLocalNativeShell) {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (sbUrl && sbKey) {
        const res = await fetch(`${sbUrl}/auth/v1/health`, {
          method: 'GET',
          headers: { apikey: sbKey },
          cache: 'no-store',
          signal: controller.signal,
        })
        return res.status < 500
      }
      return true
    }

    const res = await fetch(`/version.json?ping=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export default function NetworkProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isOnline, setIsOnline] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [justReconnected, setJustReconnected] = useState(false)
  const [writeAlertTick, setWriteAlertTick] = useState(0)
  const [writeAlertMessage, setWriteAlertMessage] = useState('Connectez-vous pour enregistrer')

  const wasOfflineRef = useRef(false)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const applyConnectivity = useCallback((online: boolean) => {
    setVerifiedOfflineState(!online)
    setIsOnline(online)

    if (!online) {
      wasOfflineRef.current = true
      setJustReconnected(false)
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      return
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false
      setJustReconnected(true)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = setTimeout(() => {
        setJustReconnected(false)
        reconnectTimerRef.current = null
      }, 2800)
    }
  }, [])

  const recheckConnection = useCallback(async () => {
    setIsChecking(true)
    try {
      const reachable = await probeRealInternet()
      applyConnectivity(reachable)
      return reachable
    } finally {
      setIsChecking(false)
    }
  }, [applyConnectivity])

  const triggerOfflineNotice = useCallback((msg?: string) => {
    notifyOfflineWriteBlocked(msg)
  }, [])

  // 1. Surveillance réseau temps réel (navigator + sonde réelle + réveil PWA / Capacitor)
  useEffect(() => {
    const initialOnline = typeof navigator === 'undefined' ? true : navigator.onLine
    applyConnectivity(initialOnline)

    const onBrowserOffline = () => {
      applyConnectivity(false)
    }
    const onBrowserOnline = () => {
      void recheckConnection()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          applyConnectivity(false)
        } else if (wasOfflineRef.current) {
          void recheckConnection()
        }
      }
    }
    const onNetworkFailure = () => {
      void recheckConnection()
    }
    const onWriteBlocked = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail
      setWriteAlertMessage(detail?.message || 'Connectez-vous pour enregistrer')
      setWriteAlertTick((t) => t + 1)
    }

    window.addEventListener('offline', onBrowserOffline)
    window.addEventListener('online', onBrowserOnline)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener(NETWORK_FAILURE_EVENT, onNetworkFailure)
    window.addEventListener(OFFLINE_WRITE_BLOCKED_EVENT, onWriteBlocked)

    let capListener: { remove: () => Promise<void> } | undefined
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void recheckConnection()
      })
        .then((sub) => {
          capListener = sub
        })
        .catch(() => {})
    }

    // Sonde périodique légère uniquement tant qu'on est hors-ligne (pour détecter le retour d'un Wi-Fi)
    const retryInterval = setInterval(() => {
      if (wasOfflineRef.current && typeof navigator !== 'undefined' && navigator.onLine) {
        void recheckConnection()
      }
    }, 12000)

    return () => {
      window.removeEventListener('offline', onBrowserOffline)
      window.removeEventListener('online', onBrowserOnline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(NETWORK_FAILURE_EVENT, onNetworkFailure)
      window.removeEventListener(OFFLINE_WRITE_BLOCKED_EVENT, onWriteBlocked)
      clearInterval(retryInterval)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      void capListener?.remove()
    }
  }, [applyConnectivity, recheckConnection])

  // 2. Garde universelle anti-enregistrement hors-ligne (modèle WhatsApp : lecture 100% libre, zéro enregistrement offline)
  useEffect(() => {
    if (isOnline) return

    const onCaptureSubmit = (e: SubmitEvent) => {
      const currentPath = pathnameRef.current || ''
      // Autoriser le déverrouillage local par code PIN sur /profile-selection pour consulter les données hors-ligne !
      if (currentPath === '/profile-selection') return

      const form = e.target as HTMLFormElement | null
      if (form?.getAttribute('data-allow-offline') === 'true') return

      e.preventDefault()
      e.stopPropagation()
      notifyOfflineWriteBlocked('Connectez-vous pour enregistrer')
    }

    document.addEventListener('submit', onCaptureSubmit, true)
    return () => {
      document.removeEventListener('submit', onCaptureSubmit, true)
    }
  }, [isOnline])

  const value = useMemo<NetworkContextValue>(
    () => ({
      isOnline,
      isOffline: !isOnline,
      isChecking,
      justReconnected,
      writeAlertTick,
      writeAlertMessage,
      recheckConnection,
      triggerOfflineNotice,
    }),
    [
      isOnline,
      isChecking,
      justReconnected,
      writeAlertTick,
      writeAlertMessage,
      recheckConnection,
      triggerOfflineNotice,
    ]
  )

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
}
