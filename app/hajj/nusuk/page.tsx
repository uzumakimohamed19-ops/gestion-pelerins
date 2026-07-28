'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useYear } from '@/lib/YearContext'
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck,
  FileWarning,
  Globe,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  AlertCircle,
  Wifi,
  WifiOff,
  Activity,
  Trash2
} from 'lucide-react'

type Pelerin = {
  id: string
  prenom?: string
  nom_complet?: string
  telephone_pelerin?: string
  num_passeport?: string
  campagne?: string | number
  document_url?: string | null
  sur_plateforme_gouv?: boolean
  sur_plateforme_nusuk?: boolean
  agences?: { nom_agence?: string }
  created_at?: string
  date_inscription?: string
  hajj_session_id?: string | null
  updated_at?: string
}

type SessionSummary = {
  label: string
  quota_total: number
  quota_utilise: number
  quota_restant: number
  session_open: boolean
  last_sync: number
}

type SyncStatus = 'connected' | 'disconnected' | 'syncing' | 'error'

export default function PagePlatformeMdh() {
  const { selectedYear } = useYear()
  const [pelerins, setPelerins] = useState<Pelerin[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedAgence, setSelectedAgence] = useState('all')
  const [showEligibleOnly, setShowEligibleOnly] = useState(false)
  const [agences, setAgences] = useState<string[]>([])
  const [sessionSummary, setSessionSummary] = useState<SessionSummary>({
    label: 'Aucune session active',
    quota_total: 0,
    quota_utilise: 0,
    quota_restant: 0,
    session_open: false,
    last_sync: 0
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string; id: string } | null>(null)
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  // Références pour la gestion des souscriptions et timers
  const subscriptionRef = useRef<any>(null)
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null)
  const messageTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastSyncRef = useRef<number>(0)
  const isMountedRef = useRef(true)

  // Récupérer le rôle utilisateur
  useEffect(() => {
    const getUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single()
          
          setUserRole(data?.role === 'admin' ? 'admin' : 'user')
        }
      } catch (error) {
        console.error('Erreur récupération rôle utilisateur', error)
        setUserRole('user')
      }
    }

    getUserRole()
  }, [])

  // Fonction de chargement des données avec gestion d'erreur robuste
  const syncQuotaToSession = useCallback(async (rows: Pelerin[], sessionOverride?: any) => {
    if (!isMountedRef.current) return

    const targetSession = sessionOverride || (await supabase
      .from('hajj_sessions')
      .select('*')
      .order('date_ouverture', { ascending: false })
      .limit(1)
      .maybeSingle()).data

    if (!targetSession?.id) return

    const quotaTotal = Number(targetSession.quota_alloue || 0)
    const quotaUsed = rows.filter((p) => {
      if (!p.sur_plateforme_gouv) return false

      const row = p as Pelerin & { hajj_session_id?: string | null; created_at?: string; date_inscription?: string }
      if (targetSession.id && row.hajj_session_id && row.hajj_session_id === targetSession.id) return true

      const candidateDate = row.created_at || row.date_inscription
      if (candidateDate) {
        const createdAt = new Date(candidateDate).getTime()
        if (Number.isFinite(createdAt) && targetSession.date_ouverture) {
          const sessionStart = new Date(targetSession.date_ouverture).getTime()
          if (Number.isFinite(sessionStart)) return createdAt >= sessionStart
        }
        return true
      }

      return true
    }).length

    await supabase
      .from('hajj_sessions')
      .update({ quota_utilise: quotaUsed })
      .eq('id', targetSession.id)

    await supabase
      .from('hajj_campaign_config')
      .update({
        quota_session_restant: Math.max(0, quotaTotal - quotaUsed),
        updated_at: new Date().toISOString()
      })
      .eq('id', 1)
  }, [])

  const loadData = useCallback(async (isRetry = false) => {
    if (!isMountedRef.current) return

    try {
      setSyncStatus('syncing')
      setConnectionError(null)

      const [configRes, sessionRes, pelerinsRes] = await Promise.all([
        supabase
          .from('hajj_campaign_config')
          .select('*')
          .eq('id', 1)
          .maybeSingle(),
        supabase
          .from('hajj_sessions')
          .select('*')
          .order('date_ouverture', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('pelerins')
          .select('*, agences(nom_agence)')
          .order('created_at', { ascending: false })
      ])

      if (!isMountedRef.current) return

      // Gestion des erreurs Supabase
      if (configRes.error && configRes.error.code !== 'PGRST116') throw configRes.error
      if (sessionRes.error && sessionRes.error.code !== 'PGRST116') throw sessionRes.error
      if (pelerinsRes.error) throw pelerinsRes.error

      const configData = configRes.data
      const sessionData = sessionRes.data
      const rawPelerins = pelerinsRes.data || []

      const isSessionOpenInDb = Boolean(
        sessionData?.id && (
          sessionData?.est_active === true ||
          sessionData?.session_ouverte === true ||
          sessionData?.is_active === true
        )
      )

      const isSessionOpen = isSessionOpenInDb || Boolean(configData?.session_ouverte)

      if (sessionData?.id && isSessionOpen) {
        await supabase
          .from('pelerins')
          .update({ hajj_session_id: sessionData.id })
          .eq('sur_plateforme_gouv', true)
          .is('hajj_session_id', null)
      }

      // Filtrage par année
      const filteredByYear = selectedYear === 'all'
        ? rawPelerins
        : rawPelerins.filter((p) => Number(p.campagne ?? 0) === Number(selectedYear))

      setPelerins(filteredByYear)
      setRetryCount(0)

      // Extraction des agences uniques
      const agencyList = [...new Set(
        filteredByYear
          .map((p) => p.agences?.nom_agence)
          .filter(Boolean)
      )] as string[]
      setAgences(agencyList.sort())

      // Calcul des quotas en temps réel à partir des inscriptions Gouv réelles
      const quotaTotal = Number(sessionData?.quota_alloue || configData?.quota_session_total || configData?.quota_total_global || 0)
      const quotaUsed = filteredByYear.filter((p) => {
        if (!p.sur_plateforme_gouv) return false

        const row = p as Pelerin & { hajj_session_id?: string | null; created_at?: string; date_inscription?: string }
        if (sessionData?.id && row.hajj_session_id && row.hajj_session_id === sessionData.id) return true

        const candidateDate = row.created_at || row.date_inscription
        if (candidateDate) {
          const createdAt = new Date(candidateDate).getTime()
          if (Number.isFinite(createdAt) && sessionData?.date_ouverture) {
            const sessionStart = new Date(sessionData.date_ouverture).getTime()
            if (Number.isFinite(sessionStart)) return createdAt >= sessionStart
          }
          return true
        }

        return true
      }).length

      if (sessionData?.id) {
        await syncQuotaToSession(filteredByYear, sessionData)
      }

      setSessionSummary((prev) => ({
        label: sessionData?.nom_session || (isSessionOpen ? 'Session ouverte' : 'Aucune session active'),
        quota_total: quotaTotal,
        quota_utilise: quotaUsed,
        quota_restant: Math.max(0, quotaTotal - quotaUsed),
        session_open: isSessionOpen,
        last_sync: Date.now()
      }))

      setSyncStatus('connected')
      lastSyncRef.current = Date.now()
    } catch (error: any) {
      console.error('Erreur chargement données', error)
      
      if (!isMountedRef.current) return

      // Gestion des erreurs de connexion
      if (error?.message?.includes('Failed to fetch') || error?.code === 'NETWORK_ERROR') {
        setConnectionError('Connexion perdue. Tentative de reconnexion...')
        setSyncStatus('disconnected')
        
        // Retry exponentiel avec backoff
        const nextRetry = Math.min(1000 * Math.pow(2, retryCount), 30000)
        setRetryCount(prev => prev + 1)
        
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) loadData(true)
        }, nextRetry)
      } else {
        setConnectionError('Erreur lors du chargement des données')
        setSyncStatus('error')
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [selectedYear])

  // Chargement initial et synchronisation
  useEffect(() => {
    isMountedRef.current = true
    loadData()

    // Synchronisation toutes les 2 secondes (temps réel)
    if (syncTimerRef.current) clearInterval(syncTimerRef.current)
    syncTimerRef.current = setInterval(() => {
      if (isMountedRef.current && Date.now() - lastSyncRef.current > 2000) {
        void loadData()
      }
    }, 2000)

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current)
    }
  }, [selectedYear, loadData])

  // Souscription aux changements en temps réel Supabase
  useEffect(() => {
    if (!isMountedRef.current) return

    const setupRealtimeSubscription = async () => {
      try {
        // Souscription aux changements de pèlerins
        subscriptionRef.current = supabase
          .channel('pelerins-changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'pelerins'
            },
            (payload) => {
              if (!isMountedRef.current) return
              
              // Rechargement immédiat des données
              loadData()
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'hajj_sessions'
            },
            (payload) => {
              if (!isMountedRef.current) return
              loadData()
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              setSyncStatus('connected')
            } else if (status === 'CLOSED') {
              setSyncStatus('disconnected')
            }
          })
      } catch (error) {
        console.error('Erreur souscription temps réel', error)
      }
    }

    setupRealtimeSubscription()

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current)
      }
    }
  }, [loadData])

  // Gestion des messages avec auto-fermeture
  useEffect(() => {
    if (!message) return
    
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
    messageTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setMessage(null)
    }, 3000)

    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
    }
  }, [message])

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (syncTimerRef.current) clearInterval(syncTimerRef.current)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
      if (subscriptionRef.current) supabase.removeChannel(subscriptionRef.current)
    }
  }, [])

  // Filtrage et statistiques avec memoization
  const filteredData = useMemo(() => {
    const query = search.toLowerCase()
    return pelerins.filter((p) => {
      const name = `${p.prenom || ''} ${p.nom_complet || ''}`.toLowerCase()
      const matchesSearch = !query || name.includes(query) || (p.num_passeport || '').toLowerCase().includes(query)
      const matchesAgence = selectedAgence === 'all' || p.agences?.nom_agence === selectedAgence
      const isEligibleToGouv = Boolean(p.document_url)
      const matchesEligibility = !showEligibleOnly || isEligibleToGouv
      return matchesSearch && matchesAgence && matchesEligibility
    })
  }, [pelerins, search, selectedAgence, showEligibleOnly])

  const stats = useMemo(() => {
    const total = filteredData.length
    const gouvInscrits = filteredData.filter((p) => p.sur_plateforme_gouv).length
    const nusukInscrits = filteredData.filter((p) => p.sur_plateforme_nusuk).length
    const eligiblesGouv = filteredData.filter((p) => Boolean(p.document_url)).length

    return { total, gouvInscrits, nusukInscrits, eligiblesGouv }
  }, [filteredData])

  // Mise à jour du statut Gouv
  const toggleGouvStatus = async (id: string, currentStatus: boolean) => {
    if (!sessionSummary.session_open) {
      setMessage({ 
        type: 'error', 
        text: 'La session Gouv est fermée. Les inscriptions sont verrouillées.',
        id: `msg-${Date.now()}`
      })
      return
    }

    const p = pelerins.find((item) => item.id === id)
    if (!p) return

    if (currentStatus) {
      if (userRole !== 'admin') {
        setMessage({
          type: 'error',
          text: 'Seul l’administrateur peut retirer un pèlerin de la plateforme Gouv.',
          id: `msg-${Date.now()}`
        })
        return
      }
    }

    if (!currentStatus && !p.document_url) {
      setMessage({ 
        type: 'error', 
        text: 'Ce pèlerin n\'est pas encore éligible au Gouv : le dossier n\'est pas complet.',
        id: `msg-${Date.now()}`
      })
      return
    }

    setActionInProgressId(id)
    try {
      const nextValue = !currentStatus
      let activeSessionId: string | null = null

      if (nextValue) {
        const { data: sessionData } = await supabase
          .from('hajj_sessions')
          .select('id')
          .order('date_ouverture', { ascending: false })
          .limit(1)
          .maybeSingle()
        activeSessionId = sessionData?.id ?? null
      }

      const { error } = await supabase
        .from('pelerins')
        .update({
          sur_plateforme_gouv: nextValue,
          hajj_session_id: nextValue ? activeSessionId : null
        })
        .eq('id', id)
      
      if (error) throw error

      // Mise à jour locale immédiate
      setPelerins((prev) => prev.map((item) => 
        item.id === id ? { ...item, sur_plateforme_gouv: !currentStatus } : item
      ))

      setMessage({ 
        type: 'success', 
        text: !currentStatus ? 'Pèlerin inscrit sur la plateforme Gouv.' : 'Inscription Gouv retirée par l’administrateur.',
        id: `msg-${Date.now()}`
      })

      // Synchronisation immédiate du quota côté base puis rechargement
      await syncQuotaToSession(
        pelerins.map((item) => item.id === id ? { ...item, sur_plateforme_gouv: !currentStatus } : item),
        sessionSummary.label ? null : null
      )
      setTimeout(() => void loadData(), 500)
    } catch (error) {
      console.error('Erreur mise à jour Gouv', error)
      setMessage({ 
        type: 'error', 
        text: 'Impossible de mettre à jour le statut Gouv.',
        id: `msg-${Date.now()}`
      })
    } finally {
      setActionInProgressId(null)
    }
  }

  // Suppression d'un pèlerin (admin uniquement)
  const deletePelerin = async (id: string) => {
    if (userRole !== 'admin') {
      setMessage({ 
        type: 'error', 
        text: 'Seuls les administrateurs peuvent supprimer des pèlerins.',
        id: `msg-${Date.now()}`
      })
      return
    }

    setActionInProgressId(id)
    try {
      const { error } = await supabase
        .from('pelerins')
        .delete()
        .eq('id', id)
      
      if (error) throw error

      setPelerins((prev) => prev.filter((item) => item.id !== id))
      setMessage({ 
        type: 'success', 
        text: 'Pèlerin supprimé avec succès.',
        id: `msg-${Date.now()}`
      })
      setShowDeleteConfirm(null)
      
      setTimeout(() => loadData(), 500)
    } catch (error) {
      console.error('Erreur suppression pèlerin', error)
      setMessage({ 
        type: 'error', 
        text: 'Impossible de supprimer le pèlerin.',
        id: `msg-${Date.now()}`
      })
    } finally {
      setActionInProgressId(null)
    }
  }

  // Forcer la synchronisation manuelle
  const forceSync = () => {
    loadData()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-12">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <div className="flex items-center gap-3">
            <Link 
              href="/hajj/admin" 
              className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 transition hover:border-slate-300 hover:text-indigo-600 hover:bg-indigo-50"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Espace administration</p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-900 md:text-2xl">
                  <Globe size={18} className="text-indigo-600" /> Plateforme MDH
                </h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${sessionSummary.session_open ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {sessionSummary.session_open ? <CheckCircle2 size={12} /> : <Lock size={12} />}
                  {sessionSummary.session_open ? 'Ouverte' : 'Fermée'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-right">
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-indigo-600">Quota</p>
              <p className="text-sm font-black text-indigo-700">{sessionSummary.quota_utilise}/{sessionSummary.quota_total}</p>
            </div>
            {/* Statut de synchronisation */}
            <div className="flex items-center gap-2">
              {syncStatus === 'connected' && (
                <span className="flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600">
                  <Wifi size={11} className="animate-pulse" /> Connecté
                </span>
              )}
              {syncStatus === 'syncing' && (
                <span className="flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-600">
                  <RefreshCw size={11} className="animate-spin" /> Sync
                </span>
              )}
              {syncStatus === 'disconnected' && (
                <span className="flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-600">
                  <WifiOff size={11} /> Déconnecté
                </span>
              )}
              {syncStatus === 'error' && (
                <span className="flex items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-600">
                  <AlertCircle size={11} /> Erreur
                </span>
              )}
            </div>

            {/* Bouton de synchronisation manuelle */}
            <button
              onClick={forceSync}
              disabled={syncStatus === 'syncing'}
              className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-600 transition hover:border-slate-300 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              title="Forcer la synchronisation"
            >
              <RefreshCw size={15} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-6">
        {/* Erreur de connexion */}
        {connectionError && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-center gap-3">
            <AlertCircle size={18} className="text-rose-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-rose-700">{connectionError}</p>
              <p className="text-xs text-rose-600 mt-1">Tentative {retryCount}</p>
            </div>
          </div>
        )}

        {/* État de la session */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">État de la session</p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-black ${sessionSummary.session_open ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {sessionSummary.session_open ? <CheckCircle2 size={14} /> : <Lock size={14} />}
                  {sessionSummary.session_open ? 'Session ouverte' : 'Session fermée'}
                </span>
                <span className="text-sm font-semibold text-slate-600">{sessionSummary.label}</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
              {sessionSummary.session_open ? 'Les inscriptions Gouv restent ouvertes.' : 'Les inscriptions Gouv sont verrouillées.'}
            </div>
          </div>
        </div>

        {/* Statistiques quotas */}
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Quota de session</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{sessionSummary.quota_total}</p>
            <p className="text-sm text-slate-500">Total alloué</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Utilisé</p>
            <p className="mt-2 text-2xl font-black text-indigo-600">{sessionSummary.quota_utilise}</p>
            <p className="text-sm text-slate-500">Pèlerins déjà enregistrés</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Restant</p>
            <p className="mt-2 text-2xl font-black text-emerald-600">{sessionSummary.quota_restant}</p>
            <p className="text-sm text-slate-500">Places encore disponibles</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Votre nombre Gouv</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{stats.gouvInscrits}</p>
            <p className="text-sm text-slate-500">Sur la sélection actuelle</p>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
            {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {message.text}
          </div>
        )}

        {/* Filtres */}
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un pèlerin ou un passeport"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-9 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition"
            />
            {search && (
              <button 
                onClick={() => setSearch('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={showEligibleOnly}
                onChange={(e) => setShowEligibleOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Éligibles Gouv
            </label>

            <select
              value={selectedAgence}
              onChange={(e) => setSelectedAgence(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
            >
              <option value="all">Toutes les agences</option>
              {agences.map((agence) => (
                <option key={agence} value={agence}>{agence}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Statistiques filtrées */}
        <div className="grid gap-3 md:grid-cols-3 mb-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Pèlerins visibles</p>
            <p className="mt-2 text-xl font-black text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Éligibles au Gouv</p>
            <p className="mt-2 text-xl font-black text-emerald-600">{stats.eligiblesGouv}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Inscrits Nusuk</p>
            <p className="mt-2 text-xl font-black text-purple-600">{stats.nusukInscrits}</p>
          </div>
        </div>

        {/* Liste mobile en cartes */}
        <div className="mt-4 space-y-3 md:hidden">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-400 shadow-sm">
              <div className="flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin" />
                Chargement des dossiers Platforme MDH…
              </div>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-400 shadow-sm">
              Aucun pèlerin ne correspond à votre recherche.
            </div>
          ) : (
            filteredData.map((p) => {
              const isEligibleToGouv = Boolean(p.document_url)
              const isGouvRegistered = Boolean(p.sur_plateforme_gouv)
              const isNusukRegistered = Boolean(p.sur_plateforme_nusuk)
              const isDeleting = showDeleteConfirm === p.id

              return (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-black text-white flex-shrink-0">
                      {p.prenom?.[0] || ''}{p.nom_complet?.[0] || ''}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black uppercase text-slate-900 truncate">{p.prenom} {p.nom_complet}</p>
                        {isEligibleToGouv ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                            <FileCheck size={10} /> Complet
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700">
                            <FileWarning size={10} /> Incomplet
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500 truncate">{p.num_passeport || 'Pas de passeport'}</p>
                      {p.agences?.nom_agence && (
                        <p className="mt-1 text-[10px] font-semibold text-slate-400">{p.agences.nom_agence}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black whitespace-nowrap ${isGouvRegistered ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                      <ShieldCheck size={11} />
                      {isGouvRegistered ? 'Gouv inscrit' : 'Gouv non'}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black whitespace-nowrap ${isNusukRegistered ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                      <Globe size={11} />
                      {isNusukRegistered ? 'Nusuk inscrit' : 'Nusuk non'}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      disabled={actionInProgressId === p.id || !sessionSummary.session_open || (isGouvRegistered && userRole !== 'admin')}
                      onClick={() => toggleGouvStatus(p.id, isGouvRegistered)}
                      className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition ${actionInProgressId === p.id ? 'cursor-wait bg-slate-100 text-slate-500' : !sessionSummary.session_open || (isGouvRegistered && userRole !== 'admin') ? 'cursor-not-allowed bg-slate-100 text-slate-400' : isGouvRegistered ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                    >
                      {actionInProgressId === p.id ? '…' : isGouvRegistered ? (userRole === 'admin' ? 'Retirer' : 'Déjà inscrit') : 'Inscrire'}
                    </button>
                    {userRole === 'admin' && (
                      !isDeleting ? (
                        <button
                          onClick={() => setShowDeleteConfirm(p.id)}
                          className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-rose-600 hover:bg-rose-100 transition"
                        >
                          <Trash2 size={11} className="inline mr-1" /> Supprimer
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => deletePelerin(p.id)}
                            disabled={actionInProgressId === p.id}
                            className="flex-1 rounded-xl bg-rose-600 px-3 py-2 text-[10px] font-black text-white hover:bg-rose-700 disabled:opacity-50 transition"
                          >
                            Confirmer
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(null)}
                            disabled={actionInProgressId === p.id}
                            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition"
                          >
                            Annuler
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Table responsive */}
        <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Pèlerin</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 hidden sm:table-cell">Agence</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 hidden md:table-cell">Dossier</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Gouv</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 hidden lg:table-cell">Nusuk</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw size={16} className="animate-spin" />
                        Chargement des dossiers Platforme MDH…
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">
                      Aucun pèlerin ne correspond à votre recherche.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((p) => {
                    const isEligibleToGouv = Boolean(p.document_url)
                    const isGouvRegistered = Boolean(p.sur_plateforme_gouv)
                    const isNusukRegistered = Boolean(p.sur_plateforme_nusuk)
                    const isDeleting = showDeleteConfirm === p.id

                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white flex-shrink-0">
                              {p.prenom?.[0] || ''}{p.nom_complet?.[0] || ''}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black uppercase text-slate-900 truncate">{p.prenom} {p.nom_complet}</p>
                              <p className="text-[11px] font-semibold text-slate-500 truncate">{p.num_passeport || 'Pas de passeport'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700 hidden sm:table-cell">{p.agences?.nom_agence || '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black whitespace-nowrap ${isEligibleToGouv ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {isEligibleToGouv ? <FileCheck size={13} /> : <FileWarning size={13} />}
                            {isEligibleToGouv ? 'Complet' : 'Incomplet'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black whitespace-nowrap ${isGouvRegistered ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                            <ShieldCheck size={12} />
                            {isGouvRegistered ? 'Inscrit' : 'Non'}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black whitespace-nowrap ${isNusukRegistered ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                            <Globe size={12} />
                            {isNusukRegistered ? 'Inscrit' : 'Non'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1.5">
                            <button
                              disabled={actionInProgressId === p.id || !sessionSummary.session_open || (isGouvRegistered && userRole !== 'admin')}
                              onClick={() => toggleGouvStatus(p.id, isGouvRegistered)}
                              className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition whitespace-nowrap ${actionInProgressId === p.id ? 'cursor-wait bg-slate-100 text-slate-500' : !sessionSummary.session_open || (isGouvRegistered && userRole !== 'admin') ? 'cursor-not-allowed bg-slate-100 text-slate-400' : isGouvRegistered ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'}`}
                            >
                              {actionInProgressId === p.id ? '…' : isGouvRegistered ? (userRole === 'admin' ? 'Retirer' : 'Déjà inscrit') : 'Inscrire'}
                            </button>
                            {userRole === 'admin' && (
                              <div>
                                {!isDeleting ? (
                                  <button
                                    onClick={() => setShowDeleteConfirm(p.id)}
                                    className="w-full rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-rose-600 hover:bg-rose-100 transition"
                                  >
                                    <Trash2 size={11} className="inline mr-1" /> Supprimer
                                  </button>
                                ) : (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => deletePelerin(p.id)}
                                      disabled={actionInProgressId === p.id}
                                      className="flex-1 rounded-lg bg-rose-600 px-2 py-1.5 text-[10px] font-black text-white hover:bg-rose-700 disabled:opacity-50 transition"
                                    >
                                      Confirmer
                                    </button>
                                    <button
                                      onClick={() => setShowDeleteConfirm(null)}
                                      disabled={actionInProgressId === p.id}
                                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-black text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition"
                                    >
                                      Annuler
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dernière synchronisation */}
        <div className="mt-4 text-center text-xs text-slate-500">
          Dernière synchronisation: {sessionSummary.last_sync ? new Date(sessionSummary.last_sync).toLocaleTimeString('fr-FR') : '—'}
        </div>
      </div>
    </div>
  )
}
