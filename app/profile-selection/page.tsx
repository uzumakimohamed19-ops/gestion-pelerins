'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Delete,
  Fingerprint,
  KeyRound,
  ArrowRight,
  Lock,
  X,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  Landmark,
  Briefcase,
  Loader2,
  Star,
} from 'lucide-react'
import { useWorkProfile, type WorkProfile, type WorkProfileType } from '@/lib/ProfileContext'
import { usePowerSync, useQuery } from '@powersync/react'
import { requireSupabaseRows, supabase, getUser } from '@/lib/supabase'

export type ExtendedProfileType = WorkProfileType | 'intermediaire'

export default function ProfileSelectionPage() {
  const router = useRouter()
  const db = usePowerSync()

  const {
    profiles,
    loading: profilesLoading,
    isBiometricAvailable,
    selectProfile,
    unlockWithBiometrics,
    createProfile,
    updatePin,
  } = useWorkProfile()

  // 1. Initialisation verrouillée sur l'animation orbitale
  const [isInitializing, setIsInitializing] = useState(true)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [pinScreenOpen, setPinScreenOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [nomAgence, setNomAgence] = useState<string>('')

  // États du carrousel tactile mobile
  const [activeIndex, setActiveIndex] = useState<number>(0)
  const [dragOffset, setDragOffset] = useState<number>(0)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const hasSwipedRef = useRef<boolean>(false)

  // Modales d'action
  const [modalCreateOpen, setModalCreateOpen] = useState(false)
  const [modalPinOpen, setModalPinOpen] = useState(false)

  // 🛡️ Modale d'autorisation Direction (PIN Directeur Principal requis)
  const [modalAdminPinOpen, setModalAdminPinOpen] = useState(false)
  const [adminPin, setAdminPin] = useState('')
  const [pendingAction, setPendingAction] = useState<
    | { type: 'CREATE'; profileType: ExtendedProfileType }
    | { type: 'DELETE'; profileId: string; profileName: string }
    | { type: 'SET_MAIN_DIRECTION'; profileId: string }
    | null
  >(null)

  // Direction Principale ID (persistance locale)
  const [mainDirectionId, setMainDirectionId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('main_direction_profile_id')
    }
    return null
  })

  // Saisie du PIN (déverrouillage principal)
  const [pin, setPin] = useState('')

  const pinInputProps = {
    autoComplete: 'one-time-code',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    'data-1p-ignore': 'true',
    'data-lpignore': 'true',
    'data-bwignore': 'true',
    'data-form-type': 'other',
    'data-bitwarden-watching': 'false',
    'data-ccpignore': 'true',
    style: {
      WebkitTextSecurity: 'disc',
      textSecurity: 'disc',
    } as React.CSSProperties,
  } as const

  // Champs création
  const [name, setName] = useState('')
  const [type, setType] = useState<ExtendedProfileType>('agent')
  const [createPin, setCreatePin] = useState('')

  // Champs modification PIN
  const [targetProfileId, setTargetProfileId] = useState<string | null>(null)
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  // Messages & feedback
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Nom d'agence via PowerSync SQLite (avec cache local)
  const { data: agenceData } = useQuery<{ nom_agence: string }>(
    `SELECT a.nom_agence
     FROM profiles p
     JOIN agences a ON p.agence_id = a.id
     WHERE p.id = ?
     LIMIT 1`,
    [currentUserId ?? '']
  )

  useEffect(() => {
    if (!currentUserId) return
    try {
      const cached = localStorage.getItem(`cached_nom_agence_${currentUserId}`)
      if (cached) setNomAgence(cached)
    } catch {}
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId || !agenceData || agenceData.length === 0) return
    const agenceLocale = agenceData[0]?.nom_agence
    if (agenceLocale) {
      setNomAgence(agenceLocale)
      try {
        localStorage.setItem(`cached_nom_agence_${currentUserId}`, agenceLocale)
      } catch {}
    }
  }, [agenceData, currentUserId])

  // 2. Vérification locale + secours Supabase direct
  useEffect(() => {
    let isMounted = true

    async function resolveProfiles() {
      try {
        if (profilesLoading) return

        const { data: authData } = await getUser()
        const uid = authData.user?.id

        if (!uid) {
          if (isMounted) {
            setModalCreateOpen(false)
            setIsInitializing(false)
            router.replace('/login')
          }
          return
        }

        if (isMounted) setCurrentUserId(uid)

        const savedLastProfileId = localStorage.getItem(`last_selected_profile_id_${uid}`)

        // Étape A : Vérification dans SQLite local
        const localRows = await db.getAll<{ id: string; profile_type: string }>(
          'SELECT id, profile_type FROM account_profiles WHERE user_id = ?',
          [uid]
        ).catch(() => [])

        if (localRows && localRows.length > 0) {
          if (isMounted) {
            const validSavedId =
              savedLastProfileId && localRows.some((p) => p.id === savedLastProfileId)
                ? savedLastProfileId
                : localRows[0].id

            setSelectedProfileId(validSavedId)
            setModalCreateOpen(false)
            setIsInitializing(false)
            try {
              localStorage.setItem('has_created_profile_marker', 'true')
            } catch {}
          }
          return
        }

        // Étape B : Secours Supabase distant (première synchro)
        const { data: remoteProfiles } = await supabase
          .from('account_profiles')
          .select('id, name, profile_type, pin_hash, created_at, updated_at')
          .eq('user_id', uid)

        if (remoteProfiles && remoteProfiles.length > 0) {
          try {
            localStorage.setItem('has_created_profile_marker', 'true')
          } catch {}

          for (const item of remoteProfiles) {
            await db.execute(
              `INSERT OR REPLACE INTO account_profiles (id, user_id, name, profile_type, pin_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id,
                uid,
                item.name,
                item.profile_type,
                item.pin_hash,
                item.created_at || new Date().toISOString(),
                item.updated_at || new Date().toISOString(),
              ]
            ).catch(() => {})
          }

          if (isMounted) {
            const validSavedId =
              savedLastProfileId && remoteProfiles.some((p) => p.id === savedLastProfileId)
                ? savedLastProfileId
                : remoteProfiles[0].id

            setSelectedProfileId(validSavedId)
            setModalCreateOpen(false)
            setIsInitializing(false)
          }
          return
        }

        // Étape C : Aucun profil existant
        if (isMounted) {
          setModalCreateOpen(true)
          setIsInitializing(false)
        }
      } catch (err) {
        console.error('[ProfileSelection] Erreur résolution profil:', err)
        if (isMounted) setIsInitializing(false)
      }
    }

    resolveProfiles()

    return () => {
      isMounted = false
    }
  }, [db, profilesLoading, router])

  // Synchronisation avec PowerSync & positionnement sur le profil mémorisé
  useEffect(() => {
    if (profiles.length > 0) {
      let targetId = selectedProfileId
      if (currentUserId) {
        const savedId = localStorage.getItem(`last_selected_profile_id_${currentUserId}`)
        if (savedId && profiles.some((p) => p.id === savedId) && !selectedProfileId) {
          targetId = savedId
          setSelectedProfileId(savedId)
        } else if (!selectedProfileId || !profiles.some((p) => p.id === selectedProfileId)) {
          targetId = profiles[0].id
          setSelectedProfileId(profiles[0].id)
        }
      } else if (!selectedProfileId || !profiles.some((p) => p.id === selectedProfileId)) {
        targetId = profiles[0].id
        setSelectedProfileId(profiles[0].id)
      }

      if (targetId) {
        const idx = profiles.findIndex((p) => p.id === targetId)
        if (idx >= 0) setActiveIndex(idx)
      }
      setModalCreateOpen(false)
      setIsInitializing(false)
    }
  }, [profiles, selectedProfileId, currentUserId])

  // Maintien d'activeIndex dans les bornes si un profil est supprimé
  useEffect(() => {
    if (profiles.length > 0 && activeIndex >= profiles.length) {
      setActiveIndex(profiles.length - 1)
    }
  }, [profiles.length, activeIndex])

  // Direction Principale
  const directionProfiles = useMemo(() => {
    return profiles.filter((p) => p.profile_type === 'direction')
  }, [profiles])

  useEffect(() => {
    if (directionProfiles.length > 0) {
      const exists = directionProfiles.some((p) => p.id === mainDirectionId)
      if (!mainDirectionId || !exists) {
        const defaultMainId = directionProfiles[0].id
        setMainDirectionId(defaultMainId)
        try {
          localStorage.setItem('main_direction_profile_id', defaultMainId)
        } catch {}
      }
    } else {
      setMainDirectionId(null)
      try {
        localStorage.removeItem('main_direction_profile_id')
      } catch {}
    }
  }, [directionProfiles, mainDirectionId])

  const selectedCandidate = profiles.find((p) => p.id === selectedProfileId) || profiles[0]

  const principalDirectorProfile = useMemo(() => {
    return (
      directionProfiles.find((p) => p.id === mainDirectionId) ||
      directionProfiles[0] ||
      null
    )
  }, [directionProfiles, mainDirectionId])

  const directionCount = directionProfiles.length
  const agentCount = profiles.filter((p) => p.profile_type === 'agent').length
  const hasDirection = directionCount > 0

  // Biométrie
  const canUseBiometricsNow = useMemo(() => {
    if (!isBiometricAvailable || !selectedCandidate) return false
    try {
      const isEnrolled = localStorage.getItem(`bio_enrolled_${selectedCandidate.id}`) === 'true'
      const lastPinDate = localStorage.getItem(`last_pin_date_${selectedCandidate.id}`)
      const today = new Date().toISOString().split('T')[0]
      return isEnrolled && lastPinDate === today
    } catch {
      return false
    }
  }, [isBiometricAvailable, selectedCandidate])

  // Style visuel inspiré du modèle selon le rôle
  const getProfileVisuals = (profileType: string) => {
    if (profileType === 'direction') {
      return {
        icon: <ShieldCheck className="w-10 h-10 md:w-11 md:h-11 text-indigo-600" strokeWidth={1.75} />,
        smallIcon: <ShieldCheck className="w-5 h-5 text-indigo-600" strokeWidth={2} />,
        ringColor: 'border-slate-200 group-hover:border-indigo-400',
        iconBg: 'bg-indigo-50 text-indigo-600',
        dotActive: 'bg-indigo-600',
        accentText: 'text-indigo-600',
      }
    }
    if (profileType === 'intermediaire') {
      return {
        icon: <Landmark className="w-10 h-10 md:w-11 md:h-11 text-emerald-600" strokeWidth={1.75} />,
        smallIcon: <Landmark className="w-5 h-5 text-emerald-600" strokeWidth={2} />,
        ringColor: 'border-slate-200 group-hover:border-emerald-400',
        iconBg: 'bg-emerald-50 text-emerald-600',
        dotActive: 'bg-emerald-600',
        accentText: 'text-emerald-600',
      }
    }
    return {
      icon: <Briefcase className="w-10 h-10 md:w-11 md:h-11 text-blue-600" strokeWidth={1.75} />,
      smallIcon: <Briefcase className="w-5 h-5 text-blue-600" strokeWidth={2} />,
      ringColor: 'border-slate-200 group-hover:border-blue-400',
      iconBg: 'bg-blue-50 text-blue-600',
      dotActive: 'bg-blue-600',
      accentText: 'text-blue-600',
    }
  }

  const getProfileBadgeLabel = (p: { id: string; profile_type: string }) => {
    if (p.profile_type === 'direction') {
      return p.id === mainDirectionId ? 'Direction Principale' : 'Direction'
    }
    if (p.profile_type === 'intermediaire') {
      return 'Intermédiaire'
    }
    return 'Agent'
  }

  // Sélection d'un profil -> ouverture de l'écran PIN immersif
  const handleSelectProfileCard = (profile: WorkProfile) => {
    if (hasSwipedRef.current) return
    setSelectedProfileId(profile.id)
    setPin('')
    setError(null)
    setSuccess(null)
    if (currentUserId) {
      try {
        localStorage.setItem(`last_selected_profile_id_${currentUserId}`, profile.id)
      } catch {}
    }
    setPinScreenOpen(true)
  }

  // Connexion au profil sélectionné
  const handleOpenProfile = (codeToTest?: string) => {
    const activePin = codeToTest || pin
    if (!selectedCandidate || activePin.length < 4 || isPending) return

    setError(null)
    startTransition(async () => {
      try {
        await selectProfile(selectedCandidate, activePin)

        const today = new Date().toISOString().split('T')[0]
        localStorage.setItem(`bio_enrolled_${selectedCandidate.id}`, 'true')
        localStorage.setItem(`last_pin_date_${selectedCandidate.id}`, today)
        localStorage.setItem('has_created_profile_marker', 'true')

        // 💾 Mémorisation de l'utilisateur pour le prochain verrouillage
        if (currentUserId) {
          localStorage.setItem(`last_selected_profile_id_${currentUserId}`, selectedCandidate.id)
        }

        // Gestion du niveau d'accès Compta
        if (selectedCandidate.profile_type === 'direction') {
          localStorage.setItem('compta_access_level', 'full')
          localStorage.setItem(
            'is_selected_main_direction',
            selectedCandidate.id === mainDirectionId ? 'true' : 'false'
          )
        } else if (selectedCandidate.profile_type === 'intermediaire') {
          localStorage.setItem('compta_access_level', 'restricted')
          localStorage.removeItem('is_selected_main_direction')
        } else {
          localStorage.setItem('compta_access_level', 'none')
          localStorage.removeItem('is_selected_main_direction')
        }

        router.push('/')
      } catch (err: unknown) {
        setPin('')
        setError(err instanceof Error ? err.message : 'Code PIN incorrect.')
      }
    })
  }

  const handleDigitPress = (digit: string) => {
    if (isPending) return
    if (pin.length < 6) {
      const nextPin = pin + digit
      setPin(nextPin)
      setError(null)
      if ((nextPin.length === 4 || nextPin.length === 6) && selectedCandidate) {
        handleOpenProfile(nextPin)
      }
    }
  }

  const handleDeleteDigit = () => {
    if (isPending) return
    setPin((prev) => prev.slice(0, -1))
    setError(null)
  }

  // Gestion tactile du swipe mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
    hasSwipedRef.current = false
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return
    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const diffX = currentX - touchStartXRef.current
    const diffY = currentY - touchStartYRef.current

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 6) {
      hasSwipedRef.current = true
      const isAtStart = activeIndex === 0 && diffX > 0
      const isAtEnd = activeIndex === profiles.length - 1 && diffX < 0
      setDragOffset(isAtStart || isAtEnd ? diffX * 0.28 : diffX)
    }
  }

  const handleTouchEnd = () => {
    if (touchStartXRef.current === null) return
    const threshold = 55

    if (dragOffset < -threshold && activeIndex < profiles.length - 1) {
      setActiveIndex((prev) => prev + 1)
    } else if (dragOffset > threshold && activeIndex > 0) {
      setActiveIndex((prev) => prev - 1)
    }

    setDragOffset(0)
    setIsDragging(false)
    touchStartXRef.current = null
    touchStartYRef.current = null

    setTimeout(() => {
      hasSwipedRef.current = false
    }, 60)
  }

  // Écoute clavier physique PC (navigation flèches + saisie PIN + Échap)
  useEffect(() => {
    if (isInitializing || modalCreateOpen || modalPinOpen || modalAdminPinOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && !e.target.readOnly) return

      if (!pinScreenOpen) {
        if (e.key === 'ArrowRight') {
          setActiveIndex((prev) => Math.min(Math.max(0, profiles.length - 1), prev + 1))
        } else if (e.key === 'ArrowLeft') {
          setActiveIndex((prev) => Math.max(0, prev - 1))
        }
        return
      }

      if (isPending) return

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        handleDigitPress(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        handleDeleteDigit()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (pin.length >= 4) {
          handleOpenProfile()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setPinScreenOpen(false)
        setPin('')
        setError(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isInitializing, modalCreateOpen, modalPinOpen, modalAdminPinOpen, pinScreenOpen, pin, selectedCandidate, isPending, profiles.length])

  const handleBiometricUnlock = async () => {
    if (!selectedCandidate) return
    setError(null)

    startTransition(async () => {
      try {
        await unlockWithBiometrics(selectedCandidate)

        if (currentUserId) {
          localStorage.setItem(`last_selected_profile_id_${currentUserId}`, selectedCandidate.id)
        }

        if (selectedCandidate.profile_type === 'direction') {
          localStorage.setItem('compta_access_level', 'full')
        } else if (selectedCandidate.profile_type === 'intermediaire') {
          localStorage.setItem('compta_access_level', 'restricted')
        } else {
          localStorage.setItem('compta_access_level', 'none')
        }

        router.push('/')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Authentification annulée.')
      }
    })
  }

  // Contrôles PIN Directeur
  const requestCreateProfile = (profileType: ExtendedProfileType) => {
    setError(null)
    setSuccess(null)
    if (!hasDirection && profileType === 'direction') {
      setType('direction')
      setCreatePin('')
      setModalCreateOpen(true)
      return
    }

    setPendingAction({ type: 'CREATE', profileType })
    setAdminPin('')
    setModalAdminPinOpen(true)
  }

  const requestDeleteProfile = (profileId: string, profileName: string) => {
    setError(null)
    setSuccess(null)
    setPendingAction({ type: 'DELETE', profileId, profileName })
    setAdminPin('')
    setModalAdminPinOpen(true)
  }

  const requestSetMainDirection = (profileId: string) => {
    setError(null)
    setSuccess(null)
    setPendingAction({ type: 'SET_MAIN_DIRECTION', profileId })
    setAdminPin('')
    setModalAdminPinOpen(true)
  }

  const handleVerifyDirectorPin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!principalDirectorProfile) {
      setError('Direction Principale introuvable.')
      return
    }
    if (adminPin.length < 4 || adminPin.length > 6) {
      setError('Code PIN invalide (4 à 6 chiffres).')
      return
    }

    startTransition(async () => {
      try {
        await selectProfile(principalDirectorProfile, adminPin)
        setModalAdminPinOpen(false)
        setAdminPin('')

        if (pendingAction?.type === 'CREATE') {
          setType(pendingAction.profileType)
          setCreatePin('')
          setModalCreateOpen(true)
        } else if (pendingAction?.type === 'DELETE') {
          await executeDeleteProfile(pendingAction.profileId, pendingAction.profileName)
        } else if (pendingAction?.type === 'SET_MAIN_DIRECTION') {
          setMainDirectionId(pendingAction.profileId)
          try {
            localStorage.setItem('main_direction_profile_id', pendingAction.profileId)
          } catch {}
          setSuccess('Direction principale définie avec succès.')
        }
        setPendingAction(null)
      } catch {
        setError('Code PIN du Directeur Principal incorrect. Accès refusé.')
      }
    })
  }

  const executeDeleteProfile = async (profileId: string, profileName: string) => {
    if (!window.confirm(`Confirmez-vous la suppression définitive du profil "${profileName}" ?`)) {
      return
    }

    try {
      const { data, error } = await supabase
        .from('account_profiles')
        .delete()
        .eq('id', profileId)
        .select('id')
      requireSupabaseRows(data, error, 'suppression du profil')
      await db.execute('DELETE FROM account_profiles WHERE id = ?', [profileId])

      localStorage.removeItem(`bio_enrolled_${profileId}`)
      localStorage.removeItem(`last_pin_date_${profileId}`)

      if (currentUserId) {
        const lastSaved = localStorage.getItem(`last_selected_profile_id_${currentUserId}`)
        if (lastSaved === profileId) {
          localStorage.removeItem(`last_selected_profile_id_${currentUserId}`)
        }
      }

      if (mainDirectionId === profileId) {
        const remainingDirs = directionProfiles.filter((d) => d.id !== profileId)
        const nextMain = remainingDirs[0]?.id || null
        setMainDirectionId(nextMain)
        if (nextMain) {
          localStorage.setItem('main_direction_profile_id', nextMain)
        } else {
          localStorage.removeItem('main_direction_profile_id')
        }
      }

      if (selectedProfileId === profileId) {
        const remaining = profiles.filter((p) => p.id !== profileId)
        setSelectedProfileId(remaining[0]?.id || null)
        setPinScreenOpen(false)
      }

      setSuccess(`Profil "${profileName}" supprimé avec succès.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression.')
    }
  }

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!name.trim()) {
      setError('Nom requis.')
      return
    }
    if (createPin.length !== 4) {
      setError('Le code PIN doit comporter exactement 4 chiffres.')
      return
    }

    startTransition(async () => {
      try {
        await createProfile(name.trim(), type as WorkProfileType, createPin)
        try {
          localStorage.setItem('has_created_profile_marker', 'true')
        } catch {}

        setCreatePin('')
        setName('')
        setModalCreateOpen(false)
        setIsInitializing(false)
        setSuccess('Profil créé avec succès.')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Création impossible.')
      }
    })
  }

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!targetProfileId) return
    if (oldPin.length < 4 || oldPin.length > 6) {
      setError("L'ancien code PIN doit comporter entre 4 et 6 chiffres.")
      return
    }
    if (newPin.length !== 4) {
      setError('Le nouveau code PIN doit comporter exactement 4 chiffres.')
      return
    }
    if (newPin !== confirmPin) {
      setError('Les codes PIN ne correspondent pas.')
      return
    }

    startTransition(async () => {
      try {
        await updatePin(targetProfileId, oldPin, newPin)
        setOldPin('')
        setNewPin('')
        setConfirmPin('')
        setModalPinOpen(false)
        setSuccess('Code PIN modifié avec succès.')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour.')
      }
    })
  }

  if (isInitializing) {
    return (
      <main className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col items-center justify-center p-6 select-none">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-blue-500/15 blur-2xl animate-pulse" />
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-dashed border-blue-200 animate-[spin_8s_linear_infinite] flex items-center justify-center">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-600 shadow-lg shadow-blue-600/50" />
            <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-400" />
            <div className="absolute -bottom-1.5 left-1/3 w-3 h-3 rounded-full bg-blue-500" />
            <div className="absolute top-1/3 -left-1.5 w-2 h-2 rounded-full bg-blue-300" />
          </div>
          <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-t-blue-600 border-r-blue-400 border-b-transparent border-l-transparent animate-[spin_1.5s_linear_infinite]" />
          <div className="absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-blue-400/40 animate-ping opacity-60" />
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white shadow-xl shadow-blue-900/10 border border-blue-50 flex items-center justify-center">
            <Lock className="text-blue-600 animate-pulse" size={24} />
          </div>
        </div>
        <p className="mt-8 text-xs font-black uppercase tracking-widest text-slate-500">
          Vérification de session...
        </p>
      </main>
    )
  }

  const activeMobileProfile = profiles[activeIndex]
  const activeMobileVisuals = activeMobileProfile
    ? getProfileVisuals(activeMobileProfile.profile_type)
    : null
  const desktopGridClass =
    profiles.length <= 1
      ? 'md:grid-cols-1 max-w-sm'
      : profiles.length === 3
        ? 'md:grid-cols-3 max-w-4xl'
        : 'md:grid-cols-2 max-w-2xl'

  return (
    <div
      id="role-selection-page"
      className="fixed inset-0 z-50 w-full min-h-dvh bg-[#F8FAFC] flex flex-col justify-between overflow-y-auto overflow-x-hidden select-none font-sans antialiased"
    >
      {/* 1. EN-TÊTE : NOM DE L'AGENCE + MESSAGE DE BIENVENUE */}
      <header className="w-full max-w-4xl mx-auto px-6 pt-10 md:pt-14 text-center shrink-0">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase">
            {nomAgence || 'Agence Pro'}
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500">
            Bienvenue, sélectionnez votre profil pour accéder à votre espace.
          </p>
        </div>

        {/* Feedback global (création / suppression / modification PIN) */}
        {(success || (error && !pinScreenOpen && !modalAdminPinOpen && !modalCreateOpen && !modalPinOpen)) && (
          <div className="mt-4 flex justify-center">
            {success && (
              <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 animate-in fade-in duration-150">
                {success}
              </span>
            )}
            {error && !pinScreenOpen && !modalAdminPinOpen && !modalCreateOpen && !modalPinOpen && (
              <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-xs font-bold text-rose-600 animate-in fade-in duration-150">
                {error}
              </span>
            )}
          </div>
        )}
      </header>

      {/* 2. ZONE DES PROFILS */}
      <main className="w-full flex-1 flex flex-col items-center justify-center py-4">
        {profiles.length === 0 ? (
          <div className="text-center px-6 py-10 space-y-4">
            <p className="text-sm font-bold text-slate-500">
              Aucun profil configuré pour cet espace.
            </p>
            <button
              type="button"
              onClick={() => requestCreateProfile('direction')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider shadow-sm transition cursor-pointer"
            >
              <Plus size={15} />
              <span>Créer le profil Direction</span>
            </button>
          </div>
        ) : (
          <>
            {/* === VERSION MOBILE : UN SEUL GRAND CERCLE + SWIPE FLUIDE === */}
            <div
              className="md:hidden w-full flex flex-col items-center justify-center touch-pan-y"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="w-full overflow-hidden py-10">
                <div
                  className="flex w-full will-change-transform"
                  style={{
                    transform: `translate3d(calc(-${activeIndex * 100}% + ${dragOffset}px), 0, 0)`,
                    transition: isDragging
                      ? 'none'
                      : 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  {profiles.map((p, idx) => {
                    const visuals = getProfileVisuals(p.profile_type)
                    const isCurrent = idx === activeIndex

                    return (
                      <div
                        key={p.id}
                        className="w-full shrink-0 flex flex-col items-center justify-center px-6"
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectProfileCard(p)}
                          className={`w-[260px] h-[260px] sm:w-[280px] sm:h-[280px] rounded-full bg-white border border-slate-200/90 shadow-[0_6px_20px_rgba(15,23,42,0.05)] flex flex-col items-center justify-center p-7 text-center relative transition-all duration-300 active:scale-95 cursor-pointer ${
                            isCurrent ? 'scale-100 opacity-100' : 'scale-92 opacity-50'
                          }`}
                        >
                          {/* Anneau fin interne */}
                          <div className="absolute inset-3 rounded-full border border-slate-100 pointer-events-none" />

                          {/* Cadenas discret en haut du cercle */}
                          <div className="absolute top-6 w-7 h-7 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-400">
                            <Lock className="w-3.5 h-3.5" />
                          </div>

                          {/* Icône du rôle */}
                          <div
                            className={`w-18 h-18 rounded-full ${visuals.iconBg} flex items-center justify-center mb-3.5`}
                          >
                            {visuals.icon}
                          </div>

                          {/* Nom du profil */}
                          <h2 className="text-lg font-black text-slate-900 tracking-tight max-w-[190px] truncate">
                            {p.name}
                          </h2>

                          {/* Sous-titre rôle */}
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                            {getProfileBadgeLabel(p)}
                          </p>

                          {/* Flèche d'entrée */}
                          <div
                            className={`mt-3 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center ${visuals.accentText}`}
                          >
                            <ArrowRight className="w-4 h-4" />
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Indicateurs de pagination bien séparés du cercle */}
              {profiles.length > 1 && (
                <div className="flex items-center justify-center gap-2.5 pt-1 pb-2">
                  {profiles.map((p, idx) => {
                    const isSelected = idx === activeIndex
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
                        aria-label={p.name}
                        className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                          isSelected
                            ? `w-7 ${activeMobileVisuals?.dotActive || 'bg-slate-900'}`
                            : 'w-2 bg-slate-300'
                        }`}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {/* === VERSION PC : GRILLE DE GRANDS CERCLES === */}
            <div
              className={`hidden md:grid ${desktopGridClass} gap-10 lg:gap-14 mx-auto place-items-center px-6 py-4`}
            >
              {profiles.map((p) => {
                const visuals = getProfileVisuals(p.profile_type)

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProfileCard(p)}
                    className={`w-64 h-64 lg:w-72 lg:h-72 rounded-full bg-white border ${visuals.ringColor} shadow-[0_4px_18px_rgba(15,23,42,0.04)] hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)] hover:-translate-y-1 active:scale-[0.98] transition-all duration-200 flex flex-col items-center justify-center p-8 text-center relative group cursor-pointer`}
                  >
                    {/* Anneau fin interne */}
                    <div className="absolute inset-3.5 rounded-full border border-slate-100 group-hover:border-slate-200/70 transition-colors pointer-events-none" />

                    {/* Indicateur PIN */}
                    <div className="absolute top-6 w-7 h-7 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-400 group-hover:text-slate-700 transition-colors">
                      <Lock className="w-3.5 h-3.5" />
                    </div>

                    {/* Icône */}
                    <div
                      className={`w-20 h-20 rounded-full ${visuals.iconBg} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-200`}
                    >
                      {visuals.icon}
                    </div>

                    {/* Nom du profil */}
                    <h2 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight max-w-[200px] truncate">
                      {p.name}
                    </h2>

                    {/* Rôle */}
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                      {getProfileBadgeLabel(p)}
                    </p>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </main>

      {/* 3. PIED DE PAGE : AJOUT DE PROFILS DISCRET + COPYRIGHT */}
      <footer className="w-full px-6 pb-6 pt-2 flex flex-col items-center gap-3 shrink-0">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {directionCount < 2 && (
            <button
              type="button"
              onClick={() => requestCreateProfile('direction')}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200/90 px-3.5 py-1.5 rounded-full shadow-2xs active:scale-95 transition cursor-pointer"
            >
              <Plus size={13} />
              <span>Direction</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => requestCreateProfile('intermediaire')}
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200/90 px-3.5 py-1.5 rounded-full shadow-2xs active:scale-95 transition cursor-pointer"
          >
            <Plus size={13} />
            <span>Intermédiaire</span>
          </button>
          {agentCount < 2 && (
            <button
              type="button"
              onClick={() => requestCreateProfile('agent')}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200/90 px-3.5 py-1.5 rounded-full shadow-2xs active:scale-95 transition cursor-pointer"
            >
              <Plus size={13} />
              <span>Agent</span>
            </button>
          )}
        </div>

        <p className="text-[11px] font-semibold text-slate-400">
          © {new Date().getFullYear()} {nomAgence || 'Agence Pro'}
        </p>
      </footer>

      {/* 4. ÉCRAN PIN PLEIN ÉCRAN IMMERSIF */}
      {pinScreenOpen && selectedCandidate && (
        <div className="fixed inset-0 z-50 w-screen h-dvh bg-white flex flex-col justify-between px-6 py-6 sm:py-10 overflow-hidden animate-in fade-in duration-150">
          {/* Barre supérieure : Profil actif & bouton fermer */}
          <div className="w-full max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-11 h-11 rounded-full shrink-0 ${getProfileVisuals(selectedCandidate.profile_type).iconBg} flex items-center justify-center`}
              >
                {getProfileVisuals(selectedCandidate.profile_type).smallIcon}
              </div>
              <div className="min-w-0">
                <p className="font-black text-slate-900 text-lg tracking-tight truncate leading-tight">
                  {selectedCandidate.name}
                </p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {getProfileBadgeLabel(selectedCandidate)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (isPending) return
                setPinScreenOpen(false)
                setPin('')
                setError(null)
              }}
              disabled={isPending}
              aria-label="Fermer"
              className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-90 transition disabled:opacity-30 cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Centre : Indicateurs visuels PIN + Pavé numérique circulaire */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleOpenProfile()
            }}
            className="w-full max-w-xs mx-auto flex-1 flex flex-col items-center justify-center gap-7 sm:gap-9"
          >
            {/* Pastilles PIN */}
            <div className="flex flex-col items-center gap-3">
              <input
                type="password"
                readOnly
                value={pin}
                id="agency-pin-input"
                aria-label="Code PIN"
                className="sr-only"
              />

              <div className="flex items-center justify-center gap-4 h-8">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, idx) => {
                  const isFilled = idx < pin.length
                  return (
                    <span
                      key={idx}
                      className={`rounded-full transition-all duration-200 ${
                        isFilled
                          ? error
                            ? 'w-4 h-4 bg-rose-500 scale-110'
                            : 'w-4 h-4 bg-slate-900 scale-110'
                          : 'w-3.5 h-3.5 bg-slate-200'
                      }`}
                    />
                  )
                })}
              </div>

              <div className="h-5 flex items-center justify-center">
                {error && (
                  <span className="text-xs font-bold text-rose-600 animate-in fade-in duration-150">
                    {error}
                  </span>
                )}
                {!error && success && (
                  <span className="text-xs font-bold text-emerald-600 animate-in fade-in duration-150">
                    {success}
                  </span>
                )}
              </div>
            </div>

            {/* Pavé numérique circulaire */}
            <div className="grid grid-cols-3 gap-4 sm:gap-5 place-items-center w-full">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleDigitPress(num)}
                  disabled={isPending}
                  className="w-[72px] h-[72px] sm:w-[78px] sm:h-[78px] rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/70 text-slate-900 text-2xl font-black flex items-center justify-center active:bg-slate-900 active:text-white active:scale-90 transition-all duration-150 disabled:opacity-40 cursor-pointer"
                >
                  {num}
                </button>
              ))}

              {/* Bouton tout effacer OU biométrie */}
              <div className="w-[72px] h-[72px] sm:w-[78px] sm:h-[78px] flex items-center justify-center">
                {pin.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isPending) {
                        setError(null)
                        setPin('')
                      }
                    }}
                    className="text-xs font-extrabold text-slate-400 hover:text-slate-800 active:scale-90 transition px-3 py-2 cursor-pointer"
                  >
                    C
                  </button>
                ) : canUseBiometricsNow ? (
                  <button
                    type="button"
                    onClick={handleBiometricUnlock}
                    disabled={isPending}
                    aria-label="Déverrouiller par biométrie"
                    className="w-14 h-14 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center active:scale-90 transition cursor-pointer"
                  >
                    <Fingerprint className="w-6 h-6" />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => handleDigitPress('0')}
                disabled={isPending}
                className="w-[72px] h-[72px] sm:w-[78px] sm:h-[78px] rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/70 text-slate-900 text-2xl font-black flex items-center justify-center active:bg-slate-900 active:text-white active:scale-90 transition-all duration-150 disabled:opacity-40 cursor-pointer"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleDeleteDigit}
                disabled={isPending || pin.length === 0}
                aria-label="Effacer"
                className="w-[72px] h-[72px] sm:w-[78px] sm:h-[78px] rounded-full bg-transparent hover:bg-slate-100 text-slate-600 flex items-center justify-center active:bg-rose-500 active:text-white active:scale-90 transition-all duration-150 disabled:opacity-25 cursor-pointer"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>

            {/* Bouton de validation */}
            <button
              type="submit"
              disabled={pin.length < 4 || isPending}
              className="w-full h-14 rounded-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 text-white disabled:text-slate-300 font-extrabold text-sm tracking-wide flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] shadow-sm disabled:shadow-none cursor-pointer"
            >
              {isPending ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              ) : (
                <>
                  <span>Valider</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Actions secondaires discrètes du profil (Modifier PIN / Principal / Supprimer) */}
          <div className="w-full max-w-md mx-auto pt-3 border-t border-slate-100 flex items-center justify-center gap-5 text-xs">
            <button
              type="button"
              onClick={() => {
                setTargetProfileId(selectedCandidate.id)
                setOldPin('')
                setNewPin('')
                setConfirmPin('')
                setError(null)
                setModalPinOpen(true)
              }}
              className="inline-flex items-center gap-1.5 font-bold text-slate-500 hover:text-slate-900 transition cursor-pointer"
            >
              <KeyRound size={13} />
              <span>Changer PIN</span>
            </button>

            {selectedCandidate.profile_type === 'direction' &&
              selectedCandidate.id !== mainDirectionId && (
                <button
                  type="button"
                  onClick={() => requestSetMainDirection(selectedCandidate.id)}
                  className="inline-flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                >
                  <Star size={13} />
                  <span>Définir principal</span>
                </button>
              )}

            <button
              type="button"
              onClick={() => requestDeleteProfile(selectedCandidate.id, selectedCandidate.name)}
              className="inline-flex items-center gap-1.5 font-bold text-rose-500 hover:text-rose-700 transition cursor-pointer"
            >
              <Trash2 size={13} />
              <span>Supprimer</span>
            </button>
          </div>
        </div>
      )}

      {/* --- MODALE PIN DIRECTION REQUIS --- */}
      {modalAdminPinOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => {
                setModalAdminPinOpen(false)
                setPendingAction(null)
                setAdminPin('')
              }}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-900 flex items-center justify-center mb-4">
              <ShieldAlert size={24} />
            </div>

            <h2 className="text-base font-black text-slate-900">Autorisation Direction Principale</h2>
            <p className="text-xs text-slate-500 mt-1 font-semibold leading-relaxed">
              Pour{' '}
              {pendingAction?.type === 'CREATE'
                ? 'créer ce profil'
                : pendingAction?.type === 'SET_MAIN_DIRECTION'
                  ? 'changer la Direction Principale'
                  : `supprimer le profil "${pendingAction && 'profileName' in pendingAction ? pendingAction.profileName : ''}"`}
              , veuillez entrer le code PIN du Directeur Principal (
              {principalDirectorProfile?.name || 'Direction'}).
            </p>

            {error && <p className="text-xs text-rose-600 font-bold mt-3">{error}</p>}

            <form onSubmit={handleVerifyDirectorPin} className="space-y-4 mt-6">
              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">
                  Code PIN du Directeur Principal (4 à 6 chiffres)
                </label>
                <input
                  type="text"
                  name="director-pin-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  autoFocus
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition"
                  {...pinInputProps}
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalAdminPinOpen(false)
                    setPendingAction(null)
                    setAdminPin('')
                  }}
                  className="flex-1 py-3 rounded-full border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-wider hover:bg-slate-50 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending || adminPin.length < 4}
                  className="flex-1 py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 transition cursor-pointer"
                >
                  {isPending ? 'Vérification...' : 'Confirmer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODALE CRÉATION DE PROFIL --- */}
      {modalCreateOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            {profiles.length > 0 && (
              <button
                type="button"
                onClick={() => setModalCreateOpen(false)}
                className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            )}

            <h2 className="text-base font-black text-slate-900">Nouveau profil</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-bold">
              Sécurisez l'accès avec un code PIN personnel.
            </p>

            {error && <p className="text-xs text-rose-600 font-bold mt-3">{error}</p>}

            <form onSubmit={handleCreateProfile} className="space-y-4 mt-6">
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  disabled={directionCount >= 2}
                  onClick={() => setType('direction')}
                  className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    type === 'direction' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  } ${directionCount >= 2 ? 'opacity-40' : ''}`}
                >
                  Direction ({directionCount}/2)
                </button>
                <button
                  type="button"
                  onClick={() => setType('intermediaire')}
                  className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    type === 'intermediaire' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Intermédiaire
                </button>
                <button
                  type="button"
                  disabled={agentCount >= 2}
                  onClick={() => setType('agent')}
                  className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    type === 'agent' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  } ${agentCount >= 2 ? 'opacity-40' : ''}`}
                >
                  Agent ({agentCount}/2)
                </button>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">
                  Nom du titulaire
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Ousmane"
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">
                  Code PIN (4 chiffres)
                </label>
                <input
                  type="text"
                  name="new-profile-pin"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={createPin}
                  onChange={(e) => setCreatePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition"
                  {...pinInputProps}
                />
              </div>

              <div className="space-y-2 pt-4">
                <button
                  type="submit"
                  disabled={isPending || !name.trim() || createPin.length !== 4}
                  className="w-full py-3.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 transition shadow-sm cursor-pointer"
                >
                  {isPending ? 'Enregistrement...' : 'Créer le profil'}
                </button>

                {profiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setModalCreateOpen(false)}
                    className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition cursor-pointer"
                  >
                    Annuler
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODALE MODIFICATION DU PIN --- */}
      {modalPinOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-black text-slate-900">Modifier le code PIN</h2>
              <button
                type="button"
                onClick={() => setModalPinOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {error && <p className="text-xs text-rose-600 font-bold mb-3">{error}</p>}

            <form onSubmit={handleChangePin} className="space-y-4">
              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">
                  Ancien PIN (4 à 6 chiffres)
                </label>
                <input
                  type="text"
                  name="current-pin-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Votre ancien code"
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition"
                  {...pinInputProps}
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">
                  Nouveau PIN (4 chiffres)
                </label>
                <input
                  type="text"
                  name="updated-pin-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition"
                  {...pinInputProps}
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">
                  Confirmer le nouveau PIN (4 chiffres)
                </label>
                <input
                  type="text"
                  name="confirm-updated-pin"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition"
                  {...pinInputProps}
                />
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalPinOpen(false)}
                  className="flex-1 py-3.5 rounded-full border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-wider hover:bg-slate-50 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={
                    isPending ||
                    oldPin.length < 4 ||
                    oldPin.length > 6 ||
                    newPin.length !== 4 ||
                    confirmPin.length !== 4
                  }
                  className="flex-1 py-3.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 transition shadow-sm cursor-pointer"
                >
                  {isPending ? 'Mise à jour...' : 'Valider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
