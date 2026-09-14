'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { usePowerSync, useQuery } from '@powersync/react'
import { supabase } from '@/lib/supabase'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { NativeBiometric } from '@capgo/capacitor-native-biometric'

export type WorkProfileType = 'direction' | 'agent'

export type WorkProfile = {
  id: string
  user_id: string
  name: string
  profile_type: WorkProfileType
  pin_hash?: string | null
  created_at?: string
  updated_at?: string
}

type ProfileContextValue = {
  profile: WorkProfile | null
  profiles: WorkProfile[]
  loading: boolean
  isDirection: boolean
  canViewAmounts: boolean
  isBiometricAvailable: boolean
  selectProfile: (profile: WorkProfile, pin: string) => Promise<void>
  unlockWithBiometrics: (profile: WorkProfile) => Promise<void>
  createProfile: (name: string, type: WorkProfileType, pin: string) => Promise<void>
  updatePin: (profileId: string, oldPin: string, newPin: string) => Promise<void>
  clearProfile: () => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)
const SESSION_PROFILE_ID_KEY = (userId: string) => `active_profile_id_${userId}`
const SESSION_PROFILE_DATA_KEY = (userId: string) => `active_profile_data_${userId}`
const LAST_ACTIVITY_KEY = (userId: string) => `profile_last_activity_${userId}`
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function useWorkProfile() {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useWorkProfile doit être utilisé dans ProfileProvider')
  }
  return context
}

export function ProfileRouteGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading, canViewAmounts } = useWorkProfile()
  const pathname = usePathname()
  const router = useRouter()

  const isFinancialRoute = useMemo(() => {
    if (!pathname) return false
    const norm = pathname.toLowerCase()
    return (
      norm.startsWith('/hajj/comptabilite') ||
      norm.startsWith('/hajj/etat-general') ||
      norm.startsWith('/agence/compta') ||
      norm.startsWith('/agence/journal')
    )
  }, [pathname])

  useEffect(() => {
    if (loading || !profile) return
    if (!canViewAmounts && isFinancialRoute) {
      router.replace('/hajj/dashboard')
    }
  }, [canViewAmounts, isFinancialRoute, loading, profile, router])

  if (!loading && profile && !canViewAmounts && isFinancialRoute) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F4F6F8]">
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm text-center max-w-sm">
          <p className="text-sm font-black text-slate-900 uppercase">Accès Réservé</p>
          <p className="text-xs text-slate-500 mt-1">
            Section réservée au profil Direction.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default function ProfileProvider({ children }: { children: React.ReactNode }) {
  const db = usePowerSync()
  const router = useRouter()
  const pathname = usePathname()

  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<WorkProfile | null>(null)
  const [authInitialized, setAuthInitialized] = useState(false)
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false)

  const lastActivityRef = useRef<number>(Date.now())

  // 1. Écoute dynamique de la session Supabase (se met à jour dès le clic sur Connexion)
  useEffect(() => {
    let isMounted = true

    // Check immédiat
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setUserId(session?.user?.id ?? null)
        setAuthInitialized(true)
      }
    }).catch(() => {
      if (isMounted) setAuthInitialized(true)
    })

    // Écouteur temps réel des connexions / déconnexions
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return
      const currentId = session?.user?.id ?? null
      setUserId(currentId)
      setAuthInitialized(true)

      if (event === 'SIGNED_OUT' || !currentId) {
        setProfile(null)
      }
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  // 2. Récupération réactive SQLite PowerSync dès que userId est disponible
  const { data: localProfiles = [], isLoading: isQueryLoading } = useQuery<WorkProfile>(
    'SELECT id, user_id, name, profile_type, pin_hash FROM account_profiles WHERE user_id = ? ORDER BY profile_type ASC, created_at ASC',
    [userId ?? '']
  )

  // 3. Fallback immédiat vers Supabase si SQLite local est vide (nouvel appareil)
  useEffect(() => {
    if (!userId || localProfiles.length > 0) return

    let isMounted = true
    supabase
      .from('account_profiles')
      .select('id, user_id, name, profile_type, pin_hash, created_at, updated_at')
      .eq('user_id', userId)
      .then(async ({ data, error }) => {
        if (!isMounted || error || !data || data.length === 0) return

        for (const item of data) {
          await db.execute(
            `INSERT OR REPLACE INTO account_profiles (id, user_id, name, profile_type, pin_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              item.user_id,
              item.name,
              item.profile_type,
              item.pin_hash,
              item.created_at || new Date().toISOString(),
              item.updated_at || new Date().toISOString(),
            ]
          ).catch(() => {})
        }
      })

    return () => {
      isMounted = false
    }
  }, [userId, localProfiles.length, db])

  // 4. Test biométrie
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      NativeBiometric.isAvailable()
        .then((res) => setIsBiometricAvailable(res.isAvailable))
        .catch(() => setIsBiometricAvailable(false))
    }
  }, [])

  const updateActivity = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now
    if (userId) {
      try {
        localStorage.setItem(LAST_ACTIVITY_KEY(userId), String(now))
      } catch {}
    }
  }, [userId])

  const clearProfile = useCallback(() => {
    setProfile(null)
    if (userId) {
      try {
        localStorage.removeItem(SESSION_PROFILE_ID_KEY(userId))
        localStorage.removeItem(SESSION_PROFILE_DATA_KEY(userId))
        localStorage.removeItem(LAST_ACTIVITY_KEY(userId))
      } catch {}
    }
  }, [userId])

  // 5. Restauration de session sans fausse déconnexion
  useEffect(() => {
    if (!userId) return

    try {
      const storedId = localStorage.getItem(SESSION_PROFILE_ID_KEY(userId))
      const storedRaw = localStorage.getItem(LAST_ACTIVITY_KEY(userId))

      if (!storedId) return

      if (storedRaw) {
        const storedTime = Number(storedRaw)
        if (storedTime > 0 && Date.now() - storedTime > INACTIVITY_TIMEOUT_MS) {
          clearProfile()
          return
        }
      }

      let current = localProfiles.find((p) => p.id === storedId)
      if (!current) {
        const cached = localStorage.getItem(SESSION_PROFILE_DATA_KEY(userId))
        if (cached) {
          try {
            const parsed = JSON.parse(cached)
            if (parsed.id === storedId) current = parsed
          } catch {}
        }
      }

      if (current) {
        setProfile(current)
        updateActivity()
      }
    } catch {}
  }, [userId, localProfiles, clearProfile, updateActivity])

  // Inactivité 15 min
  useEffect(() => {
    if (!profile || !userId) return

    const interval = setInterval(() => {
      const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY(userId)) || lastActivityRef.current)
      if (Date.now() - stored > INACTIVITY_TIMEOUT_MS) {
        clearProfile()
        router.replace('/profile-selection')
      }
    }, 15000)

    const onAction = () => updateActivity()
    const events = ['mousedown', 'keydown', 'touchstart']
    events.forEach((evt) => window.addEventListener(evt, onAction, { passive: true }))

    return () => {
      clearInterval(interval)
      events.forEach((evt) => window.removeEventListener(evt, onAction))
    }
  }, [profile, userId, clearProfile, updateActivity, router])

  // Inactivité réveil Capacitor
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !userId) return

    const listener = CapacitorApp.addListener('appStateChange', (state) => {
      if (state.isActive) {
        const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY(userId)) || '0')
        if (stored > 0 && Date.now() - stored > INACTIVITY_TIMEOUT_MS) {
          clearProfile()
          router.replace('/profile-selection')
        } else {
          updateActivity()
        }
      }
    })

    return () => {
      listener.then((sub) => sub.remove())
    }
  }, [userId, clearProfile, updateActivity, router])

  // Redirection automatique si aucun profil de travail actif
  useEffect(() => {
    if (!authInitialized || !userId) return

    const isExempt =
      pathname === '/login' ||
      pathname === '/profile-selection' ||
      pathname.startsWith('/auth')

    if (!profile && !isExempt) {
      router.replace('/profile-selection')
    }
  }, [authInitialized, pathname, profile, router, userId])

  const selectProfile = useCallback(
    async (candidate: WorkProfile, pin: string) => {
      if (!pin || pin.length < 4) throw new Error('Le code PIN doit comporter au moins 4 chiffres.')

      const inputHash = await hashPin(pin)
      if (inputHash !== candidate.pin_hash) throw new Error('Code PIN incorrect.')

      setProfile(candidate)
      updateActivity()

      if (userId) {
        try {
          localStorage.setItem(SESSION_PROFILE_ID_KEY(userId), candidate.id)
          localStorage.setItem(SESSION_PROFILE_DATA_KEY(userId), JSON.stringify(candidate))
        } catch {}
      }
    },
    [userId, updateActivity]
  )

  const unlockWithBiometrics = useCallback(
    async (candidate: WorkProfile) => {
      if (!Capacitor.isNativePlatform()) throw new Error('Biométrie disponible uniquement sur mobile.')

      await NativeBiometric.verifyIdentity({
        reason: `Déverrouiller le profil ${candidate.name}`,
        title: 'Authentification Biométrique',
        subtitle: 'Confirmez votre identité',
        description: 'Empreinte digitale ou reconnaissance faciale',
      })

      setProfile(candidate)
      updateActivity()

      if (userId) {
        try {
          localStorage.setItem(SESSION_PROFILE_ID_KEY(userId), candidate.id)
          localStorage.setItem(SESSION_PROFILE_DATA_KEY(userId), JSON.stringify(candidate))
        } catch {}
      }
    },
    [userId, updateActivity]
  )

  const createProfile = useCallback(
    async (name: string, type: WorkProfileType, pin: string) => {
      if (!userId) throw new Error('Session utilisateur introuvable.')
      if (!name.trim()) throw new Error('Nom requis.')
      if (!/^[0-9]{4,6}$/.test(pin)) throw new Error('Le PIN doit comporter 4 à 6 chiffres.')

      if (type === 'direction' && localProfiles.some((p) => p.profile_type === 'direction')) {
        throw new Error('Un profil Direction existe déjà.')
      }

      const agents = localProfiles.filter((p) => p.profile_type === 'agent')
      if (type === 'agent' && agents.length >= 2) {
        throw new Error('Limite de 2 profils Agents atteinte.')
      }

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const pinHash = await hashPin(pin)

      await db.execute(
        `INSERT INTO account_profiles (id, user_id, name, profile_type, pin_hash, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, name.trim(), type, pinHash, now, now]
      )
    },
    [db, userId, localProfiles]
  )

  const updatePin = useCallback(
    async (profileId: string, oldPin: string, newPin: string) => {
      const target = localProfiles.find((p) => p.id === profileId)
      if (!target) throw new Error('Profil introuvable.')

      const oldHash = await hashPin(oldPin)
      if (oldHash !== target.pin_hash) throw new Error('Ancien code PIN incorrect.')

      if (!/^[0-9]{4,6}$/.test(newPin)) throw new Error('Le nouveau PIN doit comporter 4 à 6 chiffres.')

      const newHash = await hashPin(newPin)
      const now = new Date().toISOString()

      await db.execute(
        `UPDATE account_profiles SET pin_hash = ?, updated_at = ? WHERE id = ?`,
        [newHash, now, profileId]
      )

      setProfile((prev) => (prev?.id === profileId ? { ...prev, pin_hash: newHash } : prev))
    },
    [db, localProfiles]
  )

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      profiles: localProfiles,
      loading: !authInitialized || (Boolean(userId) && isQueryLoading),
      isDirection: profile?.profile_type === 'direction',
      canViewAmounts: profile?.profile_type === 'direction',
      isBiometricAvailable,
      selectProfile,
      unlockWithBiometrics,
      createProfile,
      updatePin,
      clearProfile,
    }),
    [
      profile,
      localProfiles,
      authInitialized,
      userId,
      isQueryLoading,
      isBiometricAvailable,
      selectProfile,
      unlockWithBiometrics,
      createProfile,
      updatePin,
      clearProfile,
    ]
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}