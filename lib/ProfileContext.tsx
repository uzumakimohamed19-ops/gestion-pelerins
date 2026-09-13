'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { usePowerSync, useQuery } from '@powersync/react'
import { getUser } from '@/lib/supabase'
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
const SESSION_KEY = (userId: string) => `active_session_profile_${userId}`
const PROFILE_SNAPSHOT_KEY = (userId: string) => `active_profile_snapshot_${userId}`
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
    throw new Error('useWorkProfile doit être utilisé à l’intérieur d’un ProfileProvider')
  }
  return context
}

export function ProfileRouteGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading, canViewAmounts } = useWorkProfile()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (loading || !profile) return
    const protectedFinancialRoutes = [
      '/hajj/comptabilite',
      '/hajj/etat-general',
      '/agence/compta',
      '/agence/journal',
    ]

    if (!canViewAmounts && protectedFinancialRoutes.includes(pathname)) {
      router.replace('/hajj/dashboard')
    }
  }, [canViewAmounts, loading, pathname, profile, router])

  return <>{children}</>
}

export default function ProfileProvider({ children }: { children: React.ReactNode }) {
  const db = usePowerSync()
  const router = useRouter()
  const pathname = usePathname()

  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<WorkProfile | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [profileRestored, setProfileRestored] = useState(false)
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false)

  const lastActivityRef = useRef<number>(Date.now())

  // Récupération réactive PowerSync
  const { data: localProfiles = [], isLoading: isQueryLoading } = useQuery<WorkProfile>(
    'SELECT id, user_id, name, profile_type, pin_hash FROM account_profiles WHERE user_id = ? ORDER BY profile_type ASC, created_at ASC',
    [userId ?? '']
  )

  const loading = userLoading || isQueryLoading

  // Vérification de la disponibilité biométrique sur mobile
  useEffect(() => {
    async function checkBiometrics() {
      if (Capacitor.isNativePlatform()) {
        try {
          const result = await NativeBiometric.isAvailable()
          setIsBiometricAvailable(result.isAvailable)
        } catch {
          setIsBiometricAvailable(false)
        }
      }
    }
    checkBiometrics()
  }, [])

  // Initialisation utilisateur
  useEffect(() => {
    let isMounted = true
    async function initUser() {
      try {
        const { data } = await getUser()
        if (isMounted) setUserId(data.user?.id ?? null)
      } catch (err) {
        console.error('[ProfileProvider] Erreur auth:', err)
      } finally {
        if (isMounted) setUserLoading(false)
      }
    }
    initUser()
    return () => { isMounted = false }
  }, [])

  // Verrouillage de la session
  const clearProfile = useCallback(() => {
    setProfile(null)
    if (userId) {
      try {
        sessionStorage.removeItem(SESSION_KEY(userId))
        localStorage.removeItem(SESSION_KEY(userId))
        localStorage.removeItem(PROFILE_SNAPSHOT_KEY(userId))
        localStorage.removeItem(LAST_ACTIVITY_KEY(userId))
      } catch {
        // ignore
      }
    }
  }, [userId])

  // Enregistrement de l'activité utilisateur
  const updateActivity = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now
    if (userId) {
      try {
        localStorage.setItem(LAST_ACTIVITY_KEY(userId), String(now))
      } catch {
        // ignore
      }
    }
  }, [userId])

  // Restauration locale du profil actif. Le snapshot évite qu'une lecture
  // PowerSync momentanément vide verrouille l'application au rechargement.
  useEffect(() => {
    if (!userId) return

    try {
      const activeProfileId =
        localStorage.getItem(SESSION_KEY(userId)) ?? sessionStorage.getItem(SESSION_KEY(userId))
      const snapshot = localStorage.getItem(PROFILE_SNAPSHOT_KEY(userId))
      const storedLastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY(userId)) || '0')
      const now = Date.now()

      // Si inactif depuis plus de 15 minutes, forcer la re-vérification
      if (activeProfileId && storedLastActivity && now - storedLastActivity > INACTIVITY_TIMEOUT_MS) {
        clearProfile()
        return
      }

      if (activeProfileId) {
        let restoredProfile = localProfiles.find((p) => p.id === activeProfileId)

        if (!restoredProfile && snapshot) {
          try {
            const savedProfile = JSON.parse(snapshot) as WorkProfile
            if (savedProfile.id === activeProfileId && savedProfile.user_id === userId) {
              restoredProfile = savedProfile
            }
          } catch {
            localStorage.removeItem(PROFILE_SNAPSHOT_KEY(userId))
          }
        }

        if (restoredProfile) {
          setProfile(restoredProfile)
          updateActivity()
        }
      }
    } catch {
      // ignore
    } finally {
      setProfileRestored(true)
    }
  }, [userId, localProfiles, clearProfile, updateActivity])

  // Détection d'inactivité (Timer régulier + Événements DOM)
  useEffect(() => {
    if (!profile || !userId) return

    // Vérification toutes les 15 secondes
    const interval = setInterval(() => {
      const storedActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY(userId)) || lastActivityRef.current)
      if (Date.now() - storedActivity > INACTIVITY_TIMEOUT_MS) {
        clearProfile()
        router.replace('/profile-selection')
      }
    }, 15000)

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    const handleUserInteraction = () => updateActivity()

    events.forEach((evt) => window.addEventListener(evt, handleUserInteraction, { passive: true }))

    return () => {
      clearInterval(interval)
      events.forEach((evt) => window.removeEventListener(evt, handleUserInteraction))
    }
  }, [profile, userId, clearProfile, updateActivity, router])

  // Détection de reprise Capacitor (mise en veille / réveil du téléphone)
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !userId) return

    const listener = CapacitorApp.addListener('appStateChange', (state) => {
      if (state.isActive) {
        const storedActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY(userId)) || '0')
        if (storedActivity && Date.now() - storedActivity > INACTIVITY_TIMEOUT_MS) {
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

  // Redirection automatique si aucun profil de travail n'est actif
  useEffect(() => {
    if (loading || !userId || !profileRestored) return

    const isExempt =
      pathname === '/login' ||
      pathname === '/profile-selection' ||
      pathname.startsWith('/auth')

    if (!profile && !isExempt) {
      router.replace('/profile-selection')
    }
  }, [loading, pathname, profile, profileRestored, router, userId])

  // 1. Sélection classique par PIN
  const selectProfile = useCallback(
    async (candidate: WorkProfile, pin: string) => {
      if (!pin || pin.length < 4) {
        throw new Error('Le code PIN doit comporter au moins 4 chiffres.')
      }

      const inputHash = await hashPin(pin)
      if (inputHash !== candidate.pin_hash) {
        throw new Error('Code PIN incorrect. Veuillez réessayer.')
      }

      setProfile(candidate)
      updateActivity()
      if (userId) {
        try {
          localStorage.setItem(SESSION_KEY(userId), candidate.id)
          localStorage.setItem(PROFILE_SNAPSHOT_KEY(userId), JSON.stringify(candidate))
          sessionStorage.setItem(SESSION_KEY(userId), candidate.id)
        } catch {
          // ignore
        }
      }
    },
    [userId, updateActivity]
  )

  // 2. Déverrouillage biométrique (Touch ID / Face ID / Empreinte)
  const unlockWithBiometrics = useCallback(
    async (candidate: WorkProfile) => {
      if (!Capacitor.isNativePlatform()) {
        throw new Error('La biométrie est disponible uniquement sur mobile.')
      }

      await NativeBiometric.verifyIdentity({
        reason: `Déverrouiller le profil ${candidate.name}`,
        title: 'Authentification Biométrique',
        subtitle: 'Confirmez votre identité pour continuer',
        description: 'Placez votre doigt sur le capteur ou utilisez Face ID',
      })

      setProfile(candidate)
      updateActivity()
      if (userId) {
        try {
          localStorage.setItem(SESSION_KEY(userId), candidate.id)
          localStorage.setItem(PROFILE_SNAPSHOT_KEY(userId), JSON.stringify(candidate))
          sessionStorage.setItem(SESSION_KEY(userId), candidate.id)
        } catch {
          // ignore
        }
      }
    },
    [userId, updateActivity]
  )

  // 3. Création de profil
  const createProfile = useCallback(
    async (name: string, type: WorkProfileType, pin: string) => {
      if (!userId) throw new Error('Session utilisateur introuvable.')
      if (!name.trim()) throw new Error('Veuillez spécifier un nom de profil.')
      if (!/^[0-9]{4,6}$/.test(pin)) {
        throw new Error('Le code PIN doit comporter 4 à 6 chiffres.')
      }

      if (type === 'direction' && localProfiles.some((p) => p.profile_type === 'direction')) {
        throw new Error('Un profil Direction existe déjà pour ce compte.')
      }

      const currentAgents = localProfiles.filter((p) => p.profile_type === 'agent')
      if (type === 'agent' && currentAgents.length >= 2) {
        throw new Error('La limite de 2 profils Agents est atteinte.')
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

  // 4. Modification de PIN
  const updatePin = useCallback(
    async (profileId: string, oldPin: string, newPin: string) => {
      const target = localProfiles.find((p) => p.id === profileId)
      if (!target) throw new Error('Profil introuvable.')

      const oldHash = await hashPin(oldPin)
      if (oldHash !== target.pin_hash) {
        throw new Error('L’ancien code PIN est incorrect.')
      }

      if (!/^[0-9]{4,6}$/.test(newPin)) {
        throw new Error('Le nouveau code PIN doit comporter entre 4 et 6 chiffres.')
      }

      if (oldPin === newPin) {
        throw new Error('Le nouveau PIN doit être différent de l’ancien.')
      }

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
      loading,
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
      loading,
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