'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Lock,
  Unlock,
  Save,
  ShieldAlert,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
  Activity,
  History,
  Trash2,
  Clock,
  X,
  PlusCircle,
  Sliders,
  Building2,
  BarChart3,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'

interface SessionRecord {
  id: string
  nom_session: string
  quota_alloue: number
  quota_utilise: number
  duree_heures: number | null
  date_ouverture: string
  date_expiration: string | null
  date_fermeture: string | null
  est_active: boolean
  statut_fermeture: 'EN_COURS' | 'EXPIRE_QUOTA' | 'EXPIRE_TEMPS' | 'MANUEL'
}

interface AgenceStat {
  id: string
  nom_agence: string
  pelerins_gouv_count: number
  percentage: number
}

const defaultConfig = {
  session_ouverte: false,
  quota_total_global: 0,
  quota_restant_global: 0,
  quota_session_total: 0,
  quota_session_restant: 0,
  quota_max_par_agence: 0,
  max_postulations_par_minute: 10
}

export default function AdminHajjControl() {
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [config, setConfig] = useState(defaultConfig)
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null)
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([])
  const [agenceStats, setAgenceStats] = useState<AgenceStat[]>([])
  const [totalPelerinsGouv, setTotalPelerinsGouv] = useState(0)

  // Formulaire d'ouverture de session
  const [sessionNameInput, setSessionNameInput] = useState('')
  const [quotaSessionInput, setQuotaSessionInput] = useState(100)
  const [dureeHeuresInput, setDureeHeuresInput] = useState<number | ''>(1)

  // Minuteur d'expiration locale
  const [timeLeftStr, setTimeLeftStr] = useState<string | null>(null)

  // Fenêtres modales (Modals)
  const [activeModal, setActiveModal] = useState<'OPEN_SESSION' | 'HISTORY' | 'AGRENCIES' | 'CONFIG' | null>(null)
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const isSessionOpen = Boolean(activeSession?.est_active ?? config.session_ouverte)

  const showNotification = (text: string, type: 'success' | 'error') => {
    setNotification({ text, type })
    setTimeout(() => setNotification(null), 4000)
  }

  const computeSessionUsage = useCallback((session: SessionRecord | null, pelerins: Array<{ created_at?: string; date_inscription?: string; hajj_session_id?: string | null; sur_plateforme_gouv?: boolean }>) => {
    if (!session?.id) return 0

    const sessionStart = session.date_ouverture ? new Date(session.date_ouverture).getTime() : null
    if (sessionStart !== null && Number.isNaN(sessionStart)) return 0

    return pelerins.filter((p) => {
      if (!p.sur_plateforme_gouv) return false

      if (session.id && p.hajj_session_id && p.hajj_session_id === session.id) return true

      const candidateDate = p.created_at || p.date_inscription
      if (candidateDate) {
        const createdAt = new Date(candidateDate).getTime()
        if (Number.isFinite(createdAt)) {
          if (sessionStart !== null) return createdAt >= sessionStart
          return true
        }
      }

      return true
    }).length
  }, [])

  // Chargement des données optimisé (Requêtes groupées en parallèle)
  const loadDashboardData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    try {
      const [configRes, historyRes, pelerinsRes, agencesRes] = await Promise.all([
        supabase.from('hajj_campaign_config').select('*').eq('id', 1).maybeSingle(),
        supabase.from('hajj_sessions').select('*').order('date_ouverture', { ascending: false }).limit(30),
        supabase.from('pelerins').select('agence_id, created_at, date_inscription, hajj_session_id, sur_plateforme_gouv', { count: 'exact' }).eq('sur_plateforme_gouv', true),
        supabase.from('agences').select('id, nom_agence')
      ])

      const configData = configRes.data
      const historyData = historyRes.data || []
      const pelerins = pelerinsRes.data || []
      const realGouvCount = pelerinsRes.count || 0
      const agences = agencesRes.data || []

      // On déduit la session active depuis l'historique récupéré
      const sessionData = historyData.length > 0 ? historyData[0] : null

      const effectiveSessionOpen = Boolean(
        sessionData?.id && (
          sessionData?.est_active === true ||
          (sessionData as any)?.session_ouverte === true ||
          (sessionData as any)?.is_active === true ||
          Boolean(configData?.session_ouverte)
        )
      )

      if (configData) {
        setConfig({
          ...defaultConfig,
          ...configData,
          session_ouverte: effectiveSessionOpen || Boolean(configData.session_ouverte),
          quota_total_global: Number(configData.quota_total_global || 0),
          quota_restant_global: Number(configData.quota_restant_global || 0),
          quota_session_total: Number(configData.quota_session_total || 0),
          quota_session_restant: Number(configData.quota_session_restant || 0)
        })
      }

      setSessionHistory(historyData)

      // Calcul local
      const countMap = new Map<string, number>()
      pelerins.forEach((p) => {
        if (p.agence_id) countMap.set(p.agence_id, (countMap.get(p.agence_id) || 0) + 1)
      })

      const sessionTotal = sessionData?.quota_alloue || configData?.quota_session_total || 1
      const resolvedQuotaUsed = computeSessionUsage(sessionData || null, pelerins)
      const nextActiveSession = effectiveSessionOpen && sessionData ? { ...sessionData, quota_utilise: resolvedQuotaUsed } : null

      setActiveSession(nextActiveSession)

      const stats: AgenceStat[] = agences.map((ag) => {
        const count = countMap.get(ag.id) || 0
        return {
          id: ag.id,
          nom_agence: ag.nom_agence || 'Agence inconnue',
          pelerins_gouv_count: count,
          percentage: Math.min(100, Math.round((count / sessionTotal) * 100))
        }
      }).sort((a, b) => b.pelerins_gouv_count - a.pelerins_gouv_count)

      setAgenceStats(stats)
      setTotalPelerinsGouv(realGouvCount)
    } catch (err: any) {
      console.error('Erreur chargement dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [computeSessionUsage])

  // Auto-fermeture automatique si le timer expire
  const autoCloseIfExpired = useCallback(async () => {
    if (!activeSession || !activeSession.est_active) return

    if (activeSession.date_expiration) {
      const diff = new Date(activeSession.date_expiration).getTime() - new Date().getTime()
      if (diff <= 0) {
        await Promise.all([
          supabase.from('hajj_sessions').update({
            est_active: false,
            date_fermeture: new Date().toISOString(),
            statut_fermeture: 'EXPIRE_TEMPS'
          }).eq('id', activeSession.id),
          supabase.from('hajj_campaign_config').update({
            session_ouverte: false,
            quota_session_restant: 0,
            updated_at: new Date().toISOString()
          }).eq('id', 1)
        ])

        showNotification('La session a été fermée : Temps imparti écoulé.', 'error')
        await loadDashboardData()
      }
    }
  }, [activeSession, loadDashboardData])

  // Minuteur Temps Réel
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeSession?.date_expiration && activeSession.est_active) {
        const remaining = new Date(activeSession.date_expiration).getTime() - new Date().getTime()
        if (remaining <= 0) {
          setTimeLeftStr('Expiré')
          void autoCloseIfExpired()
        } else {
          const hours = Math.floor(remaining / (1000 * 60 * 60))
          const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
          const seconds = Math.floor((remaining % (1000 * 60)) / 1000)
          setTimeLeftStr(`${hours}h ${minutes}m ${seconds}s`)
        }
      } else {
        setTimeLeftStr(null)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [activeSession, autoCloseIfExpired])

  // Abonnement Realtime pur (sans polling setInterval)
  useEffect(() => {
    void loadDashboardData(true)

    const channel = supabase
      .channel('hajj_realtime_control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hajj_campaign_config' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hajj_sessions' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pelerins' }, () => loadDashboardData())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadDashboardData])

  // Actions
  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionNameInput.trim()) return showNotification('Veuillez spécifier un nom.', 'error')
    if (quotaSessionInput <= 0) return showNotification('Quota supérieur à 0 requis.', 'error')
    if (quotaSessionInput > config.quota_restant_global) {
      return showNotification(`Quota (${quotaSessionInput}) dépasse la réserve (${config.quota_restant_global}).`, 'error')
    }

    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('ouvrir_nouvelle_session_hajj', {
        p_nom_session: sessionNameInput,
        p_quota_attribue: quotaSessionInput,
        p_duree_heures: dureeHeuresInput === '' ? null : Number(dureeHeuresInput)
      })

      if (error) throw error

      await supabase.from('hajj_campaign_config').update({
        session_ouverte: true,
        quota_session_total: quotaSessionInput,
        quota_session_restant: quotaSessionInput,
        updated_at: new Date().toISOString()
      }).eq('id', 1)

      showNotification('Nouvelle session ouverte avec succès !', 'success')
      setSessionNameInput('')
      setActiveModal(null)
      await loadDashboardData()
    } catch (err: any) {
      showNotification('Erreur : ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCloseSession = async () => {
    if (!activeSession) return
    setActionLoading(true)

    try {
      await Promise.all([
        supabase.from('hajj_sessions').update({
          est_active: false,
          date_fermeture: new Date().toISOString(),
          statut_fermeture: 'MANUEL'
        }).eq('est_active', true),
        supabase.from('hajj_campaign_config').update({
          session_ouverte: false,
          quota_session_restant: 0,
          updated_at: new Date().toISOString()
        }).eq('id', 1)
      ])

      showNotification('Session fermée manuellement.', 'success')
      await loadDashboardData()
    } catch (err: any) {
      showNotification('Erreur lors de la fermeture : ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionLoading(true)
    try {
      const { error } = await supabase.from('hajj_campaign_config').update({
        quota_total_global: config.quota_total_global,
        quota_max_par_agence: config.quota_max_par_agence,
        max_postulations_par_minute: config.max_postulations_par_minute,
        updated_at: new Date().toISOString()
      }).eq('id', 1)

      if (error) throw error
      showNotification('Configuration globale enregistrée !', 'success')
      setActiveModal(null)
      await loadDashboardData()
    } catch (err: any) {
      showNotification('Erreur : ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteSessionRecord = async (id: string) => {
    try {
      await supabase.from('hajj_sessions').delete().eq('id', id)
      showNotification('Enregistrement supprimé.', 'success')
      await loadDashboardData()
    } catch (err: any) {
      showNotification('Erreur lors de la suppression : ' + err.message, 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-white">
        <div className="text-center space-y-4">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-emerald-400" />
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Chargement des données...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 text-slate-800">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 shadow-2xl border ${
          notification.type === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-500' : 'bg-rose-900 text-rose-100 border-rose-500'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <span className="text-sm font-black uppercase tracking-wide">{notification.text}</span>
        </div>
      )}

      {/* En-tête */}
      <div className="rounded-[32px] border border-slate-800 bg-slate-950 p-6 sm:p-8 shadow-2xl text-white">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-emerald-400">
              <ShieldAlert size={18} /> Centre Neuro-Stratégique des Quotas
            </div>
            <h1 className="text-3xl font-black uppercase tracking-wider">Maison du Hajj — Pilotage</h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Contrôle dynamique des quotas d'enregistrement, respect absolu de la réserve nationale globale et verrouillage temporel automatique.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black uppercase ${
              isSessionOpen ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}>
              <span className={`h-2.5 w-2.5 rounded-full ${isSessionOpen ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`} />
              {isSessionOpen ? 'Session Ouverte' : 'Session Fermée'}
            </div>

            <button
              onClick={() => void loadDashboardData(true)}
              className="flex items-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-bold uppercase text-slate-200 transition border border-slate-700"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Synthèse */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-black uppercase tracking-wider">Réserve Globale</span>
            <TrendingUp size={18} className="text-sky-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{config.quota_restant_global}</span>
            <span className="text-xs font-bold text-slate-400">/ {config.quota_total_global} restant</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-sky-500 h-full transition-all duration-500"
              style={{ width: `${Math.min(100, (config.quota_restant_global / (config.quota_total_global || 1)) * 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-black uppercase tracking-wider">Quota Session</span>
            <Activity size={18} className="text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {activeSession ? activeSession.quota_alloue - activeSession.quota_utilise : 0}
            </span>
            <span className="text-xs font-bold text-slate-400">
              / {activeSession ? activeSession.quota_alloue : 0} dispo
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{
                width: `${activeSession ? Math.min(100, ((activeSession.quota_alloue - activeSession.quota_utilise) / activeSession.quota_alloue) * 100) : 0}%`
              }}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-black uppercase tracking-wider">Temps Restant</span>
            <Clock size={18} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 truncate">
            {timeLeftStr ? timeLeftStr : activeSession ? 'Illimité' : 'Aucun'}
          </div>
          <p className="text-[11px] font-bold text-slate-400">
            {activeSession?.duree_heures ? `Durée fixée : ${activeSession.duree_heures}h` : 'Pas de limite de temps'}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-black uppercase tracking-wider">Pèlerins GOUV</span>
            <Users size={18} className="text-purple-600" />
          </div>
          <div className="text-3xl font-black text-slate-900">{totalPelerinsGouv}</div>
          <p className="text-[11px] font-bold text-slate-400">Inscrits officiellement</p>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-black uppercase text-slate-900">Centre d'Actions & Fenêtres de Gestion</h2>
            <p className="text-xs text-slate-500">Ouvre chaque panneau dédié pour orchestrer les sessions et la configuration.</p>
          </div>

          {activeSession && activeSession.est_active && (
            <button
              onClick={handleCloseSession}
              disabled={actionLoading}
              className="flex items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase px-5 py-3 transition shadow-lg shadow-rose-600/20"
            >
              {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
              Fermer Immédiatement la Session ({activeSession.nom_session})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <button
            onClick={() => setActiveModal('OPEN_SESSION')}
            className="flex flex-col items-start p-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-white hover:border-emerald-500 hover:shadow-md transition text-left space-y-3 group"
          >
            <div className="p-3 rounded-xl bg-emerald-500 text-white group-hover:scale-110 transition">
              <PlusCircle size={22} />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase text-slate-900">Ouvrir une Session</h3>
              <p className="text-xs text-slate-500">Attribuer nom, quota précis et durée en heure(s).</p>
            </div>
          </button>

          <button
            onClick={() => setActiveModal('HISTORY')}
            className="flex flex-col items-start p-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white hover:border-blue-500 hover:shadow-md transition text-left space-y-3 group"
          >
            <div className="p-3 rounded-xl bg-blue-600 text-white group-hover:scale-110 transition">
              <History size={22} />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase text-slate-900">Historique des Ouvertures</h3>
              <p className="text-xs text-slate-500">Consulter l'utilisation exacte de chaque session passée.</p>
            </div>
          </button>

          <button
            onClick={() => setActiveModal('AGRENCIES')}
            className="flex flex-col items-start p-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-purple-50 to-white hover:border-purple-500 hover:shadow-md transition text-left space-y-3 group"
          >
            <div className="p-3 rounded-xl bg-purple-600 text-white group-hover:scale-110 transition">
              <Building2 size={22} />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase text-slate-900">Statistiques par Agence</h3>
              <p className="text-xs text-slate-500">Suivi détaillé de la consommation par agence.</p>
            </div>
          </button>

          <button
            onClick={() => setActiveModal('CONFIG')}
            className="flex flex-col items-start p-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-white hover:border-slate-800 hover:shadow-md transition text-left space-y-3 group"
          >
            <div className="p-3 rounded-xl bg-slate-900 text-white group-hover:scale-110 transition">
              <Sliders size={22} />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase text-slate-900">Réserve & Paramètres</h3>
              <p className="text-xs text-slate-500">Modifier le stock global et plafonds anti-triche.</p>
            </div>
          </button>

          <Link
            href="/hajj/admin/agences2"
            className="flex flex-col items-start p-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-amber-50 to-white hover:border-amber-500 hover:shadow-md transition text-left space-y-3 group"
          >
            <div className="p-3 rounded-xl bg-amber-600 text-white group-hover:scale-110 transition">
              <Building2 size={22} />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase text-slate-900">Agences 2</h3>
              <p className="text-xs text-slate-500">Ouvrir la vue détaillée des agences et pèlerins GOUV.</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Détail Session Active */}
      {activeSession && activeSession.est_active ? (
        <div className="rounded-3xl border border-emerald-300 bg-emerald-50/50 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
              <h3 className="text-base font-black uppercase text-emerald-950">
                Session Active : <span className="underline">{activeSession.nom_session}</span>
              </h3>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
              Ouverte le {new Date(activeSession.date_ouverture).toLocaleString('fr-FR')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-2xl border border-emerald-200">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">Quota Attribué</p>
              <p className="text-xl font-black text-slate-900">{activeSession.quota_alloue}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">Quota Consommé</p>
              <p className="text-xl font-black text-emerald-600">{activeSession.quota_utilise}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">Quota Restant Session</p>
              <p className="text-xl font-black text-amber-600">{activeSession.quota_alloue - activeSession.quota_utilise}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-2">
          <Lock className="mx-auto text-slate-400" size={32} />
          <h3 className="text-base font-black uppercase text-slate-700">Aucune Session Ouverte</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Les agences ne peuvent pas inscrire de nouveaux pèlerins sur GOUV pour le moment.
          </p>
        </div>
      )}

      {/* Modales */}
      {activeModal === 'OPEN_SESSION' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <Unlock size={22} />
                <h2 className="text-lg font-black uppercase text-slate-900">Ouvrir une nouvelle Session</h2>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleOpenSession} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-2">
                  Nom de l'Ouverture / Description
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Session du Matin - Phase 1"
                  value={sessionNameInput}
                  onChange={(e) => setSessionNameInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-2">
                    Quota pour cette session
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={config.quota_restant_global}
                    required
                    value={quotaSessionInput}
                    onChange={(e) => setQuotaSessionInput(Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Max disponible : {config.quota_restant_global}</p>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-2">
                    Durée d'ouverture (Heures)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    placeholder="Ex: 2"
                    value={dureeHeuresInput}
                    onChange={(e) => setDureeHeuresInput(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Vide = Illimité en temps</p>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-1/2 rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-1/2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase px-4 py-3 transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                  Confirmer Ouverture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeModal === 'HISTORY' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl max-h-[85vh] rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 text-blue-600">
                <History size={22} />
                <h2 className="text-lg font-black uppercase text-slate-900">Historique des Ouvertures</h2>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 mt-4 space-y-3 pr-2">
              {sessionHistory.length > 0 ? (
                sessionHistory.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                          s.est_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {s.est_active ? 'En cours' : s.statut_fermeture}
                        </span>
                        <h4 className="font-black text-sm text-slate-900">{s.nom_session}</h4>
                      </div>
                      <span className="text-xs font-bold text-slate-400">
                        Ouv. {new Date(s.date_ouverture).toLocaleString('fr-FR')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 font-bold block">Quota Alloué</span>
                        <span className="font-black text-slate-800">{s.quota_alloue}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block">Quota Utilisé</span>
                        <span className="font-black text-emerald-600">{s.quota_utilise}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block">Durée Prévue</span>
                        <span className="font-black text-slate-800">{s.duree_heures ? `${s.duree_heures}h` : 'N/A'}</span>
                      </div>
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => void handleDeleteSessionRecord(s.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 transition"
                          title="Supprimer l'enregistrement"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-sm font-bold text-slate-400 py-8">Aucun historique disponible.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeModal === 'AGRENCIES' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 text-purple-600">
                <BarChart3 size={22} />
                <h2 className="text-lg font-black uppercase text-slate-900">Consommation par Agence</h2>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 mt-4">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-2">Agence</th>
                    <th className="py-3 px-2 text-center">Pèlerins Inscrits</th>
                    <th className="py-3 px-2 text-right">Part (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agenceStats.map((ag) => (
                    <tr key={ag.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-2 font-bold text-slate-800">{ag.nom_agence}</td>
                      <td className="py-3 px-2 text-center">
                        <span className="inline-flex px-3 py-1 rounded-full bg-purple-50 text-purple-700 font-black text-xs">
                          {ag.pelerins_gouv_count}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right font-black text-slate-700">{ag.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'CONFIG' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Sliders size={22} />
                <h2 className="text-lg font-black uppercase text-slate-900">Réserve & Sécurité Globale</h2>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-2">
                    Quota Total Global
                  </label>
                  <input
                    type="number"
                    value={config.quota_total_global}
                    onChange={(e) => setConfig({ ...config, quota_total_global: Number(e.target.value) })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-slate-800 focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    Réserve Globale Restante
                  </label>
                  <input
                    type="number"
                    disabled
                    value={config.quota_restant_global}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-black text-emerald-600 outline-none cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-2">
                    Max / Agence
                  </label>
                  <input
                    type="number"
                    value={config.quota_max_par_agence}
                    onChange={(e) => setConfig({ ...config, quota_max_par_agence: Number(e.target.value) })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-2">
                    Max postulations / Min
                  </label>
                  <input
                    type="number"
                    value={config.max_postulations_par_minute}
                    onChange={(e) => setConfig({ ...config, max_postulations_par_minute: Number(e.target.value) })}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-1/2 rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-1/2 rounded-2xl bg-slate-900 hover:bg-black text-white font-black text-xs uppercase px-4 py-3 transition shadow-lg flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}