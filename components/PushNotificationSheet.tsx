'use client'

import { useEffect, useState } from 'react'
import {
  Bell,
  BellOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Share,
  PlusSquare,
  Send,
  Sun,
  Moon,
  X,
  Smartphone,
} from 'lucide-react'
import {
  detectPushEnvironment,
  fetchPushStatus,
  sendTestPushNotification,
  subscribeToPush,
  unsubscribeFromPush,
  updatePushPreferences,
  type PushEnvironmentInfo,
} from '@/lib/pushClient'

interface PushNotificationSheetProps {
  open: boolean
  onClose: () => void
  onStatusChange?: (enabled: boolean) => void
}

export default function PushNotificationSheet({
  open,
  onClose,
  onStatusChange,
}: PushNotificationSheetProps) {
  const [env, setEnv] = useState<PushEnvironmentInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [morningEnabled, setMorningEnabled] = useState(true)
  const [eveningEnabled, setEveningEnabled] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    let mounted = true
    setLoading(true)
    setFeedback(null)

    const currentEnv = detectPushEnvironment()
    setEnv(currentEnv)

    fetchPushStatus()
      .then((prefs) => {
        if (!mounted) return
        setEnabled(prefs.enabled)
        setMorningEnabled(prefs.morning_enabled)
        setEveningEnabled(prefs.evening_enabled)
        onStatusChange?.(prefs.enabled)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [open, onStatusChange])

  if (!open) return null

  const handleTogglePush = async () => {
    setBusy(true)
    setFeedback(null)
    try {
      if (enabled) {
        await unsubscribeFromPush()
        setEnabled(false)
        onStatusChange?.(false)
        setFeedback({ type: 'success', text: 'Notifications désactivées sur cet appareil.' })
      } else {
        const res = await subscribeToPush({
          morning_enabled: morningEnabled,
          evening_enabled: eveningEnabled,
        })
        setEnabled(res.enabled)
        setMorningEnabled(res.morning_enabled)
        setEveningEnabled(res.evening_enabled)
        onStatusChange?.(res.enabled)
        setEnv(detectPushEnvironment())
        setFeedback({
          type: 'success',
          text: 'Notifications activées ! Vous recevrez les points matin et soir.',
        })
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Impossible de modifier les notifications.',
      })
      setEnv(detectPushEnvironment())
    } finally {
      setBusy(false)
    }
  }

  const handleToggleSlot = async (slot: 'morning' | 'evening') => {
    const nextMorning = slot === 'morning' ? !morningEnabled : morningEnabled
    const nextEvening = slot === 'evening' ? !eveningEnabled : eveningEnabled

    setMorningEnabled(nextMorning)
    setEveningEnabled(nextEvening)

    if (!enabled) return
    setFeedback(null)
    try {
      await updatePushPreferences({
        morning_enabled: nextMorning,
        evening_enabled: nextEvening,
      })
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Erreur lors de la sauvegarde.',
      })
    }
  }

  const handleSendTest = async () => {
    setTesting(true)
    setFeedback(null)
    try {
      const res = await sendTestPushNotification()
      setFeedback({
        type: 'success',
        text: `Test envoyé : « ${res.title} »`,
      })
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || "Impossible d'envoyer le test.",
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[10000] bg-slate-900/55 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md bg-white rounded-t-[2rem] md:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom md:zoom-in-95 duration-200"
      >
        {/* En-tête */}
        <div className="px-5 pt-3 pb-4 border-b border-slate-100 shrink-0">
          <div className="w-11 h-1.5 bg-slate-200 rounded-full mx-auto mb-3 md:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  enabled
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/80'
                    : 'bg-blue-50 text-blue-600 border border-blue-200/80'
                }`}
              >
                {enabled ? <Bell size={19} /> : <BellOff size={19} />}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-900 tracking-tight truncate">
                  Notifications Push
                </h2>
                <p className="text-xs font-semibold text-slate-500 truncate">
                  Alertes intelligentes matin & soir (Android & iOS)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90 transition cursor-pointer shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corps scrollable */}
        <div className="p-5 overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 size={24} className="animate-spin text-blue-600" />
              <span className="text-xs font-bold">Vérification de l’appareil…</span>
            </div>
          ) : (
            <>
              {/* Cas spécial iOS Safari non installé sur l'écran d'accueil */}
              {env?.needsIosInstall && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200/90 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                    <Smartphone size={16} className="shrink-0" />
                    <span>Installation PWA requise sur iPhone / iPad</span>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed font-medium">
                    Apple autorise les notifications Push uniquement lorsque l’application est installée sur l’écran d’accueil :
                  </p>
                  <ol className="text-xs text-amber-900 font-semibold space-y-1.5 pl-1">
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-200/80 text-amber-900 text-[10px] font-black flex items-center justify-center shrink-0">1</span>
                      <span className="flex items-center gap-1">
                        Touchez <Share size={13} className="inline text-blue-600" /> <strong>Partager</strong> en bas de Safari
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-200/80 text-amber-900 text-[10px] font-black flex items-center justify-center shrink-0">2</span>
                      <span className="flex items-center gap-1">
                        Choisissez <PlusSquare size={13} className="inline text-slate-700" /> <strong>Sur l’écran d’accueil</strong>
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-200/80 text-amber-900 text-[10px] font-black flex items-center justify-center shrink-0">3</span>
                      <span>Ouvrez <strong>Agence Pro</strong> depuis l’icône puis activez les alertes ici.</span>
                    </li>
                  </ol>
                </div>
              )}

              {/* Permission bloquée */}
              {env?.permission === 'denied' && !env.needsIosInstall && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 font-semibold leading-relaxed">
                  Les notifications ont été bloquées pour ce site. Ouvrez les réglages de votre navigateur ou de votre téléphone pour les réautoriser.
                </div>
              )}

              {/* Clé VAPID non configurée */}
              {env && !env.vapidConfigured && (
                <div className="rounded-2xl bg-slate-100 border border-slate-200 p-3.5 text-xs text-slate-600 font-semibold leading-relaxed">
                  Configuration serveur en attente : ajoutez les clés VAPID (<code className="font-mono text-slate-900">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>) dans l’environnement pour activer l’envoi Push.
                </div>
              )}

              {/* Interrupteur principal */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200/90 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900">
                    {enabled ? 'Alertes activées' : 'Activer sur cet appareil'}
                  </p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {env?.platform === 'ios-pwa'
                      ? 'Mode iOS PWA détecté'
                      : env?.platform === 'android-pwa'
                      ? 'Mode Android PWA détecté'
                      : env?.isAndroid
                      ? 'Navigateur Android'
                      : 'Appareil compatible Web Push'}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={busy || !env?.supported || !env?.vapidConfigured}
                  onClick={handleTogglePush}
                  className={`h-10 px-4 rounded-xl text-xs font-black flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer shrink-0 ${
                    enabled
                      ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                  }`}
                >
                  {busy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : enabled ? (
                    'Désactiver'
                  ) : (
                    'Activer'
                  )}
                </button>
              </div>

              {/* Créneaux Matin & Soir */}
              <div className="space-y-2">
                <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">
                  Fréquence quotidienne (2× / jour)
                </p>

                <button
                  type="button"
                  onClick={() => handleToggleSlot('morning')}
                  className="w-full p-3.5 rounded-2xl bg-white border border-slate-200/90 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/70 flex items-center justify-center shrink-0">
                      <Sun size={17} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900">Point du matin (08h00)</p>
                      <p className="text-[11px] text-slate-500 font-medium truncate">
                        % impayés, passeports manquants & suivi Gouv
                      </p>
                    </div>
                  </div>
                  <div
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
                      morningEnabled ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                        morningEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleSlot('evening')}
                  className="w-full p-3.5 rounded-2xl bg-white border border-slate-200/90 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/70 flex items-center justify-center shrink-0">
                      <Moon size={17} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900">Bilan du soir (19h00)</p>
                      <p className="text-[11px] text-slate-500 font-medium truncate">
                        Montant encaissé aujourd’hui & rappel d’inactivité
                      </p>
                    </div>
                  </div>
                  <div
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
                      eveningEnabled ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                        eveningEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </button>
              </div>

              {/* Exemples de notifications envoyées */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Ce que vous recevrez automatiquement
                </p>
                <ul className="space-y-1.5 text-[11.5px] text-slate-600 font-medium">
                  <li>• Pourcentage de pèlerins n’ayant pas encore soldé leur forfait</li>
                  <li>• Pourcentage de dossiers sans passeport enregistré</li>
                  <li>• Montant total encaissé dans la journée</li>
                  <li>• Rappel doux si vous n’avez pas ouvert l’app depuis plusieurs jours</li>
                </ul>
              </div>

              {/* Message retour */}
              {feedback && (
                <div
                  className={`rounded-2xl p-3 text-xs font-bold flex items-start gap-2 ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-600" />
                  ) : (
                    <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}

              {/* Bouton test immédiat */}
              {enabled && (
                <button
                  type="button"
                  disabled={testing}
                  onClick={handleSendTest}
                  className="w-full h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
                >
                  {testing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Envoi en cours…
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Envoyer une notification test maintenant
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* Pied safe-area mobile */}
        <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-2xl bg-slate-100 text-slate-700 font-black text-xs active:scale-[0.98] transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
