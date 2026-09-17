'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Delete,
  Fingerprint,
  KeyRound,
  ArrowLeft,
  ShieldCheck,
  UserRound,
  Keyboard,
  ArrowRight,
  Lock,
  X,
} from 'lucide-react'
import { useWorkProfile, type WorkProfileType } from '@/lib/ProfileContext'
import { usePowerSync } from '@powersync/react'
import { supabase, getUser } from '@/lib/supabase'

export default function ProfileSelectionPage() {
  const router = useRouter()
  const db = usePowerSync()

  const {
    profiles,
    isBiometricAvailable,
    selectProfile,
    unlockWithBiometrics,
    createProfile,
    updatePin,
  } = useWorkProfile()

  // 1. Initialisation verrouillée sur l'animation orbitale
  const [isInitializing, setIsInitializing] = useState(true)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  
  // Modale de création et de code PIN (fermées par défaut)
  const [modalCreateOpen, setModalCreateOpen] = useState(false)
  const [modalPinOpen, setModalPinOpen] = useState(false)

  // Saisie du PIN
  const [pin, setPin] = useState('')
  const [showKeypadOnDesktop, setShowKeypadOnDesktop] = useState(false)
  const desktopInputRef = useRef<HTMLInputElement>(null)

  // Champs création
  const [name, setName] = useState('')
  const [type, setType] = useState<WorkProfileType>('agent')

  // Champs modification PIN
  const [targetProfileId, setTargetProfileId] = useState<string | null>(null)
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  // Messages & feedback
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // 2. Élimination du clignotement multi-appareils (Vérification locale + secours Supabase direct)
  useEffect(() => {
    let isMounted = true

    async function resolveProfiles() {
      try {
        const { data: authData } = await getUser()
        const uid = authData.user?.id

        if (!uid) {
          if (isMounted) {
            setModalCreateOpen(false)
            setIsInitializing(false)
          }
          return
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          if (isMounted) {
            setModalCreateOpen(false)
            setIsInitializing(false)
          }
          return
        }

        // Étape A : Vérification instantanée dans SQLite local
        const localRows = await db.getAll<{ id: string }>(
          'SELECT id FROM account_profiles WHERE user_id = ?',
          [uid]
        ).catch(() => [])

        if (localRows && localRows.length > 0) {
          if (isMounted) {
            setSelectedProfileId(localRows[0].id)
            setModalCreateOpen(false)
            setIsInitializing(false)
            try {
              localStorage.setItem('has_created_profile_marker', 'true')
            } catch {}
          }
          return
        }

        // Étape B : Nouvel appareil ! SQLite est vide parce que PowerSync n'a pas encore fini de répliquer.
        // On interroge Supabase directement en HTTPS pour voir si le profil existe sur un autre appareil.
        const { data: remoteProfiles } = await supabase
          .from('account_profiles')
          .select('id, name, profile_type, pin_hash, created_at, updated_at')
          .eq('user_id', uid)

        if (remoteProfiles && remoteProfiles.length > 0) {
          try {
            localStorage.setItem('has_created_profile_marker', 'true')
          } catch {}

          // Injection immédiate dans SQLite pour court-circuiter l'attente de 10s de PowerSync
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
            setSelectedProfileId(remoteProfiles[0].id)
            setModalCreateOpen(false)
            setIsInitializing(false)
          }
          return
        }

        // Étape C : Zéro profil ni en local, ni sur le serveur Supabase -> Seule situation où on ouvre la création
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
  }, [db])

  // Synchronisation avec les mises à jour réactives de PowerSync
  useEffect(() => {
    if (profiles.length > 0) {
      if (!selectedProfileId) {
        setSelectedProfileId(profiles[0].id)
      }
      setModalCreateOpen(false)
      setIsInitializing(false)
    }
  }, [profiles, selectedProfileId])

  // Focus automatique du clavier sur PC
  useEffect(() => {
    if (!isInitializing && !modalCreateOpen && !modalPinOpen) {
      desktopInputRef.current?.focus()
    }
  }, [isInitializing, modalCreateOpen, modalPinOpen, selectedProfileId])

  const selectedCandidate = profiles.find((p) => p.id === selectedProfileId) || profiles[0]
  const targetCandidate = profiles.find((p) => p.id === targetProfileId)
  const agentCount = profiles.filter((p) => p.profile_type === 'agent').length
  const hasDirection = profiles.some((p) => p.profile_type === 'direction')

  // Règle biométrique : PIN obligatoire 1x par jour
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

  const handleDigitPress = (digit: string) => {
    if (pin.length < 6) {
      const nextPin = pin + digit
      setPin(nextPin)
      setError(null)
      if (nextPin.length >= 4 && selectedCandidate) {
        handleOpenProfile(nextPin)
      }
    }
  }

  const handleDeleteDigit = () => {
    setPin((prev) => prev.slice(0, -1))
    setError(null)
  }

  // Écoute des touches physiques clavier (PC)
  useEffect(() => {
    if (isInitializing || modalCreateOpen || modalPinOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'password') return

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
  }, [isInitializing, modalCreateOpen, modalPinOpen, pin, selectedCandidate])

  // Déverrouillage par code PIN
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

        router.push('/')
      } catch (err: unknown) {
        setPin('')
        setError(err instanceof Error ? err.message : 'Code PIN incorrect.')
        desktopInputRef.current?.focus()
      }
    })
  }

  // Déverrouillage biométrique
  const handleBiometricUnlock = async () => {
    if (!selectedCandidate) return
    setError(null)

    startTransition(async () => {
      try {
        await unlockWithBiometrics(selectedCandidate)
        router.push('/')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Authentification annulée.')
      }
    })
  }

  // Création profil
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!name.trim()) {
      setError('Nom requis.')
      return
    }
    if (pin.length < 4 || pin.length > 6) {
      setError('Le code PIN doit comporter 4 à 6 chiffres.')
      return
    }

    startTransition(async () => {
      try {
        await createProfile(name, type, pin)
        try {
          localStorage.setItem('has_created_profile_marker', 'true')
        } catch {}
        setPin('')
        setName('')
        setModalCreateOpen(false)
        setIsInitializing(false)
        setSuccess('Profil créé avec succès.')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Création impossible.')
      }
    })
  }

  // Modification PIN
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!targetProfileId) return
    if (newPin !== confirmPin) {
      setError('Les codes PIN ne correspondent pas.')
      return
    }
    if (newPin.length < 4 || newPin.length > 6) {
      setError('Le nouveau PIN doit comporter 4 à 6 chiffres.')
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

  // 3. Animation orbitale Blanc & Bleu tant que la recherche est active
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
            <div className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
          </div>
        </div>

        <p className="mt-8 text-xs font-black uppercase tracking-widest text-slate-500">
          Vérification de session...
        </p>

        <div className="mt-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
        </div>
      </main>
    )
  }

  return (
    <main className="fixed inset-0 z-50 overflow-y-auto bg-[#F4F6F8] text-slate-900 flex items-center justify-center p-4 sm:p-6 lg:p-8 select-none">
      
      {/* --- A. VERSION MOBILE --- */}
      <div className="sm:hidden w-full h-full flex flex-col justify-between py-4 px-2">
        <div>
          <div className="flex items-center justify-center gap-2 overflow-x-auto py-2 no-scrollbar">
            {profiles.map((p) => {
              const isSelected = (selectedCandidate?.id || selectedProfileId) === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedProfileId(p.id)
                    setPin('')
                    setError(null)
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-bold tracking-tight transition-all shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  {p.name}
                </button>
              )
            })}

            {agentCount < 2 && (
              <button
                type="button"
                onClick={() => {
                  setType('agent')
                  setPin('')
                  setError(null)
                  setModalCreateOpen(true)
                }}
                className="w-8 h-8 rounded-full bg-white border border-dashed border-blue-300 text-blue-600 flex items-center justify-center active:scale-95 transition shrink-0"
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          <div className="text-center mt-6">
            <h1 className="text-xl font-black tracking-tight text-slate-900">
              {selectedCandidate?.name ?? 'Sélectionnez un profil'}
            </h1>
            <p className="text-[11px] text-blue-600 mt-1 uppercase tracking-wider font-bold">
              {selectedCandidate?.profile_type === 'direction' ? 'Direction' : 'Agent'}
            </p>

            <div className="flex justify-center items-center gap-3.5 my-7">
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

        <div className="pt-4 pb-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-200/60">
          {selectedCandidate && (
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
              className="font-bold text-slate-500 hover:text-blue-600 transition"
            >
              Changer de code PIN
            </button>
          )}

          {!hasDirection && (
            <button
              type="button"
              onClick={() => {
                setType('direction')
                setPin('')
                setError(null)
                setModalCreateOpen(true)
              }}
              className="ml-auto font-bold text-blue-600 transition"
            >
              Créer Direction
            </button>
          )}
        </div>
      </div>

      {/* --- B. VERSION PC / DESKTOP --- */}
      <div className="hidden sm:flex w-full max-w-lg bg-white border border-blue-100/80 rounded-3xl p-8 sm:p-10 shadow-xl shadow-blue-900/5 flex-col">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              Espace de Travail
            </h1>
            {agentCount < 2 && (
              <button
                type="button"
                onClick={() => {
                  setType('agent')
                  setPin('')
                  setError(null)
                  setModalCreateOpen(true)
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition"
              >
                <Plus size={14} />
                <span>Ajouter Agent</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {profiles.map((p) => {
              const isSelected = (selectedCandidate?.id || selectedProfileId) === p.id
              const isDir = p.profile_type === 'direction'

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedProfileId(p.id)
                    setPin('')
                    setError(null)
                    desktopInputRef.current?.focus()
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/25 ring-2 ring-blue-100'
                      : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-blue-300 hover:bg-blue-50/40'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : isDir
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {isDir ? <ShieldCheck size={18} /> : <UserRound size={18} />}
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-bold truncate leading-tight">{p.name}</p>
                      <p
                        className={`text-[10px] font-bold tracking-wider uppercase ${
                          isSelected ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        {isDir ? 'Direction' : 'Agent'}
                      </p>
                    </div>
                  </div>

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
                        ? 'text-blue-100 hover:text-white hover:bg-white/20'
                        : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    <KeyRound size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {selectedCandidate && (
          <div className="pt-6 border-t border-slate-100 flex flex-col items-center">
            <p className="text-xs font-bold text-slate-500 mb-4 text-center">
              Code PIN pour <span className="font-black text-blue-600">{selectedCandidate.name}</span>
            </p>

            <input
              ref={desktopInputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '')
                setPin(val)
                if (val.length >= 4) handleOpenProfile(val)
              }}
              className="opacity-0 absolute -z-10"
              autoFocus
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
              <Keyboard size={15} className="text-blue-600" />
              <span>Utilisez les touches numériques de votre clavier</span>
            </div>

            <button
              type="button"
              onClick={() => setShowKeypadOnDesktop(!showKeypadOnDesktop)}
              className="text-[11px] font-bold text-blue-600 hover:underline mt-2 transition"
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
                    className="w-14 h-14 rounded-2xl bg-blue-50/60 hover:bg-blue-100 active:bg-blue-200 font-black text-blue-900 text-lg flex items-center justify-center transition active:scale-95 shadow-sm border border-blue-100/50"
                  >
                    {n}
                  </button>
                ))}
                <div />
                <button
                  type="button"
                  onClick={() => handleDigitPress('0')}
                  className="w-14 h-14 rounded-2xl bg-blue-50/60 hover:bg-blue-100 active:bg-blue-200 font-black text-blue-900 text-lg flex items-center justify-center transition active:scale-95 shadow-sm border border-blue-100/50"
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
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>{isPending ? 'Vérification...' : 'Ouvrir la session'}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- MODALE CRÉATION DE PROFIL (Complètement fermée par défaut) --- */}
      {modalCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-blue-100/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
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
            <p className="text-xs text-slate-400 mt-0.5 font-bold">Sécurisez l'accès avec un code PIN personnel.</p>

            {error && <p className="text-xs text-rose-600 font-bold mt-3">{error}</p>}

            <form onSubmit={handleCreateProfile} className="space-y-4 mt-6">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  disabled={hasDirection}
                  onClick={() => setType('direction')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                    type === 'direction' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                  } ${hasDirection ? 'opacity-40' : ''}`}
                >
                  Direction
                </button>
                <button
                  type="button"
                  disabled={agentCount >= 2}
                  onClick={() => setType('agent')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                    type === 'agent' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                  } ${agentCount >= 2 ? 'opacity-40' : ''}`}
                >
                  Agent
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
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">Code PIN (4 à 6 chiffres)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
                />
              </div>

              <div className="space-y-2 pt-4">
                <button
                  type="submit"
                  disabled={isPending || !name || pin.length < 4}
                  className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 shadow-lg shadow-blue-600/25 transition"
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
          <div className="w-full max-w-md bg-white border border-blue-100/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
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
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">Ancien PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">Nouveau PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1">Confirmer le nouveau PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold tracking-widest text-slate-900 focus:bg-white focus:border-blue-600 outline-none transition"
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
                  disabled={isPending || oldPin.length < 4 || newPin.length < 4 || confirmPin.length < 4}
                  className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 shadow-lg shadow-blue-600/25 transition"
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