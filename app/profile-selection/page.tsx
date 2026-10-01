'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Delete,
  Fingerprint,
  KeyRound,
  Keyboard,
  ArrowRight,
  Lock,
  X,
  Trash2,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { useWorkProfile, type WorkProfileType } from '@/lib/ProfileContext'
import { usePowerSync } from '@powersync/react'
import { supabase, getUser } from '@/lib/supabase'

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
  const [isSwitchingProfile, setIsSwitchingProfile] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

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
  const [showKeypadOnDesktop, setShowKeypadOnDesktop] = useState(false)
  const desktopInputRef = useRef<HTMLInputElement>(null)
  
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
            const validSavedId = savedLastProfileId && localRows.some((p) => p.id === savedLastProfileId) 
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
            const validSavedId = savedLastProfileId && remoteProfiles.some((p) => p.id === savedLastProfileId) 
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

  // Synchronisation avec PowerSync & sélection automatique du profil mémorisé
  useEffect(() => {
    if (profiles.length > 0) {
      if (currentUserId) {
        const savedId = localStorage.getItem(`last_selected_profile_id_${currentUserId}`)
        if (savedId && profiles.some((p) => p.id === savedId) && !selectedProfileId) {
          setSelectedProfileId(savedId)
        } else if (!selectedProfileId || !profiles.some((p) => p.id === selectedProfileId)) {
          setSelectedProfileId(profiles[0].id)
        }
      } else if (!selectedProfileId || !profiles.some((p) => p.id === selectedProfileId)) {
        setSelectedProfileId(profiles[0].id)
      }
      setModalCreateOpen(false)
      setIsInitializing(false)
    }
  }, [profiles, selectedProfileId, currentUserId])

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

  // Focus clavier PC
  useEffect(() => {
    if (!isInitializing && !modalCreateOpen && !modalPinOpen && !modalAdminPinOpen) {
      desktopInputRef.current?.focus()
    }
  }, [isInitializing, modalCreateOpen, modalPinOpen, modalAdminPinOpen, selectedProfileId])

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

  // Connexion au profil sélectionné
  const handleOpenProfile = (codeToTest?: string) => {
    const activePin = codeToTest || pin
    if (!selectedCandidate || activePin.length < 4) return

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
        desktopInputRef.current?.focus()
      }
    })
  }

  const handleDigitPress = (digit: string) => {
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
    setPin((prev) => prev.slice(0, -1))
    setError(null)
  }

  // Écoute clavier PC
  useEffect(() => {
    if (isInitializing || modalCreateOpen || modalPinOpen || modalAdminPinOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target !== desktopInputRef.current) return

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
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isInitializing, modalCreateOpen, modalPinOpen, modalAdminPinOpen, pin, selectedCandidate])

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
      await db.execute('DELETE FROM account_profiles WHERE id = ?', [profileId])
      await supabase.from('account_profiles').delete().eq('id', profileId)

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

  const getProfileBadgeLabel = (p: { id: string; profile_type: string }) => {
    if (p.profile_type === 'direction') {
      return p.id === mainDirectionId ? 'Direction Principale' : 'Direction'
    }
    if (p.profile_type === 'intermediaire') {
      return 'Intermédiaire'
    }
    return 'Agent'
  }

  if (isInitializing) {
    return (
      <main className="fixed inset-0 z-50 bg-[#F4F6F8] flex flex-col items-center justify-center p-6 select-none">
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

  return (
    <main className="fixed inset-0 z-50 overflow-y-auto bg-[#F4F6F8] text-slate-900 flex items-center justify-center p-4 sm:p-6 lg:p-8 select-none">
      
      {/* --- A. VERSION MOBILE --- */}
      <div className="sm:hidden w-full h-full flex flex-col justify-between py-4 px-2">
        <div>
          {/* Si l'utilisateur clique sur changer de profil, on affiche la liste, sinon on reste focus sur son profil */}
          {isSwitchingProfile ? (
            <div className="animate-in fade-in duration-200">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Choisir un profil
                </span>
                <button
                  type="button"
                  onClick={() => setIsSwitchingProfile(false)}
                  className="text-xs font-bold text-blue-600 underline"
                >
                  Fermer
                </button>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-2 px-2">
                {profiles.map((p) => {
                  const isSelected = (selectedCandidate?.id || selectedProfileId) === p.id
                  const isMain = p.profile_type === 'direction' && p.id === mainDirectionId

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProfileId(p.id)
                        setPin('')
                        setError(null)
                        setIsSwitchingProfile(false)
                        if (currentUserId) {
                          localStorage.setItem(`last_selected_profile_id_${currentUserId}`, p.id)
                        }
                      }}
                      className={`px-3.5 py-2 rounded-2xl text-xs font-bold tracking-tight transition-all shrink-0 flex items-center gap-2 ${
                        isSelected
                          ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10'
                          : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      <span className="truncate max-w-[110px]">{p.name}</span>
                      <span
                        className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : isMain
                            ? 'bg-amber-100 text-amber-800'
                            : p.profile_type === 'direction'
                            ? 'bg-amber-50 text-amber-700'
                            : p.profile_type === 'intermediaire'
                            ? 'bg-sky-50 text-sky-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isMain ? 'DIR. P' : p.profile_type === 'direction' ? 'DIR' : p.profile_type === 'intermediaire' ? 'INT' : 'AGT'}
                      </span>
                    </button>
                  )
                })}

                <div className="flex items-center gap-1.5 pl-1 shrink-0">
                  {directionCount < 2 && (
                    <button
                      type="button"
                      onClick={() => requestCreateProfile('direction')}
                      className="px-2.5 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-bold active:scale-95 transition"
                    >
                      + Dir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => requestCreateProfile('intermediaire')}
                    className="px-2.5 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-bold active:scale-95 transition"
                  >
                    + Inter
                  </button>
                  {agentCount < 2 && (
                    <button
                      type="button"
                      onClick={() => requestCreateProfile('agent')}
                      className="w-8 h-8 rounded-2xl bg-white border border-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-end px-1">
              <button
                type="button"
                onClick={() => setIsSwitchingProfile(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-full active:scale-95 transition shadow-xs"
              >
                <Users size={13} />
                <span>Changer d'utilisateur</span>
              </button>
            </div>
          )}

          <div className="text-center mt-6">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {selectedCandidate?.name ?? 'Sélectionnez un profil'}
            </h1>
            <p className="text-[11px] text-slate-500 mt-1 uppercase tracking-wider font-bold">
              {selectedCandidate ? getProfileBadgeLabel(selectedCandidate) : ''}
            </p>

            {/* Indicateurs de saisie */}
            <div className="flex justify-center items-center gap-3.5 my-6">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                    pin.length > index
                      ? 'bg-blue-600 scale-125 shadow-sm shadow-blue-600/40'
                      : 'bg-slate-200'
                  }`}
                />
              ))}
              {pin.length > 4 && (
                <div className="w-3.5 h-3.5 rounded-full bg-blue-600 scale-125 shadow-sm shadow-blue-600/40 animate-pulse" />
              )}
            </div>

            {error && (
              <p className="text-xs text-rose-600 font-bold animate-in fade-in duration-150">
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs text-emerald-600 font-bold animate-in fade-in duration-150">
                {success}
              </p>
            )}
          </div>
        </div>

        {/* 🔘 CLAVIER TACTILE MOBILE : BOUTONS RONDS EN CERCLE PARFAIT */}
        <div className="w-full max-w-[280px] mx-auto my-auto">
          <div className="grid grid-cols-3 gap-y-3.5 gap-x-6 justify-items-center">
            {[
              { n: '1', l: '' },
              { n: '2', l: 'ABC' },
              { n: '3', l: 'DEF' },
              { n: '4', l: 'GHI' },
              { n: '5', l: 'JKL' },
              { n: '6', l: 'MNO' },
              { n: '7', l: 'PQRS' },
              { n: '8', l: 'TUV' },
              { n: '9', l: 'WXYZ' },
            ].map(({ n, l }) => (
              <button
                key={n}
                type="button"
                onClick={() => handleDigitPress(n)}
                className="w-16 h-16 rounded-full bg-white active:bg-blue-50 border border-slate-100 shadow-sm flex flex-col items-center justify-center transition active:scale-95"
              >
                <span className="text-xl font-black text-slate-900 leading-none">{n}</span>
                {l && <span className="text-[8px] font-bold text-slate-400 mt-0.5 tracking-widest">{l}</span>}
              </button>
            ))}

            <div className="w-16 h-16 flex items-center justify-center">
              {canUseBiometricsNow ? (
                <button
                  type="button"
                  onClick={handleBiometricUnlock}
                  disabled={isPending}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-blue-600 active:bg-blue-100 transition"
                >
                  <Fingerprint size={26} />
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => handleDigitPress('0')}
              className="w-16 h-16 rounded-full bg-white active:bg-blue-50 border border-slate-100 shadow-sm flex items-center justify-center transition active:scale-95"
            >
              <span className="text-xl font-black text-slate-900">0</span>
            </button>

            <button
              type="button"
              onClick={handleDeleteDigit}
              className="w-16 h-16 rounded-full flex items-center justify-center text-slate-400 active:text-rose-600 transition active:scale-95"
            >
              <Delete size={20} />
            </button>
          </div>
        </div>

        <div className="pt-3 pb-2 flex flex-col gap-2 text-xs text-slate-400 border-t border-slate-200">
          {selectedCandidate && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
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
                  className="font-bold text-slate-600 hover:text-slate-900 transition"
                >
                  Changer PIN
                </button>
                <button
                  type="button"
                  onClick={() => requestDeleteProfile(selectedCandidate.id, selectedCandidate.name)}
                  className="font-bold text-rose-500 hover:text-rose-700 transition"
                >
                  Supprimer
                </button>
              </div>

              {selectedCandidate.profile_type === 'direction' && selectedCandidate.id !== mainDirectionId && (
                <button
                  type="button"
                  onClick={() => requestSetMainDirection(selectedCandidate.id)}
                  className="font-bold text-slate-700 hover:text-slate-900"
                >
                  Définir principal
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- B. VERSION PC / DESKTOP --- */}
      <div className="hidden sm:flex w-full max-w-xl bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-lg flex-col">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              Espace de Travail
            </h1>

            <div className="flex items-center gap-2">
              {directionCount < 2 && (
                <button
                  type="button"
                  onClick={() => requestCreateProfile('direction')}
                  className="text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl transition"
                >
                  + Direction
                </button>
              )}

              <button
                type="button"
                onClick={() => requestCreateProfile('intermediaire')}
                className="text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl transition"
              >
                + Intermédiaire
              </button>

              {agentCount < 2 && (
                <button
                  type="button"
                  onClick={() => requestCreateProfile('agent')}
                  className="text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl transition"
                >
                  + Agent
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
            {profiles.map((p) => {
              const isSelected = (selectedCandidate?.id || selectedProfileId) === p.id
              const isMainDir = p.profile_type === 'direction' && p.id === mainDirectionId

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedProfileId(p.id)
                    setPin('')
                    setError(null)
                    desktopInputRef.current?.focus()
                    if (currentUserId) {
                      localStorage.setItem(`last_selected_profile_id_${currentUserId}`, p.id)
                    }
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300 hover:bg-slate-100/50'
                  }`}
                >
                  <div className="truncate">
                    <p className="text-sm font-bold truncate leading-tight">{p.name}</p>
                    <p
                      className={`text-[10px] font-bold tracking-wider uppercase mt-0.5 ${
                        isSelected ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {getProfileBadgeLabel(p)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {p.profile_type === 'direction' && !isMainDir && (
                      <button
                        type="button"
                        title="Définir comme Direction Principale"
                        onClick={(e) => {
                          e.stopPropagation()
                          requestSetMainDirection(p.id)
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg transition ${
                          isSelected
                            ? 'text-white hover:bg-white/20'
                            : 'text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Principal
                      </button>
                    )}

                    <button
                      type="button"
                      title="Modifier le code PIN"
                      onClick={(e) => {
                        e.stopPropagation()
                        setTargetProfileId(p.id)
                        setOldPin('')
                        setNewPin('')
                        setConfirmPin('')
                        setError(null)
                        setModalPinOpen(true)
                      }}
                      className={`p-1.5 rounded-lg transition ${
                        isSelected
                          ? 'text-slate-300 hover:text-white hover:bg-white/20'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <KeyRound size={15} />
                    </button>

                    <button
                      type="button"
                      title="Supprimer ce profil"
                      onClick={(e) => {
                        e.stopPropagation()
                        requestDeleteProfile(p.id, p.name)
                      }}
                      className={`p-1.5 rounded-lg transition ${
                        isSelected
                          ? 'text-slate-300 hover:text-rose-200 hover:bg-rose-500/20'
                          : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                      }`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {selectedCandidate && (
          <div className="pt-6 border-t border-slate-100 flex flex-col items-center">
            <p className="text-xs font-bold text-slate-500 mb-4 text-center">
              Code PIN pour <span className="font-black text-slate-900">{selectedCandidate.name}</span>
              <span className="block text-[11px] text-slate-400 font-semibold mt-0.5">
                ({getProfileBadgeLabel(selectedCandidate)})
              </span>
            </p>

            <input
              ref={desktopInputRef}
              type="text"
              name="pin-code-field"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                setPin(val)
                if (val.length === 4 || val.length === 6) handleOpenProfile(val)
              }}
              className="opacity-0 absolute -z-10"
              autoFocus
              {...pinInputProps}
            />

            <div
              onClick={() => desktopInputRef.current?.focus()}
              className="flex justify-center items-center gap-3.5 my-3 cursor-pointer p-2"
            >
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                    pin.length > index
                      ? 'bg-blue-600 scale-125 shadow-sm shadow-blue-600/40'
                      : 'bg-slate-200'
                  }`}
                />
              ))}
              {pin.length > 4 && (
                <div className="w-3.5 h-3.5 rounded-full bg-blue-600 scale-125 shadow-sm shadow-blue-600/40 animate-pulse" />
              )}
            </div>

            {error && (
              <p className="text-xs text-rose-600 font-bold mt-2 text-center animate-in fade-in">
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs text-emerald-600 font-bold mt-2 text-center animate-in fade-in">
                {success}
              </p>
            )}

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mt-5">
              <Keyboard size={15} className="text-slate-600" />
              <span>Utilisez les touches numériques de votre clavier</span>
            </div>

            <button
              type="button"
              onClick={() => setShowKeypadOnDesktop(!showKeypadOnDesktop)}
              className="text-[11px] font-bold text-slate-600 hover:text-slate-900 underline mt-2 transition"
            >
              {showKeypadOnDesktop ? 'Masquer le pavé virtuel' : 'Afficher le pavé virtuel'}
            </button>

            {showKeypadOnDesktop && (
              <div className="mt-6 w-full max-w-[260px] mx-auto grid grid-cols-3 gap-y-3 gap-x-4 justify-items-center">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleDigitPress(n)}
                    className="w-14 h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 font-black text-slate-900 text-lg flex items-center justify-center transition active:scale-95 border border-slate-200"
                  >
                    {n}
                  </button>
                ))}
                <div />
                <button
                  type="button"
                  onClick={() => handleDigitPress('0')}
                  className="w-14 h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 font-black text-slate-900 text-lg flex items-center justify-center transition active:scale-95 border border-slate-200"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleDeleteDigit}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-slate-400 hover:text-rose-600 active:scale-95 transition"
                >
                  <Delete size={20} />
                </button>
              </div>
            )}

            <div className="w-full mt-6">
              <button
                type="button"
                disabled={pin.length < 4 || isPending}
                onClick={() => handleOpenProfile()}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>{isPending ? 'Vérification...' : 'Ouvrir la session'}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- MODALE PIN DIRECTION REQUIS --- */}
      {modalAdminPinOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => {
                setModalAdminPinOpen(false)
                setPendingAction(null)
                setAdminPin('')
              }}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <X size={18} />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-900 flex items-center justify-center mb-4">
              <ShieldAlert size={24} />
            </div>

            <h2 className="text-base font-black text-slate-900">Autorisation Direction Principale</h2>
            <p className="text-xs text-slate-500 mt-1 font-semibold leading-relaxed">
              Pour {pendingAction?.type === 'CREATE' 
                ? 'créer ce profil' 
                : pendingAction?.type === 'SET_MAIN_DIRECTION' 
                ? 'changer la Direction Principale' 
                : `supprimer le profil "${pendingAction && 'profileName' in pendingAction ? pendingAction.profileName : ''}"`}, 
              veuillez entrer le code PIN du Directeur Principal ({principalDirectorProfile?.name || 'Direction'}).
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
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
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
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-wider hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending || adminPin.length < 4}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 transition"
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            {profiles.length > 0 && (
              <button
                type="button"
                onClick={() => setModalCreateOpen(false)}
                className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            )}

            <h2 className="text-base font-black text-slate-900">Nouveau profil</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-bold">Sécurisez l'accès avec un code PIN personnel.</p>

            {error && <p className="text-xs text-rose-600 font-bold mt-3">{error}</p>}

            <form onSubmit={handleCreateProfile} className="space-y-4 mt-6">
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  disabled={directionCount >= 2}
                  onClick={() => setType('direction')}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    type === 'direction' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  } ${directionCount >= 2 ? 'opacity-40' : ''}`}
                >
                  Direction ({directionCount}/2)
                </button>
                <button
                  type="button"
                  onClick={() => setType('intermediaire')}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    type === 'intermediaire' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Intermédiaire
                </button>
                <button
                  type="button"
                  disabled={agentCount >= 2}
                  onClick={() => setType('agent')}
                  className={`py-2 text-xs font-bold rounded-lg transition ${
                    type === 'agent' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  } ${agentCount >= 2 ? 'opacity-40' : ''}`}
                >
                  Agent ({agentCount}/2)
                </button>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">Nom du titulaire</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Ousmane"
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">Code PIN (4 chiffres)</label>
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
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
                  {...pinInputProps}
                />
              </div>

              <div className="space-y-2 pt-4">
                <button
                  type="submit"
                  disabled={isPending || !name.trim() || createPin.length !== 4}
                  className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 transition shadow-md"
                >
                  {isPending ? 'Enregistrement...' : 'Créer le profil'}
                </button>

                {profiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setModalCreateOpen(false)}
                    className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition"
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-black text-slate-900">Modifier le code PIN</h2>
              <button
                type="button"
                onClick={() => setModalPinOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
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
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
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
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
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
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
                  {...pinInputProps}
                />
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalPinOpen(false)}
                  className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-wider hover:bg-slate-50 transition"
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
                  className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 transition shadow-md"
                >
                  {isPending ? 'Mise à jour...' : 'Valider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </main>
  )
}