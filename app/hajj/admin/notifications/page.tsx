'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Send,
  Smartphone,
  Sun,
  Moon,
  Trash2,
  Building2,
  History,
  ShieldAlert,
  Power,
} from 'lucide-react'

interface AdminPushSettings {
  global_enabled: boolean
  morning_enabled: boolean
  evening_enabled: boolean
  inactivity_days_threshold: number
  updated_at?: string | null
}

interface AdminPushStats {
  totalDevices: number
  activeDevices: number
  coveredAgences: number
  iosCount: number
  androidCount: number
  desktopCount: number
}

interface AdminPushSub {
  id: string
  user_id: string
  user_name: string
  user_role: string
  agence_id: string | null
  agence_name: string
  platform: string
  enabled: boolean
  active_campagne?: number | null
  last_seen_at: string | null
  last_notified_at: string | null
  last_slot_sent: string | null
}

interface AdminPushLog {
  id: string
  slot: string
  category: string
  title: string
  body: string
  url: string
  sent_count: number
  created_at: string
  agence_name: string
  user_name: string
}

export default function AdminNotificationsPage() {
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [vapidConfigured, setVapidConfigured] = useState(true)
  const [settings, setSettings] = useState<AdminPushSettings>({
    global_enabled: true,
    morning_enabled: true,
    evening_enabled: true,
    inactivity_days_threshold: 2,
  })
  const [stats, setStats] = useState<AdminPushStats>({
    totalDevices: 0,
    activeDevices: 0,
    coveredAgences: 0,
    iosCount: 0,
    androidCount: 0,
    desktopCount: 0,
  })
  const [subscriptions, setSubscriptions] = useState<AdminPushSub[]>([])
  const [agences, setAgences] = useState<Array<{ id: string; nom_agence: string }>>([])
  const [logs, setLogs] = useState<AdminPushLog[]>([])

  // Formulaire Broadcast manuel
  const [targetAgence, setTargetAgence] = useState<string>('ALL')
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastBody, setBroadcastBody] = useState('')
  const [broadcastUrl, setBroadcastUrl] = useState('/hajj/dashboard')
  const [broadcastUrgency, setBroadcastUrgency] = useState<'high' | 'normal'>('high')

  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ type, text })
    setTimeout(() => setFeedback(null), 5000)
  }

  const getToken = async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  const loadOverview = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const token = await getToken()
      if (!token) {
        setForbidden(true)
        return
      }

      const res = await fetch('/api/push/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 401 || res.status === 403) {
        setForbidden(true)
        return
      }

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur chargement')

      setForbidden(false)
      setVapidConfigured(Boolean(json.vapidConfigured))
      if (json.settings) setSettings(json.settings)
      if (json.stats) setStats(json.stats)
      setSubscriptions(json.subscriptions || [])
      setAgences(json.agences || [])
      setLogs(json.logs || [])
    } catch (err: any) {
      notify(err?.message || 'Impossible de charger le centre de contrôle.', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOverview(true)
  }, [loadOverview])

  const handleUpdateGlobal = async (patch: Partial<AdminPushSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    setBusyAction('settings')
    try {
      const token = await getToken()
      const res = await fetch('/api/push/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur sauvegarde')
      if (json.settings) setSettings(json.settings)
      notify('Paramètres globaux enregistrés.')
    } catch (err: any) {
      notify(err?.message || 'Erreur lors de la mise à jour.', 'error')
      void loadOverview(false)
    } finally {
      setBusyAction(null)
    }
  }

  const handleToggleDevice = async (sub: AdminPushSub) => {
    setBusyAction(sub.id)
    try {
      const token = await getToken()
      const res = await fetch('/api/push/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'toggle_device',
          subscription_id: sub.id,
          enabled: !sub.enabled,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur mise à jour')
      await loadOverview(false)
      notify(sub.enabled ? 'Appareil mis en pause.' : 'Appareil réactivé.')
    } catch (err: any) {
      notify(err?.message || 'Erreur appareil.', 'error')
    } finally {
      setBusyAction(null)
    }
  }

  const handleDeleteDevice = async (sub: AdminPushSub) => {
    setBusyAction(sub.id)
    try {
      const token = await getToken()
      const res = await fetch('/api/push/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'delete_device',
          subscription_id: sub.id,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur suppression')
      await loadOverview(false)
      notify('Appareil retiré de la liste.')
    } catch (err: any) {
      notify(err?.message || 'Erreur suppression.', 'error')
    } finally {
      setBusyAction(null)
    }
  }

  const handleTriggerDigest = async (mode: 'digest_morning' | 'digest_evening') => {
    setBusyAction(mode)
    try {
      const token = await getToken()
      const res = await fetch('/api/push/admin/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          agence_id: targetAgence,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Échec d’envoi')
      notify(
        `${mode === 'digest_morning' ? 'Point Matin' : 'Bilan Soir'} envoyé à ${json.sent} appareil(s) (${json.usersNotified} utilisateur(s)).`
      )
      await loadOverview(false)
    } catch (err: any) {
      notify(err?.message || 'Erreur lors de l’envoi.', 'error')
    } finally {
      setBusyAction(null)
    }
  }

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      notify('Renseignez un titre et un message.', 'error')
      return
    }
    setBusyAction('broadcast')
    try {
      const token = await getToken()
      const res = await fetch('/api/push/admin/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: 'broadcast',
          agence_id: targetAgence,
          title: broadcastTitle.trim(),
          body: broadcastBody.trim(),
          url: broadcastUrl,
          urgency: broadcastUrgency,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Échec de diffusion')
      setBroadcastTitle('')
      setBroadcastBody('')
      notify(`Notification diffusée avec succès sur ${json.sent} appareil(s).`)
      await loadOverview(false)
    } catch (err: any) {
      notify(err?.message || 'Erreur de diffusion.', 'error')
    } finally {
      setBusyAction(null)
    }
  }

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return '—'
    }
  }

  const platformLabel = (p: string) => {
    if (p === 'ios-pwa') return 'iPhone / iPad PWA'
    if (p === 'android-pwa') return 'Android PWA'
    if (p === 'android-web') return 'Android Web'
    if (p === 'desktop') return 'Ordinateur'
    return 'Web'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 p-6">
        <Loader2 size={28} className="animate-spin text-blue-600" />
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">
          Chargement du centre Notifications Push…
        </p>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert size={28} />
          </div>
          <h1 className="text-lg font-black text-slate-900">Accès réservé à l’administrateur</h1>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Seul le compte administrateur peut piloter les notifications push et déclencher les envois.
          </p>
          <Link
            href="/hajj/dashboard"
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-slate-900 text-white text-xs font-black"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 sm:px-6 py-6 sm:py-8 pb-28">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* En-tête sombre Admin */}
        <div className="rounded-3xl bg-slate-900 text-white p-6 sm:p-7 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <Link
                href="/hajj/admin"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition"
              >
                <ArrowLeft size={14} /> Retour au pilotage Admin
              </Link>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2.5">
                <Bell size={22} className="text-blue-400" />
                Centre de Contrôle — Notifications Push
              </h1>
              <p className="text-xs text-slate-400 max-w-2xl">
                Contrôle exclusif administrateur : activez ou mettez en pause les envois automatiques matin/soir, gérez les appareils connectés et diffusez des alertes ciblées. Les utilisateurs reçoivent uniquement les notifications.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadOverview(false)}
              className="h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-black flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw size={14} /> Actualiser
            </button>
          </div>
        </div>

        {/* Bannière feedback */}
        {feedback && (
          <div
            className={`rounded-2xl px-4 py-3 text-xs font-bold flex items-center gap-2 border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {!vapidConfigured && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 font-bold">
            Attention : les clés VAPID ne sont pas détectées sur le serveur (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`).
          </div>
        )}

        {/* 4 KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Appareils actifs
            </p>
            <p className="text-2xl font-black text-slate-900 tabular-nums">
              {stats.activeDevices}
              <span className="text-xs font-bold text-slate-400"> / {stats.totalDevices}</span>
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Agences abonnées
            </p>
            <p className="text-2xl font-black text-blue-600 tabular-nums">
              {stats.coveredAgences}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              iOS PWA / Android
            </p>
            <p className="text-xl font-black text-slate-900 tabular-nums">
              {stats.iosCount} iOS <span className="text-slate-300">•</span> {stats.androidCount} And.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Statut global
            </p>
            <p
              className={`text-lg font-black ${
                settings.global_enabled ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {settings.global_enabled ? 'Actif (2× / jour)' : 'En pause'}
            </p>
          </div>
        </div>

        {/* Grille 2 colonnes : Pilotage auto + Diffusion manuelle */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Pilotage des envois automatiques */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
                  Pilotage automatique (2× / jour)
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Contrôle global des crons quotidiens 08h00 et 19h00 UTC.
                </p>
              </div>
              <button
                type="button"
                disabled={busyAction === 'settings'}
                onClick={() => handleUpdateGlobal({ global_enabled: !settings.global_enabled })}
                className={`h-9 px-3.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                  settings.global_enabled
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-rose-600 text-white hover:bg-rose-700'
                }`}
              >
                <Power size={14} />
                {settings.global_enabled ? 'Activé' : 'Coupé'}
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                    <Sun size={17} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900">Point Matin (08h00)</p>
                    <p className="text-[11px] text-slate-500 font-medium truncate">
                      % impayés, % sans passeport & suivi Gouv
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyAction === 'settings'}
                  onClick={() => handleUpdateGlobal({ morning_enabled: !settings.morning_enabled })}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${
                    settings.morning_enabled ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                      settings.morning_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0">
                    <Moon size={17} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900">Bilan Soir (19h00)</p>
                    <p className="text-[11px] text-slate-500 font-medium truncate">
                      Encaissements du jour & relance d’inactivité
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyAction === 'settings'}
                  onClick={() => handleUpdateGlobal({ evening_enabled: !settings.evening_enabled })}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${
                    settings.evening_enabled ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                      settings.evening_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Déclenchement manuel immédiat */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">
                Déclencher manuellement maintenant (selon la cible choisie)
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleTriggerDigest('digest_morning')}
                  className="h-11 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                >
                  {busyAction === 'digest_morning' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sun size={14} className="text-amber-300" />
                  )}
                  <span>Envoyer Point Matin</span>
                </button>

                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleTriggerDigest('digest_evening')}
                  className="h-11 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                >
                  {busyAction === 'digest_evening' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Moon size={14} className="text-blue-200" />
                  )}
                  <span>Envoyer Bilan Soir</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Envoi d'une notification personnalisée */}
          <form
            onSubmit={handleSendBroadcast}
            className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs"
          >
            <div className="border-b border-slate-100 pb-3.5">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
                Envoyer une notification personnalisée
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Diffusez un message instantané à toutes les agences ou à une agence précise.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Cible
                </label>
                <select
                  value={targetAgence}
                  onChange={(e) => setTargetAgence(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                >
                  <option value="ALL">Toutes les agences ({stats.activeDevices} app.)</option>
                  {agences.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nom_agence}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Page ouverte au clic
                </label>
                <select
                  value={broadcastUrl}
                  onChange={(e) => setBroadcastUrl(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                >
                  <option value="/hajj/dashboard">Tableau de bord</option>
                  <option value="/hajj/liste-pelerins">Liste des pèlerins</option>
                  <option value="/hajj/comptabilite">Comptabilité</option>
                  <option value="/hajj/nusuk">Plateforme Gouv & Nusuk</option>
                  <option value="/hajj/etat-general">État général</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Priorité de réveil
                </label>
                <select
                  value={broadcastUrgency}
                  onChange={(e) => setBroadcastUrgency(e.target.value as 'high' | 'normal')}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                >
                  <option value="high">Haute — Réveil immédiat</option>
                  <option value="normal">Normale — Éco veille</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Titre
              </label>
              <input
                type="text"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="Ex : Ouverture session Gouv à 14h00"
                maxLength={90}
                className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Message
              </label>
              <textarea
                rows={3}
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                placeholder="Rédigez votre annonce courte et claire..."
                maxLength={240}
                className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={busyAction !== null || !broadcastTitle.trim() || !broadcastBody.trim()}
              className="w-full h-11 rounded-xl bg-slate-900 hover:bg-blue-600 text-white text-xs font-black flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              {busyAction === 'broadcast' ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Envoi en cours…
                </>
              ) : (
                <>
                  <Send size={14} /> Envoyer la notification maintenant
                </>
              )}
            </button>
          </form>
        </div>

        {/* Liste des appareils abonnés */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-900 flex items-center gap-2">
              <Smartphone size={16} className="text-blue-600" />
              Appareils connectés ({subscriptions.length})
            </h2>
          </div>

          {subscriptions.length === 0 ? (
            <p className="text-xs text-slate-400 font-semibold py-6 text-center">
              Aucun appareil n’a encore autorisé les notifications. Dès qu’un utilisateur se connectera et cliquera « Autoriser », son appareil apparaîtra ici.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-900 truncate">
                        {sub.agence_name}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        • {sub.user_name}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {platformLabel(sub.platform)}
                      </span>
                      {sub.active_campagne && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          Campagne {sub.active_campagne}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          sub.enabled
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {sub.enabled ? 'Actif' : 'En pause'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                      Dernière ouverture : {formatDate(sub.last_seen_at)} • Dernière notif :{' '}
                      {formatDate(sub.last_notified_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={busyAction === sub.id}
                      onClick={() => handleToggleDevice(sub)}
                      className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      {sub.enabled ? <BellOff size={12} /> : <Bell size={12} />}
                      <span>{sub.enabled ? 'Pause' : 'Activer'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyAction === sub.id}
                      onClick={() => handleDeleteDevice(sub)}
                      aria-label="Supprimer l'appareil"
                      className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historique des envois */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-900 flex items-center gap-2">
              <History size={16} className="text-slate-600" />
              Historique récent ({logs.length})
            </h2>
          </div>

          {logs.length === 0 ? (
            <p className="text-xs text-slate-400 font-semibold py-6 text-center">
              Aucune notification envoyée pour le moment.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <div key={log.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {log.slot === 'morning'
                          ? 'Matin'
                          : log.slot === 'evening'
                          ? 'Soir'
                          : log.slot === 'admin'
                          ? 'Admin'
                          : 'Test'}
                      </span>
                      <span className="text-xs font-black text-slate-900">{log.title}</span>
                    </div>
                    <span className="text-[10.5px] font-bold text-slate-400 tabular-nums">
                      {formatDate(log.created_at)} • {log.sent_count} app.
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium">{log.body}</p>
                  <p className="text-[10.5px] text-slate-400 font-semibold flex items-center gap-1">
                    <Building2 size={11} /> {log.agence_name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
