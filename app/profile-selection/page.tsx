'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Delete,
  Fingerprint,
  KeyRound,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  UserRound,
  Keyboard,
  ArrowRight,
} from 'lucide-react'
import { useWorkProfile, type WorkProfileType } from '@/lib/ProfileContext'

type ViewMode = 'loading' | 'select' | 'create' | 'change_pin'

export default function ProfileSelectionPage() {
  const router = useRouter()
  const {
    profiles,
    loading: contextLoading,
    isBiometricAvailable,
    selectProfile,
    unlockWithBiometrics,
    createProfile,
    updatePin,
  } = useWorkProfile()

  const [viewMode, setViewMode] = useState<ViewMode>('loading')
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [isBufferReady, setIsBufferReady] = useState(false)

  // Saisie du PIN
  const [pin, setPin] = useState('')
  const [showKeypadOnDesktop, setShowKeypadOnDesktop] = useState(false)
  const desktopInputRef = useRef<HTMLInputElement>(null)

  // Création
  const [name, setName] = useState('')
  const [type, setType] = useState<WorkProfileType>('agent')

  // Modification PIN
  const [targetProfileId, setTargetProfileId] = useState<string | null>(null)
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  // Feedback & Transition
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // 1. Délai tampon pour éviter tout flash d'interface
  useEffect(() => {
    const timer = setTimeout(() => setIsBufferReady(true), 600)
    return () => clearTimeout(timer)
  }, [])

  // 2. Décision d'affichage
  useEffect(() => {
    if (contextLoading || !isBufferReady) return

    if (profiles.length > 0) {
      setViewMode('select')
      if (!selectedProfileId) {
        setSelectedProfileId(profiles[0].id)
      }
    } else {
      setViewMode('create')
    }
  }, [contextLoading, isBufferReady, profiles, selectedProfileId])

  // Focus automatique du champ sur PC
  useEffect(() => {
    if (viewMode === 'select' && selectedProfileId) {
      desktopInputRef.current?.focus()
    }
  }, [viewMode, selectedProfileId])

  const selectedCandidate = profiles.find((p) => p.id === selectedProfileId)
  const targetCandidate = profiles.find((p) => p.id === targetProfileId)
  const agentCount = profiles.filter((p) => p.profile_type === 'agent').length
  const hasDirection = profiles.some((p) => p.profile_type === 'direction')

  // Règle de sécurité : Biométrie autorisée uniquement si déverrouillée par PIN le jour même
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

  // Gestion de la saisie numérique
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

  // Écoute des touches du clavier physique (PC / Desktop)
  useEffect(() => {
    if (viewMode !== 'select') return

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
  }, [viewMode, pin, selectedCandidate])

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

        router.push('/hajj/dashboard')
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
        router.push('/hajj/dashboard')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Authentification annulée.')
      }
    })
  }

  // Créer un profil
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!name.trim()) {
      setError('Nom du profil obligatoire.')
      return
    }
    if (pin.length < 4 || pin.length > 6) {
      setError('Le code PIN doit comporter 4 à 6 chiffres.')
      return
    }

    startTransition(async () => {
      try {
        await createProfile(name, type, pin)
        setPin('')
        setName('')
        setViewMode('select')
        setSuccess('Profil créé avec succès.')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Création impossible.')
      }
    })
  }

  // Modifier le code PIN
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
      setError('Le nouveau PIN doit comporter entre 4 et 6 chiffres.')
      return
    }

    startTransition(async () => {
      try {
        await updatePin(targetProfileId, oldPin, newPin)
        setOldPin('')
        setNewPin('')
        setConfirmPin('')
        setViewMode('select')
        setSuccess('Code PIN modifié avec succès.')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour.')
      }
    })
  }

  // Écran d'attente neutre
  if (contextLoading || !isBufferReady || viewMode === 'loading') {
    return (
      <main className="fixed inset-0 z-50 bg-[#F4F6F8] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </main>
    )
  }

  return (
    <main className="fixed inset-0 z-50 overflow-y-auto bg-[#F4F6F8] text-slate-900 flex items-center justify-center p-4 sm:p-6 lg:p-8 select-none">
      
      {/* VUE 1 : Sélection & Déverrouillage */}
      {viewMode === 'select' && (
        <>
          {/* --- A. VERSION MOBILE (Ultra-minimaliste, Thème Blanc & Bleu) --- */}
          <div className="sm:hidden w-full h-full flex flex-col justify-between py-4 px-2">
            
            {/* Haut : Sélecteur discret en pilules horizontales */}
            <div>
              <div className="flex items-center justify-center gap-2 overflow-x-auto py-2 no-scrollbar">
                {profiles.map((p) => {
                  const isSelected = selectedProfileId === p.id
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
                      setViewMode('create')
                      setType('agent')
                      setPin('')
                      setError(null)
                    }}
                    className="w-8 h-8 rounded-full bg-white border border-dashed border-blue-300 text-blue-600 flex items-center justify-center active:scale-95 transition shrink-0"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>

              {/* Titre & Points de PIN */}
              <div className="text-center mt-6">
                <h1 className="text-xl font-black tracking-tight text-slate-900">
                  {selectedCandidate?.name ?? 'Sélectionnez un profil'}
                </h1>
                <p className="text-[11px] text-blue-600 mt-1 uppercase tracking-wider font-bold">
                  {selectedCandidate?.profile_type === 'direction' ? 'Direction' : 'Agent'}
                </p>

                {/* Points indicateurs Bleu & Blanc */}
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

            {/* Centre : Pavé tactile minimaliste circulaire (Style iOS/Android épuré) */}
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

                {/* Emplacement gauche : Empreinte si éligible */}
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

                {/* Touche 0 */}
                <button
                  type="button"
                  onClick={() => handleDigitPress('0')}
                  className="w-16 h-16 rounded-full bg-white active:bg-blue-50 border border-slate-100 shadow-sm flex items-center justify-center transition active:scale-95"
                >
                  <span className="text-xl font-black text-slate-900">0</span>
                </button>

                {/* Touche Effacer */}
                <button
                  type="button"
                  onClick={handleDeleteDigit}
                  className="w-16 h-16 rounded-full flex items-center justify-center text-slate-400 active:text-rose-600 transition active:scale-95"
                >
                  <Delete size={20} />
                </button>
              </div>
            </div>

            {/* Bas : Liens de gestion discrets */}
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
                    setViewMode('change_pin')
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
                    setViewMode('create')
                    setType('direction')
                    setPin('')
                    setError(null)
                  }}
                  className="ml-auto font-bold text-blue-600 transition"
                >
                  Créer Direction
                </button>
              )}
            </div>
          </div>

          {/* --- B. VERSION PC / DESKTOP (Console centrée, Focus clavier physique) --- */}
          <div className="hidden sm:flex w-full max-w-lg bg-white border border-blue-100/80 rounded-3xl p-8 sm:p-10 shadow-xl shadow-blue-900/5 flex-col">
            
            {/* En-tête PC */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-black text-slate-900 tracking-tight">
                  Espace de Travail
                </h1>
                {agentCount < 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('create')
                      setType('agent')
                      setPin('')
                      setError(null)
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition"
                  >
                    <Plus size={14} />
                    <span>Ajouter Agent</span>
                  </button>
                )}
              </div>

              {/* Cartes de profils */}
              <div className="grid grid-cols-2 gap-3">
                {profiles.map((p) => {
                  const isSelected = selectedProfileId === p.id
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
                          setViewMode('change_pin')
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

            {/* Zone de saisie PC */}
            {selectedCandidate && (
              <div className="pt-6 border-t border-slate-100 flex flex-col items-center">
                
                <p className="text-xs font-bold text-slate-500 mb-4 text-center">
                  Code PIN pour <span className="font-black text-blue-600">{selectedCandidate.name}</span>
                </p>

                {/* Input masqué captant la saisie physique */}
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

                {/* Indicateurs visuels */}
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

                {/* Pavé virtuel optionnel sur PC */}
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
        </>
      )}

      {/* VUE 2 : Création de profil (Adaptée aux deux plateformes) */}
      {viewMode === 'create' && (
        <div className="w-full max-w-md bg-white border border-blue-100/80 rounded-3xl p-6 sm:p-8 shadow-xl shadow-blue-900/5">
          <h1 className="text-base font-black text-slate-900">Nouveau profil</h1>
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
                  onClick={() => {
                    setViewMode('select')
                    setError(null)
                    setPin('')
                  }}
                  className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition"
                >
                  Annuler
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* VUE 3 : Modification du code PIN */}
      {viewMode === 'change_pin' && (
        <div className="w-full max-w-md bg-white border border-blue-100/80 rounded-3xl p-6 sm:p-8 shadow-xl shadow-blue-900/5">
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => {
                setViewMode('select')
                setError(null)
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-900"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-base font-black text-slate-900">Modifier le code PIN</h1>
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

            <div className="pt-4">
              <button
                type="submit"
                disabled={isPending || oldPin.length < 4 || newPin.length < 4 || confirmPin.length < 4}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 shadow-lg shadow-blue-600/25 transition"
              >
                {isPending ? 'Mise à jour...' : 'Valider'}
              </button>
            </div>
          </form>
        </div>
      )}

    </main>
  )
}