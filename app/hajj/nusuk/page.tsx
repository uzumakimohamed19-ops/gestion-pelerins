'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase, getUser } from '@/lib/supabase'
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
  X,
  AlertCircle,
  Wifi,
  WifiOff,
  Trash2,
  Loader2,
  PieChart,
  Clock
} from 'lucide-react'

type Pelerin = {
  id: string
  prenom?: string
  nom_complet?: string
  telephone_pelerin?: string
  num_passeport?: string
  campagne?: string | number
  document_url?: string | null
  sur_plateforme_gouv?: boolean | null
  sur_plateforme_nusuk?: boolean | null
  agence_id?: string
  agences?: { nom_agence?: string }
  created_at?: string
  date_inscription?: string
  hajj_session_id?: string | null
}

type SessionSummary = {
  id?: string | null
  label: string
  quota_total: number
  quota_utilise: number
  quota_restant: number
  session_open: boolean
  last_sync: number
}

type SyncStatus = 'connected' | 'disconnected' | 'syncing' | 'error'

type Message = {
  type: 'success' | 'error'
  text: string
  id: string
}

export default function PagePlatformeMdh() {
  const { selectedYear } = useYear()
  const [pelerins, setPelerins] = useState<Pelerin[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedAgence, setSelectedAgence] = useState('all')
  const [showEligibleOnly, setShowEligibleOnly] = useState(false)
  const [agences, setAgences] = useState<string[]>([])
  const [sessionSummary, setSessionSummary] = useState<SessionSummary>({
    id: null,
    label: 'Vérification de la session…',
    quota_total: 0,
    quota_utilise: 0,
    quota_restant: 0,
    session_open: false,
    last_sync: 0
  })
  const [messages, setMessages] = useState<Message[]>([])

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const pendingIdsRef = useRef<Set<string>>(new Set())

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  
  const [authReady, setAuthReady] = useState(false)
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null)
  const [userAgenceId, setUserAgenceId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const subscriptionRef = useRef<any>(null)
  const messageTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const isMountedRef = useRef(true)
  const sessionSummaryRef = useRef<SessionSummary>(sessionSummary)
  const pelerinsRef = useRef<Pelerin[]>(pelerins)

  useEffect(() => {
    sessionSummaryRef.current = sessionSummary
  }, [sessionSummary])

  useEffect(() => {
    pelerinsRef.current = pelerins
  }, [pelerins])

  const addMessage = useCallback((type: 'success' | 'error', text: string) => {
    const id = `msg-${Date.now()}-${Math.random()}`
    const message: Message = { type, text, id }

    setMessages((prev) => [...prev, message])

    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== id))
      }
    }, 4000)

    messageTimersRef.current.set(id, timer)
    return id
  }, [])

  // 1. Résolution de l'authentification et de l'agence
  useEffect(() => {
    let isSubscribed = true

    const getUserRoleAndAgency = async () => {
      try {
        const { data: { user } } = await getUser()
        if (user && isSubscribed) {
          const { data } = await supabase
            .from('user_roles')
            .select('role, agence_id')
            .eq('user_id', user.id)
            .maybeSingle()

          if (isSubscribed) {
            setUserRole(data?.role === 'admin' ? 'admin' : 'user')
            setUserAgenceId(data?.agence_id || null)
            setAuthReady(true)
          }
        } else if (isSubscribed) {
          setUserRole('user')
          setAuthReady(true)
        }
      } catch (error) {
        console.error('Erreur récupération profil utilisateur', error)
        if (isSubscribed) {
          setUserRole('user')
          setAuthReady(true)
        }
      }
    }

    getUserRoleAndAgency()

    return () => {
      isSubscribed = false
    }
  }, [])

  const setPendingIdState = useCallback((id: string, isPending: boolean) => {
    const next = new Set(pendingIdsRef.current)
    if (isPending) next.add(id)
    else next.delete(id)

    pendingIdsRef.current = next
    setPendingIds(next)
  }, [])

  // 2. Chargement : Conditionné à l'ouverture de la session
  const loadData = useCallback(async () => {
    if (!isMountedRef.current || !authReady) return

    try {
      setSyncStatus('syncing')
      setConnectionError(null)

      // Étape 1 : Vérifier la session en premier
      const { data: sessionData, error: sessionError } = await supabase
        .from('hajj_sessions')
        .select('id, nom_session, quota_alloue, quota_utilise, est_active, statut_fermeture')
        .order('date_ouverture', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!isMountedRef.current) return
      if (sessionError && sessionError.code !== 'PGRST116') throw sessionError

      const activeSessionId = sessionData?.id ?? null
      const isSessionOpen = Boolean(
        activeSessionId &&
        sessionData?.est_active === true &&
        sessionData?.statut_fermeture === 'EN_COURS'
      )

      const quotaTotal = Number(sessionData?.quota_alloue || 0)
      const quotaUsed = Number(sessionData?.quota_utilise || 0)

      setSessionSummary({
        id: activeSessionId,
        label: sessionData?.nom_session || (isSessionOpen ? 'Session ouverte' : 'Aucune session active'),
        quota_total: quotaTotal,
        quota_utilise: quotaUsed,
        quota_restant: Math.max(0, quotaTotal - quotaUsed),
        session_open: isSessionOpen,
        last_sync: Date.now()
      })

      // Étape 2 : Si la session est fermée, NE PAS charger les pèlerins
      if (!isSessionOpen) {
        setPelerins([])
        setLoading(false)
        setSyncStatus('connected')
        return
      }

      // Étape 3 : Session ouverte -> Chargement des pèlerins non inscrits
      let pelerinsQuery = supabase
        .from('pelerins')
        .select('id, prenom, nom_complet, telephone_pelerin, num_passeport, campagne, document_url, sur_plateforme_gouv, sur_plateforme_nusuk, hajj_session_id, created_at, agence_id, agences(nom_agence)')
        .or('sur_plateforme_gouv.eq.false,sur_plateforme_gouv.is.null')
        .order('created_at', { ascending: false })

      if (userRole !== 'admin' && userAgenceId) {
        pelerinsQuery = pelerinsQuery.eq('agence_id', userAgenceId)
      }

      if (selectedYear !== 'all') {
        pelerinsQuery = pelerinsQuery.eq('campagne', selectedYear)
      }

      const { data: pelerinsData, error: pelerinsError } = await pelerinsQuery
      if (!isMountedRef.current) return
      if (pelerinsError) throw pelerinsError

      const rawPelerins = (pelerinsData as unknown as Pelerin[]) || []
      setPelerins(rawPelerins.filter((p) => !pendingIdsRef.current.has(p.id)))

      const agencyList = [...new Set(
        rawPelerins
          .map((p) => p.agences?.nom_agence)
          .filter(Boolean)
      )] as string[]
      setAgences(agencyList.sort())

      setSyncStatus('connected')
    } catch (error: any) {
      console.error('Erreur chargement données', error)
      if (!isMountedRef.current) return
      setConnectionError('Erreur de connexion aux serveurs.')
      setSyncStatus('error')
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }, [authReady, userRole, userAgenceId, selectedYear])

  useEffect(() => {
    isMountedRef.current = true
    if (authReady) {
      loadData()
    }
    return () => {
      isMountedRef.current = false
    }
  }, [authReady, loadData])

  // 3. Realtime : Synchronisation du quota
  useEffect(() => {
    const channel = supabase
      .channel('realtime-quota-global-channel')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'hajj_sessions'
        },
        (payload) => {
          const updated = payload.new as any
          if (!updated) return

          const isNowOpen = updated.est_active === true && updated.statut_fermeture === 'EN_COURS'
          const wasOpen = sessionSummaryRef.current.session_open

          const quotaTotal = Number(updated.quota_alloue || 0)
          const quotaUsed = Number(updated.quota_utilise || 0)

          setSessionSummary((prev) => ({
            ...prev,
            id: updated.id,
            label: updated.nom_session || (isNowOpen ? 'Session ouverte' : 'Session fermée'),
            quota_total: quotaTotal,
            quota_utilise: quotaUsed,
            quota_restant: Math.max(0, quotaTotal - quotaUsed),
            session_open: isNowOpen,
            last_sync: Date.now()
          }))

          if (isNowOpen && !wasOpen) {
            loadData()
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setSyncStatus('connected')
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setSyncStatus('disconnected')
      })

    subscriptionRef.current = channel

    return () => {
      if (subscriptionRef.current) supabase.removeChannel(subscriptionRef.current)
    }
  }, [loadData])

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
    const nusukInscrits = filteredData.filter((p) => p.sur_plateforme_nusuk).length
    const eligiblesGouv = filteredData.filter((p) => Boolean(p.document_url)).length

    return { total, nusukInscrits, eligiblesGouv }
  }, [filteredData])

  // 4. Inscription atomique via RPC
  const reserverPlaceGouv = async (id: string) => {
    if (pendingIdsRef.current.has(id)) return

    if (!sessionSummary.session_open || !sessionSummary.id) {
      addMessage('error', 'La session Gouv est fermée. Les inscriptions sont verrouillées.')
      return
    }

    const p = pelerinsRef.current.find((item) => item.id === id)
    if (!p) return

    if (!p.document_url) {
      addMessage('error', "Ce pèlerin n'est pas encore éligible au Gouv : le dossier n'est pas complet.")
      return
    }

    if (sessionSummary.quota_restant <= 0) {
      addMessage('error', 'Quota national atteint. Aucune place disponible.')
      return
    }

    setPendingIdState(id, true)

    try {
      const { data, error } = await supabase.rpc('reserver_place_gouv', {
        p_pelerin_id: String(id),
        p_session_id: String(sessionSummary.id),
        p_action: 'INSCRIRE'
      })

      if (error) {
        throw new Error(error.message || error.details || 'Erreur base de données.')
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'Opération refusée par le serveur.')
      }

      // Retrait du pèlerin de la vue
      setPelerins((prev) => prev.filter((item) => item.id !== id))
      addMessage('success', `Place validée avec succès pour ${p.prenom || ''} ${p.nom_complet || ''}.`)
    } catch (err: any) {
      console.error('Erreur réservation RPC:', err)
      addMessage('error', err.message || "La place n'a pas pu être validée.")
    } finally {
      setPendingIdState(id, false)
    }
  }

  // 5. Suppression (Admin uniquement)
  const deletePelerin = async (id: string) => {
    if (userRole !== 'admin' || pendingIdsRef.current.has(id)) return

    setPendingIdState(id, true)
    try {
      const { error } = await supabase.from('pelerins').delete().eq('id', id)
      if (error) throw error

      setPelerins((prev) => prev.filter((item) => item.id !== id))
      addMessage('success', 'Pèlerin supprimé.')
      setShowDeleteConfirm(null)
    } catch (error: any) {
      console.error('Erreur suppression', error)
      addMessage('error', error.message || 'Impossible de supprimer le pèlerin.')
    } finally {
      setPendingIdState(id, false)
    }
  }

  const SearchAndFilters = () => (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5 shadow-inner md:flex-row md:items-center md:justify-between md:rounded-2xl md:p-2">
      <div className="relative w-full md:max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un pèlerin ou passeport..."
          className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer shadow-sm">
          <input
            type="checkbox"
            checked={showEligibleOnly}
            onChange={(e) => setShowEligibleOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Éligibles Gouv uniquement
        </label>

        {userRole === 'admin' && (
          <select
            value={selectedAgence}
            onChange={(e) => setSelectedAgence(e.target.value)}
            className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition shadow-sm"
          >
            <option value="all">Toutes les agences</option>
            {agences.map((agence) => (
              <option key={agence} value={agence}>{agence}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-12">
      {/* Notifications Flottantes */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold flex items-center gap-3 shadow-lg animate-in slide-in-from-bottom-2 ${
              msg.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {msg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="flex-1">{msg.text}</span>
            <button
              onClick={() => {
                const timer = messageTimersRef.current.get(msg.id)
                if (timer) clearTimeout(timer)
                messageTimersRef.current.delete(msg.id)
                setMessages((prev) => prev.filter((m) => m.id !== msg.id))
              }}
              className="text-current hover:opacity-70"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Header FIXE */}
      <div className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-sm transition-all">
        <div className="mx-auto max-w-7xl px-3 py-2 md:px-8 md:py-3 space-y-2 md:space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link
                href="/hajj/admin"
                className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 transition hover:border-slate-300 hover:text-indigo-600 hover:bg-indigo-50"
              >
                <ArrowLeft size={16} />
              </Link>

              <div>
                <p className="hidden md:block text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                  {userRole === 'admin' ? 'Espace administration' : 'Espace agence'}
                </p>
                <div className="flex items-center gap-2">
                  <h1 className="flex items-center gap-1.5 text-base font-black tracking-tight text-slate-900 md:text-xl">
                    <Globe size={18} className="text-indigo-600" /> Distribution Quotas Gouv
                  </h1>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${sessionSummary.session_open ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {sessionSummary.session_open ? <CheckCircle2 size={11} /> : <Lock size={11} />}
                    {sessionSummary.session_open ? 'Ouverte' : 'Fermée'}
                  </span>
                </div>
              </div>

              {/* Quotas Nationaux Synchronisés (Desktop) */}
              <div className="hidden md:flex items-center justify-between rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-slate-50 to-emerald-50/90 px-3.5 py-1.5 shadow-sm ml-4">
                <div className="flex items-center gap-2 mr-3">
                  <PieChart size={16} className="text-indigo-600" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">Quota National :</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-black">
                  <span className="text-indigo-600">Utilisés: {sessionSummary.quota_utilise}</span>
                  <span className="text-emerald-600">Restant: {sessionSummary.quota_restant} / {sessionSummary.quota_total}</span>
                </div>
              </div>
            </div>

            {/* Actions Droite */}
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black border md:px-3 md:py-1.5 ${syncStatus === 'connected' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : syncStatus === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                {syncStatus === 'connected' ? <Wifi size={13} /> : <WifiOff size={13} />}
                <span className="hidden sm:inline">{syncStatus === 'connected' ? 'Connecté' : syncStatus === 'error' ? 'Erreur' : 'Sync...'}</span>
              </div>

              <button
                onClick={() => loadData()}
                disabled={loading || !authReady}
                className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 transition hover:border-slate-300 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 shadow-sm"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Quotas Nationaux Synchronisés (Mobile) */}
          <div className="md:hidden flex items-center justify-between rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-slate-50 to-emerald-50/90 px-3 py-1.5 shadow-sm">
            <div className="flex items-center gap-2">
              <PieChart size={15} className="text-indigo-600" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">Quota National :</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-black">
              <span className="text-indigo-600">Utilisés: {sessionSummary.quota_utilise}</span>
              <span className="text-emerald-600">Restant: {sessionSummary.quota_restant} / {sessionSummary.quota_total}</span>
            </div>
          </div>

          {/* Filtres Desktop */}
          {sessionSummary.session_open && (
            <div className="hidden md:block">
              <SearchAndFilters />
            </div>
          )}
        </div>
      </div>

      {/* Contenu principal */}
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-8">
        
        {/* CAS 1 : SESSION FERMÉE OU INACTIVE */}
        {!loading && !sessionSummary.session_open ? (
          <div className="mt-8 rounded-3xl border border-amber-200/80 bg-white p-8 text-center shadow-sm md:p-14">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 mb-5">
              <Clock size={32} className="animate-pulse" />
            </div>
            <h2 className="text-xl font-black tracking-tight text-slate-900 md:text-2xl">
              La session de distribution des quotas est actuellement fermée
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold text-slate-600 leading-relaxed">
              Pour des raisons d'équité et de synchronisation des quotas nationaux, la liste de vos pèlerins se chargera automatiquement dès l'ouverture de la session.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              En attente du signal d'ouverture en temps réel…
            </div>
          </div>
        ) : (
          /* CAS 2 : SESSION OUVERTE */
          <>
            {/* Filtres Mobile */}
            <div className="mb-4 md:hidden">
              <SearchAndFilters />
            </div>

            {/* Synthèse */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">À Inscrire</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{stats.total}</p>
                <p className="text-xs text-slate-500">Pèlerins non inscrits</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Dossiers Prêts</p>
                <p className="mt-2 text-2xl font-black text-emerald-600">{stats.eligiblesGouv}</p>
                <p className="text-xs text-slate-500">Complets pour inscription</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Quota Global Restant</p>
                <p className="mt-2 text-2xl font-black text-indigo-600">{sessionSummary.quota_restant}</p>
                <p className="text-xs text-slate-500">Places encore disponibles</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Quota Global Utilisé</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{sessionSummary.quota_utilise}</p>
                <p className="text-xs text-slate-500">Inscriptions confirmées</p>
              </div>
            </div>

            {/* Table Desktop */}
            <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Pèlerin</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Agence</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Dossier</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Nusuk</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 text-right">Action Immédiate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading || !authReady ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw size={16} className="animate-spin" /> Préparation des pèlerins non inscrits…
                          </div>
                        </td>
                      </tr>
                    ) : filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">
                          Aucun pèlerin en attente d'inscription.
                        </td>
                      </tr>
                    ) : (
                      filteredData.map((p) => {
                        const isEligibleToGouv = Boolean(p.document_url)
                        const isNusukRegistered = Boolean(p.sur_plateforme_nusuk)
                        const isPending = pendingIds.has(p.id)

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
                            <td className="px-4 py-3 text-sm font-semibold text-slate-700">{p.agences?.nom_agence || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${isEligibleToGouv ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {isEligibleToGouv ? <FileCheck size={13} /> : <FileWarning size={13} />}
                                {isEligibleToGouv ? 'Complet' : 'Incomplet'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${isNusukRegistered ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                                <Globe size={12} />
                                {isNusukRegistered ? 'Inscrit' : 'Non'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  disabled={isPending || !sessionSummary.session_open || !isEligibleToGouv || sessionSummary.quota_restant <= 0}
                                  onClick={() => reserverPlaceGouv(p.id)}
                                  className={`flex items-center justify-center min-w-[110px] rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition ${
                                    isPending
                                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                      : !sessionSummary.session_open || !isEligibleToGouv || sessionSummary.quota_restant <= 0
                                      ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                                      : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                                  }`}
                                >
                                  {isPending ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    'Inscrire'
                                  )}
                                </button>

                                {userRole === 'admin' && (
                                  <button
                                    disabled={isPending}
                                    onClick={() => setShowDeleteConfirm(p.id)}
                                    className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                                    title="Supprimer"
                                  >
                                    <Trash2 size={14} />
                                  </button>
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

            {/* Vue Mobile */}
            <div className="mt-4 space-y-3 md:hidden">
              {loading || !authReady ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm font-semibold text-slate-500 shadow-sm">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw size={16} className="animate-spin" /> Préparation des pèlerins non inscrits…
                  </div>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm font-semibold text-slate-500 shadow-sm">
                  Aucun pèlerin en attente d'inscription.
                </div>
              ) : (
                filteredData.map((p) => {
                  const isEligibleToGouv = Boolean(p.document_url)
                  const isPending = pendingIds.has(p.id)

                  return (
                    <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900">{p.prenom} {p.nom_complet}</p>
                          <p className="mt-1 text-xs text-slate-500">{p.num_passeport || 'Sans passeport'}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${isEligibleToGouv ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {isEligibleToGouv ? <FileCheck size={11} /> : <FileWarning size={11} />}
                            {isEligibleToGouv ? 'Complet' : 'Incomplet'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-slate-50 p-2">
                          <p className="font-black uppercase tracking-[0.2em] text-slate-400">Agence</p>
                          <p className="mt-1 font-semibold text-slate-700 truncate">{p.agences?.nom_agence || '—'}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-2">
                          <p className="font-black uppercase tracking-[0.2em] text-slate-400">Statut</p>
                          <p className="mt-1 font-semibold text-amber-600">Non inscrit</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <button
                          disabled={isPending || !sessionSummary.session_open || !isEligibleToGouv || sessionSummary.quota_restant <= 0}
                          onClick={() => reserverPlaceGouv(p.id)}
                          className={`w-full flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-black uppercase transition ${
                            isPending
                              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                              : !sessionSummary.session_open || !isEligibleToGouv || sessionSummary.quota_restant <= 0
                              ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                          }`}
                        >
                          {isPending ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            'Inscrire au Gouv'
                          )}
                        </button>

                        {userRole === 'admin' && (
                          <button
                            disabled={isPending}
                            onClick={() => setShowDeleteConfirm(p.id)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal suppression admin */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-black text-slate-900">Confirmer la suppression</h3>
            <p className="mt-2 text-sm font-semibold text-slate-600">Êtes-vous sûr de vouloir supprimer ce pèlerin ? Cette action est irréversible.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black uppercase text-slate-700 transition hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={() => deletePelerin(showDeleteConfirm)}
                disabled={pendingIds.has(showDeleteConfirm)}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black uppercase text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {pendingIds.has(showDeleteConfirm) && <Loader2 size={15} className="animate-spin" />}
                {pendingIds.has(showDeleteConfirm) ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}