'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { usePowerSync, useQuery } from '@powersync/react'
import {
  requireSupabaseRows,
  supabase,
  getSession,
  getPersistedSupabaseUserId,
} from '@/lib/supabase'
import { clearAllLocalSessionArtifacts } from '@/lib/sessionCleanup'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { NativeBiometric } from '@capgo/capacitor-native-biometric'

export type WorkProfileType = 'direction' | 'agent' | 'intermediaire'
export type ComptaAccessLevel = 'full' | 'restricted' | 'none'

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
  currentProfile: WorkProfile | null
  profiles: WorkProfile[]
  userRole: string | null
  loading: boolean
  isDirection: boolean
  isIntermediaire: boolean
  canViewAmounts: boolean
  canAccessJournal: boolean
  canAccessHajjEtatGeneral: boolean
  comptaAccessLevel: ComptaAccessLevel
  isBiometricAvailable: boolean
  verifyProfilePin: (profile: WorkProfile, pin: string) => Promise<void>
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
const PIN_ATTEMPTS_KEY = (profileId: string) => `pin_attempts_${profileId}`

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000 // 30 secondes max entre deux écritures localStorage

async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Protection anti force-brute par profil :
 * - 5 essais ratés → blocage 30 secondes
 * - 8 essais ratés ou plus → blocage 2 minutes
 */
function checkPinLockout(profileId: string): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(PIN_ATTEMPTS_KEY(profileId))
    if (!raw) return
    const parsed = JSON.parse(raw) as { count?: number; lockedUntil?: number }
    if (parsed.lockedUntil && Date.now() < parsed.lockedUntil) {
      const remainingSec = Math.max(1, Math.ceil((parsed.lockedUntil - Date.now()) / 1000))
      throw new Error(
        `Trop de tentatives incorrectes. Réessayez dans ${remainingSec} seconde${remainingSec > 1 ? 's' : ''}.`
      )
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Trop de tentatives')) {
      throw err
    }
  }
}

function recordPinFailure(profileId: string): string {
  if (typeof window === 'undefined') return 'Code PIN incorrect.'
  try {
    const raw = localStorage.getItem(PIN_ATTEMPTS_KEY(profileId))
    const prev = raw ? (JSON.parse(raw) as { count?: number }) : { count: 0 }
    const count = (prev.count || 0) + 1
    let lockedUntil = 0
    if (count >= 8) {
      lockedUntil = Date.now() + 2 * 60 * 1000
    } else if (count >= 5) {
      lockedUntil = Date.now() + 30 * 1000
    }
    localStorage.setItem(PIN_ATTEMPTS_KEY(profileId), JSON.stringify({ count, lockedUntil }))
    if (lockedUntil > 0) {
      const secs = Math.ceil((lockedUntil - Date.now()) / 1000)
      return `Code PIN incorrect. Accès bloqué pendant ${secs}s par sécurité.`
    }
    const left = Math.max(1, 5 - count)
    if (count >= 3) {
      return `Code PIN incorrect (${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''} avant verrouillage temporaire).`
    }
  } catch {}
  return 'Code PIN incorrect.'
}

function resetPinFailures(profileId: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(PIN_ATTEMPTS_KEY(profileId))
  } catch {}
}

/**
 * Stocke uniquement les métadonnées publiques du profil actif (JAMAIS `pin_hash`)
 */
function persistSafeProfileSnapshot(userId: string, p: WorkProfile) {
  try {
    const safeSnapshot = {
      id: p.id,
      user_id: p.user_id,
      name: p.name,
      profile_type: p.profile_type,
    }
    localStorage.setItem(SESSION_PROFILE_ID_KEY(userId), p.id)
    localStorage.setItem(SESSION_PROFILE_DATA_KEY(userId), JSON.stringify(safeSnapshot))
    localStorage.setItem(`last_selected_profile_id_${userId}`, p.id)

    const accessLevel: ComptaAccessLevel =
      p.profile_type === 'direction'
        ? 'full'
        : p.profile_type === 'intermediaire'
        ? 'restricted'
        : 'none'
    localStorage.setItem('compta_access_level', accessLevel)
  } catch {}
}

function readSafeProfileSnapshot(userId: string, expectedId: string): WorkProfile | null {
  try {
    const cached = localStorage.getItem(SESSION_PROFILE_DATA_KEY(userId))
    if (!cached) return null
    const parsed = JSON.parse(cached) as Partial<WorkProfile>
    if (
      parsed.id === expectedId &&
      parsed.user_id === userId &&
      typeof parsed.name === 'string' &&
      (parsed.profile_type === 'direction' ||
        parsed.profile_type === 'agent' ||
        parsed.profile_type === 'intermediaire')
    ) {
      return {
        id: parsed.id,
        user_id: parsed.user_id,
        name: parsed.name,
        profile_type: parsed.profile_type,
      }
    }
  } catch {}
  return null
}

export function useWorkProfile() {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useWorkProfile doit être utilisé dans ProfileProvider')
  }
  return context
}

export function ProfileRouteGuard({ children }: { children: React.ReactNode }) {
  const {
    profile,
    userRole,
    loading,
    canViewAmounts,
    canAccessJournal,
    canAccessHajjEtatGeneral,
  } = useWorkProfile()
  const pathname = usePathname()
  const router = useRouter()

  const isFinancialRoute = useMemo(() => {
    if (!pathname) return false
    const norm = pathname.toLowerCase()
    return (
      norm.startsWith('/hajj/comptabilite') ||
      norm.startsWith('/hajj/virements') ||
      norm.startsWith('/hajj/etat-general') ||
      norm.startsWith('/agence/compta') ||
      norm.startsWith('/agence/journal')
    )
  }, [pathname])

  const isRestrictedForIntermediate = useMemo(() => {
    if (!pathname) return false
    const norm = pathname.toLowerCase()
    return (
      (!canAccessJournal && norm.startsWith('/agence/journal')) ||
      (!canAccessHajjEtatGeneral &&
        (norm.startsWith('/hajj/etat-general') || norm.includes('/etat-general')))
    )
  }, [pathname, canAccessJournal, canAccessHajjEtatGeneral])

  const isAdminOnlyRoute = useMemo(() => {
    if (!pathname) return false
    return pathname.toLowerCase().startsWith('/hajj/admin')
  }, [pathname])

  const isBlockedAdmin = useMemo(() => {
    if (!isAdminOnlyRoute || !userRole) return false
    const r = userRole.toLowerCase()
    return r !== 'admin' && r !== 'super_admin'
  }, [isAdminOnlyRoute, userRole])

  useEffect(() => {
    if (loading || !profile) return

    if (isBlockedAdmin) {
      router.replace('/hajj/dashboard')
      return
    }

    if (!canViewAmounts && isFinancialRoute) {
      router.replace(pathname?.startsWith('/hajj') ? '/hajj/dashboard' : '/agence/dashboard')
      return
    }

    if (isRestrictedForIntermediate) {
      router.replace(pathname?.startsWith('/hajj') ? '/hajj/dashboard' : '/agence/dashboard')
    }
  }, [
    canViewAmounts,
    isBlockedAdmin,
    isFinancialRoute,
    isRestrictedForIntermediate,
    loading,
    pathname,
    profile,
    router,
  ])

  if (!loading && profile) {
    if (isBlockedAdmin) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F4F6F8] p-4">
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm text-center max-w-sm">
            <p className="text-sm font-black text-slate-900 uppercase">Accès Administrateur Requis</p>
            <p className="text-xs text-slate-500 mt-1">
              Cette section est réservée aux administrateurs autorisés.
            </p>
          </div>
        </div>
      )
    }

    if (!canViewAmounts && isFinancialRoute) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F4F6F8] p-4">
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm text-center max-w-sm">
            <p className="text-sm font-black text-slate-900 uppercase">Accès Réservé</p>
            <p className="text-xs text-slate-500 mt-1">
              Section financière réservée à la Direction et aux Superviseurs.
            </p>
          </div>
        </div>
      )
    }

    if (isRestrictedForIntermediate) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F4F6F8] p-4">
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm text-center max-w-sm">
            <p className="text-sm font-black text-slate-900 uppercase">Accès Direction Requis</p>
            <p className="text-xs text-slate-500 mt-1">
              Cette section est strictement réservée à la Direction.
            </p>
          </div>
        </div>
      )
    }
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
  const [profileHydrated, setProfileHydrated] = useState(false)
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false)
  const [cachedRole, setCachedRole] = useState<string | null>(null)

  const lastActivityWriteRef = useRef<number>(0)
  const activeUserIdRef = useRef<string | null>(null)

  // 1. Récupération immédiate (0 ms) depuis le vrai jeton Supabase persisté + confirmation async
  useEffect(() => {
    let isMounted = true

    const persistedUid = getPersistedSupabaseUserId()
    if (persistedUid) {
      activeUserIdRef.current = persistedUid
      setUserId(persistedUid)
      try {
        const r = localStorage.getItem(`cached_user_role_${persistedUid}`)
        if (r) setCachedRole(r)
      } catch {}
    }

    getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return
        const currentId = session?.user?.id ?? null
        activeUserIdRef.current = currentId
        setUserId(currentId)
        setAuthInitialized(true)
      })
      .catch(() => {
        if (!isMounted) return
        const fallbackUid = getPersistedSupabaseUserId()
        activeUserIdRef.current = fallbackUid
        setUserId(fallbackUid)
        setAuthInitialized(true)
      })

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return

      if (event === 'SIGNED_OUT') {
        activeUserIdRef.current = null
        setProfile(null)
        setUserId(null)
        setCachedRole(null)
        setProfileHydrated(true)
        setAuthInitialized(true)
        clearAllLocalSessionArtifacts()
        return
      }

      const currentId = session?.user?.id ?? null
      const userChanged = Boolean(activeUserIdRef.current && currentId && activeUserIdRef.current !== currentId)

      if (currentId) {
        activeUserIdRef.current = currentId
        setUserId(currentId)
      }
      setAuthInitialized(true)

      if (userChanged) {
        setProfile(null)
        setProfileHydrated(false)
      }
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  // 2. Profils de travail + rôle Supabase via SQLite PowerSync
  const { data: localProfiles = [], isLoading: isQueryLoading } = useQuery<WorkProfile>(
    'SELECT id, user_id, name, profile_type, pin_hash FROM account_profiles WHERE user_id = ? ORDER BY profile_type ASC, created_at ASC',
    [userId ?? '']
  )

  const { data: userProfileRows = [] } = useQuery<{ role: string | null }>(
    'SELECT role FROM profiles WHERE id = ? LIMIT 1',
    [userId ?? '']
  )

  const userRole = userProfileRows[0]?.role ?? cachedRole

  useEffect(() => {
    if (userId && userProfileRows[0]?.role) {
      setCachedRole(userProfileRows[0].role)
      try {
        localStorage.setItem(`cached_user_role_${userId}`, userProfileRows[0].role)
      } catch {}
    }
  }, [userId, userProfileRows])

  // 3. Secours Supabase direct si SQLite local est encore vide (nouvel appareil)
  useEffect(() => {
    if (!userId || localProfiles.length > 0) return

    let isMounted = true
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('account_profiles')
          .select('id, user_id, name, profile_type, pin_hash, created_at, updated_at')
          .eq('user_id', userId)

        if (!isMounted || error || !data || data.length === 0) return

        for (const item of data) {
          try {
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
            )
          } catch {}
        }
      } catch {}
    })()

    return () => {
      isMounted = false
    }
  }, [userId, localProfiles.length, db])

  // 4. Test biométrie native Capacitor
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      NativeBiometric.isAvailable()
        .then((res) => setIsBiometricAvailable(res.isAvailable))
        .catch(() => setIsBiometricAvailable(false))
    }
  }, [])

  const updateActivity = useCallback(
    (force = false) => {
      if (!userId) return
      const now = Date.now()
      if (!force && now - lastActivityWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) {
        return
      }
      lastActivityWriteRef.current = now
      try {
        localStorage.setItem(LAST_ACTIVITY_KEY(userId), String(now))
      } catch {}
    },
    [userId]
  )

  const clearProfile = useCallback(() => {
    setProfile(null)
    if (userId) {
      try {
        localStorage.removeItem(SESSION_PROFILE_ID_KEY(userId))
        localStorage.removeItem(SESSION_PROFILE_DATA_KEY(userId))
        localStorage.removeItem(LAST_ACTIVITY_KEY(userId))
        localStorage.removeItem('compta_access_level')
      } catch {}
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setProfileHydrated(true)
      return
    }
    setProfile((current) => (current && current.user_id !== userId ? null : current))
  }, [userId])

  const lockIfInactive = useCallback(() => {
    if (!userId) return false

    try {
      const storedId = localStorage.getItem(SESSION_PROFILE_ID_KEY(userId))
      if (!storedId) {
        setProfile(null)
        return true
      }

      const storedRaw = localStorage.getItem(LAST_ACTIVITY_KEY(userId))
      if (!storedRaw) {
        updateActivity(true)
        return false
      }

      const storedTime = Number(storedRaw)
      if (storedTime > 0 && Date.now() - storedTime > INACTIVITY_TIMEOUT_MS) {
        clearProfile()
        if (
          pathname !== '/profile-selection' &&
          pathname !== '/login' &&
          !pathname?.startsWith('/auth')
        ) {
          router.replace('/profile-selection')
        }
        return true
      }
    } catch {}

    return false
  }, [clearProfile, pathname, router, updateActivity, userId])

  // 5. Restauration immédiate (en ligne + hors-ligne) sans race condition au rechargement
  useEffect(() => {
    if (!userId) return

    try {
      const storedId = localStorage.getItem(SESSION_PROFILE_ID_KEY(userId))
      const storedRaw = localStorage.getItem(LAST_ACTIVITY_KEY(userId))

      if (!storedId) {
        setProfileHydrated(true)
        return
      }

      if (storedRaw) {
        const storedTime = Number(storedRaw)
        if (storedTime > 0 && Date.now() - storedTime > INACTIVITY_TIMEOUT_MS) {
          clearProfile()
          setProfileHydrated(true)
          if (
            pathname !== '/profile-selection' &&
            pathname !== '/login' &&
            !pathname?.startsWith('/auth')
          ) {
            router.replace('/profile-selection')
          }
          return
        }
      }

      // Priorité à SQLite local ; repli immédiat sur le snapshot sécurisé (même en ligne pendant les 100ms d'init SQLite)
      const fromSqlite = localProfiles.find((p) => p.id === storedId && p.user_id === userId)
      const current = fromSqlite ?? readSafeProfileSnapshot(userId, storedId)

      if (current) {
        setProfile(current)
        updateActivity(false)
        const level: ComptaAccessLevel =
          current.profile_type === 'direction'
            ? 'full'
            : current.profile_type === 'intermediaire'
            ? 'restricted'
            : 'none'
        localStorage.setItem('compta_access_level', level)
      }
      setProfileHydrated(true)
    } catch {
      setProfileHydrated(true)
    }
  }, [userId, localProfiles, clearProfile, updateActivity, pathname, router])

  // 6. Inactivité 15 min + réveil instantané Web/PWA (`visibilitychange`) + synchro multi-onglets (`storage`)
  useEffect(() => {
    if (!profile || !userId) return

    const interval = setInterval(() => {
      lockIfInactive()
    }, 15000)

    const onAction = () => updateActivity(false)
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        lockIfInactive()
      }
    }
    const onStorageSync = (e: StorageEvent) => {
      if (!e.key) return
      if (e.key === SESSION_PROFILE_ID_KEY(userId) && !e.newValue) {
        setProfile(null)
        if (
          pathname !== '/profile-selection' &&
          pathname !== '/login' &&
          !pathname?.startsWith('/auth')
        ) {
          router.replace('/profile-selection')
        }
      }
    }

    const events = ['mousedown', 'keydown', 'touchstart'] as const
    events.forEach((evt) => window.addEventListener(evt, onAction, { passive: true }))
    document.addEventListener('visibilitychange', onVisibilityOrFocus)
    window.addEventListener('focus', onVisibilityOrFocus)
    window.addEventListener('storage', onStorageSync)

    return () => {
      clearInterval(interval)
      events.forEach((evt) => window.removeEventListener(evt, onAction))
      document.removeEventListener('visibilitychange', onVisibilityOrFocus)
      window.removeEventListener('focus', onVisibilityOrFocus)
      window.removeEventListener('storage', onStorageSync)
    }
  }, [profile, userId, lockIfInactive, updateActivity, pathname, router])

  // Réveil natif Capacitor
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !userId) return

    const listener = CapacitorApp.addListener('appStateChange', (state) => {
      if (state.isActive) {
        if (!lockIfInactive()) {
          updateActivity(true)
        }
      }
    })

    return () => {
      listener.then((sub) => sub.remove())
    }
  }, [userId, lockIfInactive, updateActivity])

  // Redirection vers /profile-selection uniquement une fois la restauration terminée
  useEffect(() => {
    if (!authInitialized || !profileHydrated || !userId) return
    if (isQueryLoading && !profile) return

    const isExempt =
      pathname === '/login' ||
      pathname === '/profile-selection' ||
      pathname?.startsWith('/auth')

    if (!profile && !isExempt) {
      router.replace('/profile-selection')
    }
  }, [authInitialized, profileHydrated, isQueryLoading, pathname, profile, router, userId])

  /**
   * Vérifie le PIN d'un profil (ex: autorisation Directeur Principal) SANS ouvrir sa session !
   */
  const verifyProfilePin = useCallback(
    async (candidate: WorkProfile, pin: string) => {
      if (!userId || candidate.user_id !== userId) {
        throw new Error('Profil indisponible pour cette session.')
      }
      if (!pin || !/^[0-9]{4,6}$/.test(pin)) {
        throw new Error('Le code PIN doit comporter 4 à 6 chiffres.')
      }

      checkPinLockout(candidate.id)

      const inputHash = await hashPin(pin)
      if (inputHash !== candidate.pin_hash) {
        const msg = recordPinFailure(candidate.id)
        throw new Error(msg)
      }

      resetPinFailures(candidate.id)
    },
    [userId]
  )

  const selectProfile = useCallback(
    async (candidate: WorkProfile, pin: string) => {
      await verifyProfilePin(candidate, pin)
      setProfile(candidate)
      updateActivity(true)
      if (userId) {
        persistSafeProfileSnapshot(userId, candidate)
      }
    },
    [userId, updateActivity, verifyProfilePin]
  )

  const unlockWithBiometrics = useCallback(
    async (candidate: WorkProfile) => {
      if (!userId || candidate.user_id !== userId) {
        throw new Error('Profil indisponible pour cette session.')
      }
      if (!Capacitor.isNativePlatform()) {
        throw new Error('Biométrie disponible uniquement sur mobile.')
      }

      await NativeBiometric.verifyIdentity({
        reason: `Déverrouiller le profil ${candidate.name}`,
        title: 'Authentification Biométrique',
        subtitle: 'Confirmez votre identité',
        description: 'Empreinte digitale ou reconnaissance faciale',
      })

      resetPinFailures(candidate.id)
      setProfile(candidate)
      updateActivity(true)
      persistSafeProfileSnapshot(userId, candidate)
    },
    [userId, updateActivity]
  )

  const createProfile = useCallback(
    async (name: string, type: WorkProfileType, pin: string) => {
      if (!userId) throw new Error('Session utilisateur introuvable.')
      if (!name.trim()) throw new Error('Nom requis.')
      if (!/^[0-9]{4,6}$/.test(pin)) throw new Error('Le PIN doit comporter 4 à 6 chiffres.')

      const directions = localProfiles.filter((p) => p.profile_type === 'direction')
      if (type === 'direction' && directions.length >= 2) {
        throw new Error('Limite de 2 profils Direction atteinte.')
      }

      const agents = localProfiles.filter((p) => p.profile_type === 'agent')
      if (type === 'agent' && agents.length >= 2) {
        throw new Error('Limite de 2 profils Agents atteinte.')
      }

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const pinHash = await hashPin(pin)
      const newProfile = {
        id,
        user_id: userId,
        name: name.trim(),
        profile_type: type,
        pin_hash: pinHash,
        created_at: now,
        updated_at: now,
      }
      const { error } = await supabase.from('account_profiles').insert(newProfile)
      if (error) throw error

      await db.execute(
        `INSERT OR REPLACE INTO account_profiles (id, user_id, name, profile_type, pin_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newProfile.id,
          newProfile.user_id,
          newProfile.name,
          newProfile.profile_type,
          newProfile.pin_hash,
          newProfile.created_at,
          newProfile.updated_at,
        ]
      )
    },
    [db, userId, localProfiles]
  )

  const updatePin = useCallback(
    async (profileId: string, oldPin: string, newPin: string) => {
      const target = localProfiles.find((p) => p.id === profileId)
      if (!target) throw new Error('Profil introuvable.')

      await verifyProfilePin(target, oldPin)

      if (!/^[0-9]{4,6}$/.test(newPin)) {
        throw new Error('Le nouveau PIN doit comporter 4 à 6 chiffres.')
      }

      const newHash = await hashPin(newPin)
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('account_profiles')
        .update({ pin_hash: newHash, updated_at: now })
        .eq('id', profileId)
        .select('id')
      requireSupabaseRows(data, error, 'mise à jour du PIN')

      await db.execute(
        `UPDATE account_profiles SET pin_hash = ?, updated_at = ? WHERE id = ?`,
        [newHash, now, profileId]
      )

      setProfile((prev) => (prev?.id === profileId ? { ...prev, pin_hash: newHash } : prev))
    },
    [db, localProfiles, verifyProfilePin]
  )

  const isDirection = profile?.profile_type === 'direction'
  const isIntermediaire = profile?.profile_type === 'intermediaire'
  const canViewAmounts = isDirection || isIntermediaire
  const canAccessJournal = isDirection
  const canAccessHajjEtatGeneral = isDirection
  const comptaAccessLevel: ComptaAccessLevel = isDirection
    ? 'full'
    : isIntermediaire
    ? 'restricted'
    : 'none'

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      currentProfile: profile,
      profiles: localProfiles,
      userRole,
      loading: !authInitialized || !profileHydrated || (Boolean(userId) && !profile && isQueryLoading),
      isDirection,
      isIntermediaire,
      canViewAmounts,
      canAccessJournal,
      canAccessHajjEtatGeneral,
      comptaAccessLevel,
      isBiometricAvailable,
      verifyProfilePin,
      selectProfile,
      unlockWithBiometrics,
      createProfile,
      updatePin,
      clearProfile,
    }),
    [
      profile,
      localProfiles,
      userRole,
      authInitialized,
      profileHydrated,
      userId,
      isQueryLoading,
      isDirection,
      isIntermediaire,
      canViewAmounts,
      canAccessJournal,
      canAccessHajjEtatGeneral,
      comptaAccessLevel,
      isBiometricAvailable,
      verifyProfilePin,
      selectProfile,
      unlockWithBiometrics,
      createProfile,
      updatePin,
      clearProfile,
    ]
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
