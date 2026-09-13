'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  UserRound,
  LockKeyhole,
  Plus,
  ArrowRight,
  Delete,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  KeyRound,
  Loader2,
  ArrowLeft,
  Fingerprint,
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

  // État initial bloqué sur 'loading'
  const [viewMode, setViewMode] = useState<ViewMode>('loading')
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [isBufferReady, setIsBufferReady] = useState(false)

  // Saisie du PIN
  const [pin, setPin] = useState('')

  // Création
  const [name, setName] = useState('')
  const [type, setType] = useState<WorkProfileType>('agent')

  // Modification du PIN
  const [targetProfileId, setTargetProfileId] = useState<string | null>(null)
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  // Feedback utilisateur
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // 1. Temporisation de sécurité : garantit que la DB locale a fini de réhydrater avant tout affichage
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsBufferReady(true)
    }, 600) // 600ms suffisent pour laisser SQLite/PowerSync charger les profils existants

    return () => clearTimeout(timer)
  }, [])

  // 2. Décision du mode d'affichage une fois le contexte ET le tampon de sécurité prêts
  useEffect(() => {
    if (contextLoading || !isBufferReady) return

    if (profiles.length > 0) {
      setViewMode('select')
      if (!selectedProfileId) {
        setSelectedProfileId(profiles[0].id)
      }
    } else {
      // Aucun profil détecté après le délai : on affiche la création
      setViewMode('create')
    }
  }, [contextLoading, isBufferReady, profiles, selectedProfileId])

  const selectedCandidate = profiles.find((p) => p.id === selectedProfileId)
  const targetCandidate = profiles.find((p) => p.id === targetProfileId)
  const agentCount = profiles.filter((p) => p.profile_type === 'agent').length
  const hasDirection = profiles.some((p) => p.profile_type === 'direction')

  const handleDigitPress = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit)
      setError(null)
    }
  }

  const handleDeleteDigit = () => {
    setPin((prev) => prev.slice(0, -1))
    setError(null)
  }

  // Déverrouillage par code PIN
  const handleOpenProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedCandidate) {
      setError('Veuillez sélectionner un profil.')
      return
    }
    if (pin.length < 4) {
      setError('Entrez un code PIN valide (au moins 4 chiffres).')
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await selectProfile(selectedCandidate, pin)
        router.push('/hajj/dashboard')
      } catch (err: unknown) {
        setPin('')
        setError(err instanceof Error ? err.message : 'Code PIN incorrect.')
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
        setError(err instanceof Error ? err.message : 'Authentification biométrique annulée.')
      }
    })
  }

  // Créer un profil
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!name.trim()) {
      setError('Le nom du profil est obligatoire.')
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
        setSuccess(`Le profil « ${name.trim()} » a été créé avec succès.`)
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
      setError('La confirmation ne correspond pas au nouveau code PIN.')
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
        setSuccess('Votre code PIN a été modifié avec succès.')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erreur lors du changement de PIN.')
      }
    })
  }

  // Écran de chargement propre tant que le buffer de sécurité n'est pas écoulé
  if (contextLoading || !isBufferReady || viewMode === 'loading') {
    return (
      <main className="min-h-screen w-full lg:-ml-64 lg:w-[calc(100%+16rem)] bg-[#F4F6F8] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={32} />
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">
            Chargement de l'espace de travail...
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen w-full lg:-ml-64 lg:w-[calc(100%+16rem)] bg-[#F4F6F8] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 sm:p-10 transition-all">
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-black tracking-wider uppercase mb-3">
              <LockKeyhole size={13} />
              Session sécurisée (15 min)
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {viewMode === 'create'
                ? 'Créer un profil'
                : viewMode === 'change_pin'
                ? 'Modifier le code PIN'
                : 'Espace de Travail'}
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              {viewMode === 'create'
                ? 'Configurez votre compte protégé par code PIN.'
                : viewMode === 'change_pin'
                ? `Mise à jour du code pour ${targetCandidate?.name ?? 'le profil'}.`
                : 'Sélectionnez votre profil pour accéder aux dossiers.'}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-bold flex items-center gap-2.5">
              <AlertCircle size={18} className="shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold flex items-center gap-2.5">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {/* VUE 1 : Sélection & Saisie du PIN / Biométrie */}
          {viewMode === 'select' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                      }}
                      className={`relative p-4 rounded-2xl text-left border-2 transition-all cursor-pointer flex items-center gap-3.5 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm ring-2 ring-blue-500/20'
                          : 'border-slate-100 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                          isDir ? 'bg-blue-600 text-white shadow-sm' : 'bg-emerald-600 text-white shadow-sm'
                        }`}
                      >
                        {isDir ? <ShieldCheck size={22} /> : <UserRound size={22} />}
                      </div>

                      <div className="truncate flex-1">
                        <h2 className="font-black text-slate-900 text-sm truncate">{p.name}</h2>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          {isDir ? 'Direction' : 'Agent'}
                        </span>
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
                        className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                      >
                        <KeyRound size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {selectedCandidate && (
                <div className="mt-6 pt-6 border-t border-slate-100 space-y-5">
                  <div className="text-center">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Code PIN pour <span className="text-slate-900 font-black">{selectedCandidate.name}</span>
                    </p>

                    <div className="flex justify-center items-center gap-3 my-4">
                      {[0, 1, 2, 3].map((index) => (
                        <div
                          key={index}
                          className={`w-4 h-4 rounded-full border-2 transition-all ${
                            pin.length > index
                              ? 'bg-slate-900 border-slate-900 scale-110 shadow-sm'
                              : 'border-slate-300 bg-transparent'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {isBiometricAvailable && (
                    <button
                      type="button"
                      onClick={handleBiometricUnlock}
                      disabled={isPending}
                      className="w-full py-3.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 transition active:scale-98"
                    >
                      <Fingerprint size={18} className="text-blue-600" />
                      <span>Déverrouiller avec Empreinte / Face ID</span>
                    </button>
                  )}

                  <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleDigitPress(num)}
                        className="h-13 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200/80 font-black text-slate-800 text-xl shadow-xs transition-transform active:scale-95"
                      >
                        {num}
                      </button>
                    ))}

                    <div />

                    <button
                      type="button"
                      onClick={() => handleDigitPress('0')}
                      className="h-13 rounded-2xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200/80 font-black text-slate-800 text-xl shadow-xs transition-transform active:scale-95"
                    >
                      0
                    </button>

                    <button
                      type="button"
                      onClick={handleDeleteDigit}
                      className="h-13 rounded-2xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-100 text-rose-700 flex items-center justify-center transition-transform active:scale-95"
                    >
                      <Delete size={20} />
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={pin.length < 4 || isPending}
                    onClick={() => handleOpenProfile()}
                    className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 ${
                      pin.length >= 4 && !isPending
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    }`}
                  >
                    <span>{isPending ? 'Vérification...' : 'Déverrouiller le profil'}</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold border-t border-slate-100">
                {agentCount < 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('create')
                      setType('agent')
                      setPin('')
                      setError(null)
                    }}
                    className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition"
                  >
                    <Plus size={15} />
                    Ajouter un compte Agent
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
                    className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition"
                  >
                    <Sparkles size={14} />
                    Créer le profil Direction
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VUE 2 : Création d'un profil */}
          {viewMode === 'create' && (
            <form onSubmit={handleCreateProfile} className="space-y-4">
              <div>
                <label className="text-[11px] font-black uppercase text-slate-500 ml-1 block mb-1.5">
                  Type de profil
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={hasDirection}
                    onClick={() => setType('direction')}
                    className={`p-3.5 rounded-xl border text-left font-black text-xs transition flex items-center gap-2.5 ${
                      type === 'direction'
                        ? 'border-blue-600 bg-blue-50/60 text-blue-900 ring-2 ring-blue-500/20'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300'
                    } ${hasDirection ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <ShieldCheck size={18} className="text-blue-600 shrink-0" />
                    <span>Direction</span>
                  </button>

                  <button
                    type="button"
                    disabled={agentCount >= 2}
                    onClick={() => setType('agent')}
                    className={`p-3.5 rounded-xl border text-left font-black text-xs transition flex items-center gap-2.5 ${
                      type === 'agent'
                        ? 'border-emerald-600 bg-emerald-50/60 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300'
                    } ${agentCount >= 2 ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <UserRound size={18} className="text-emerald-600 shrink-0" />
                    <span>Agent</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-500 ml-1 block mb-1.5">
                  Nom du profil
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Direction, Agent Caisse, etc."
                  required
                  className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-sm font-bold focus:border-blue-600 focus:bg-white outline-none transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-500 ml-1 block mb-1.5">
                  Code PIN (4 à 6 chiffres)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-sm font-bold focus:border-blue-600 focus:bg-white outline-none tracking-widest transition"
                />
              </div>

              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  disabled={isPending || !name || pin.length < 4}
                  className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-98 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={18} />
                  <span>{isPending ? 'Enregistrement...' : 'Créer le profil'}</span>
                </button>

                {profiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('select')
                      setError(null)
                      setPin('')
                    }}
                    className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
                  >
                    Annuler et retourner
                  </button>
                )}
              </div>
            </form>
          )}

          {/* VUE 3 : Modification du code PIN */}
          {viewMode === 'change_pin' && (
            <form onSubmit={handleChangePin} className="space-y-4">
              <div>
                <label className="text-[11px] font-black uppercase text-slate-500 ml-1 block mb-1.5">
                  Ancien code PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-sm font-bold focus:border-blue-600 focus:bg-white outline-none tracking-widest transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-500 ml-1 block mb-1.5">
                  Nouveau code PIN (4 à 6 chiffres)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-sm font-bold focus:border-blue-600 focus:bg-white outline-none tracking-widest transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-500 ml-1 block mb-1.5">
                  Confirmer le nouveau code PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-sm font-bold focus:border-blue-600 focus:bg-white outline-none tracking-widest transition"
                />
              </div>

              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  disabled={isPending || oldPin.length < 4 || newPin.length < 4 || confirmPin.length < 4}
                  className="w-full py-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-98 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <KeyRound size={18} />
                  <span>{isPending ? 'Validation...' : 'Valider le nouveau PIN'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode('select')
                    setError(null)
                    setOldPin('')
                    setNewPin('')
                    setConfirmPin('')
                  }}
                  className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft size={14} />
                  Retour à la sélection
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-center gap-2 text-[11px] font-bold text-slate-400 text-center">
            <LockKeyhole size={13} className="text-slate-400 shrink-0" />
            <span>Verrouillage automatique après 15 min d'inactivité • Support Touch/Face ID</span>
          </div>

        </div>
      </div>
    </main>
  )
}