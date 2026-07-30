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
  Trash2,
  Loader2,
  PieChart
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
    label: 'Aucune session active',
    quota_total: 0,
    quota_utilise: 0,
    quota_restant: 0,
    session_open: false,
    last_sync: 0
  })
  const [messages, setMessages] = useState<Message[]>([])
  
  // Verrou ultra-rapide pour bloquer immédiatement les multi-clics
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const pendingIdsRef = useRef<Set<string>>(new Set())
  
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const subscriptionRef = useRef<any>(null)
  const messageTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const isMountedRef = useRef(true)
  const sessionSummaryRef = useRef<SessionSummary>(sessionSummary)
  const pelerinsRef = useRef<Pelerin[]>(pelerins)

  // Synchroniser les refs avec l'état
  useEffect(() => {
    sessionSummaryRef.current = sessionSummary
  }, [sessionSummary])

  useEffect(() => {
    pelerinsRef.current = pelerins
  }, [pelerins])

  // Ajouter un message avec auto-fermeture
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

  // 1. Récupération du rôle utilisateur
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

  const syncQuotaToSession = useCallback(async (rows: Pelerin[], sessionId: string | null, quotaTotal: number) => {
    if (!sessionId) return 0

    const quotaUsed = rows.filter((p) => {
      if (!p.sur_plateforme_gouv) return false

      const row = p as Pelerin & { hajj_session_id?: string | null }
      return Boolean(row.hajj_session_id && row.hajj_session_id === sessionId)
    }).length

    await supabase
      .from('hajj_sessions')
      .update({ quota_utilise: quotaUsed })
      .eq('id', sessionId)

    await supabase
      .from('hajj_campaign_config')
      .update({
        quota_session_restant: Math.max(0, quotaTotal - quotaUsed),
        updated_at: new Date().toISOString()
      })
      .eq('id', 1)

    return quotaUsed
  }, [])

  const setPendingIdState = useCallback((id: string, isPending: boolean) => {
    const next = new Set(pendingIdsRef.current)
    if (isPending) next.add(id)
    else next.delete(id)

    pendingIdsRef.current = next
    setPendingIds(next)
  }, [])

  const refreshQuotaFromServer = useCallback(async (sessionId: string | null, quotaTotal: number) => {
    if (!sessionId) {
      setSessionSummary((prev) => ({
        ...prev,
        quota_utilise: 0,
        quota_restant: Math.max(0, quotaTotal - 0)
      }))
      return 0
    }

    const { data, error } = await supabase
      .from('pelerins')
      .select('id, hajj_session_id')
      .eq('sur_plateforme_gouv', true)

    if (error) throw error

    const quotaUsed = data?.filter((row) => row.hajj_session_id === sessionId).length ?? 0

    setSessionSummary((prev) => ({
      ...prev,
      quota_utilise: quotaUsed,
      quota_restant: Math.max(0, quotaTotal - quotaUsed)
    }))

    return quotaUsed
  }, [])

  // 2. Chargement unique des données
  const loadData = useCallback(async () => {
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

      if (configRes.error && configRes.error.code !== 'PGRST116') throw configRes.error
      if (sessionRes.error && sessionRes.error.code !== 'PGRST116') throw sessionRes.error
      if (pelerinsRes.error) throw pelerinsRes.error

      const configData = configRes.data
      const sessionData = sessionRes.data
      const rawPelerins = pelerinsRes.data || []

      const activeSessionId = sessionData?.id ?? null
      const isSessionOpen = Boolean(
        activeSessionId && (
          sessionData?.est_active === true ||
          sessionData?.session_ouverte === true ||
          sessionData?.is_active === true
        )
      ) || Boolean(configData?.session_ouverte)

      if (activeSessionId && isSessionOpen) {
        await supabase
          .from('pelerins')
          .update({ hajj_session_id: activeSessionId })
          .eq('sur_plateforme_gouv', true)
          .is('hajj_session_id', null)
      }

      const filteredByYear = selectedYear === 'all'
        ? rawPelerins
        : rawPelerins.filter((p) => Number(p.campagne ?? 0) === Number(selectedYear))

      // Protection contre le surécrasement des états optimistes en cours
      setPelerins((prev) => {
        const activePending = pendingIdsRef.current
        if (activePending.size === 0) return filteredByYear

        return filteredByYear.map((fetchedP) => {
          if (activePending.has(fetchedP.id)) {
            const currentLocal = prev.find((p) => p.id === fetchedP.id)
            if (currentLocal) {
              return { ...fetchedP, sur_plateforme_gouv: currentLocal.sur_plateforme_gouv }
            }
          }
          return fetchedP
        })
      })

      const agencyList = [...new Set(
        filteredByYear
          .map((p) => p.agences?.nom_agence)
          .filter(Boolean)
      )] as string[]
      setAgences(agencyList.sort())

      const quotaTotal = Number(sessionData?.quota_alloue || configData?.quota_session_total || configData?.quota_total_global || 0)
      const quotaUsed = await syncQuotaToSession(rawPelerins, activeSessionId, quotaTotal)

      setSessionSummary({
        id: activeSessionId,
        label: sessionData?.nom_session || (isSessionOpen ? 'Session ouverte' : 'Aucune session active'),
        quota_total: quotaTotal,
        quota_utilise: quotaUsed,
        quota_restant: Math.max(0, quotaTotal - quotaUsed),
        session_open: isSessionOpen,
        last_sync: Date.now()
      })

      setSyncStatus('connected')
    } catch (error: any) {
      console.error('Erreur chargement données', error)
      if (!isMountedRef.current) return
      setConnectionError('Erreur de connexion aux serveurs.')
      setSyncStatus('error')
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }, [selectedYear, syncQuotaToSession])

  // 3. Chargement initial
  useEffect(() => {
    isMountedRef.current = true
    loadData()

    return () => {
      isMountedRef.current = false
    }
  }, [loadData])

  // 4. Ecoute Temps Réel Optimisée (Realtime)
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pelerins' },
        (payload) => {
          const newPelerin = payload.new as Pelerin
          const session = sessionSummaryRef.current

          setPelerins((prev) => [newPelerin, ...prev])

          if (newPelerin.agences?.nom_agence) {
            setAgences((prev) => {
              if (!prev.includes(newPelerin.agences!.nom_agence!)) {
                return [...prev, newPelerin.agences!.nom_agence!].sort()
              }
              return prev
            })
          }

          if (newPelerin.sur_plateforme_gouv && session?.id && newPelerin.hajj_session_id === session.id) {
            setSessionSummary((prev) => ({
              ...prev,
              quota_utilise: prev.quota_utilise + 1,
              quota_restant: Math.max(0, prev.quota_total - (prev.quota_utilise + 1))
            }))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pelerins' },
        (payload) => {
          const updatedPelerin = payload.new as Pelerin
          const session = sessionSummaryRef.current

          // Protection contre l'écrasement temps réel si une mise à jour locale est pending
          if (pendingIdsRef.current.has(updatedPelerin.id)) return

          setPelerins((prev) =>
            prev.map((p) => (p.id === updatedPelerin.id ? { ...p, ...updatedPelerin, agences: p.agences } : p))
          )

          const wasGouv = Boolean((payload.old as Pelerin)?.sur_plateforme_gouv)
          const isNowGouv = Boolean(updatedPelerin.sur_plateforme_gouv)
          const belongsToSession = session?.id && updatedPelerin.hajj_session_id === session.id

          if (!wasGouv && isNowGouv && belongsToSession) {
            setSessionSummary((prev) => ({
              ...prev,
              quota_utilise: prev.quota_utilise + 1,
              quota_restant: Math.max(0, prev.quota_total - (prev.quota_utilise + 1))
            }))
          } else if (wasGouv && !isNowGouv && belongsToSession) {
            setSessionSummary((prev) => ({
              ...prev,
              quota_utilise: Math.max(0, prev.quota_utilise - 1),
              quota_restant: Math.max(0, prev.quota_total - Math.max(0, prev.quota_utilise - 1))
            }))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pelerins' },
        (payload) => {
          const deletedPelerin = payload.old as Pelerin
          const session = sessionSummaryRef.current

          setPelerins((prev) => prev.filter((p) => p.id !== deletedPelerin.id))

          if (deletedPelerin.sur_plateforme_gouv && session?.id && deletedPelerin.hajj_session_id === session.id) {
            setSessionSummary((prev) => ({
              ...prev,
              quota_utilise: Math.max(0, prev.quota_utilise - 1),
              quota_restant: Math.max(0, prev.quota_total - Math.max(0, prev.quota_utilise - 1))
            }))
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
  }, [])

  // Memoization du filtrage
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

  // Action d'inscription/Désinscription ultra-optimisée (Anti-échec réseau + Multi-clic instantané)
  const toggleGouvStatus = async (id: string, currentStatus: boolean) => {
    // 1. Bloquer immédiatement en utilisant le Ref synchrone (anti-double-clic absolu)
    if (pendingIdsRef.current.has(id)) return

    if (!sessionSummary.session_open) {
      addMessage('error', 'La session Gouv est fermée. Les inscriptions sont verrouillées.')
      return
    }

    const p = pelerinsRef.current.find((item) => item.id === id)
    if (!p) return

    if (currentStatus && userRole !== 'admin') {
      addMessage('error', 'Seul l\'administrateur peut retirer un pèlerin de la plateforme Gouv.')
      return
    }

    if (!currentStatus && !p.document_url) {
      addMessage('error', 'Ce pèlerin n\'est pas encore éligible au Gouv : le dossier n\'est pas complet.')
      return
    }

    if (!currentStatus && sessionSummary.quota_restant <= 0) {
      addMessage('error', 'Quota national atteint. Aucune place disponible.')
      return
    }

    const nextValue = !currentStatus
    setPendingIdState(id, true)

    // 2. Mise à jour optimiste ultra-rapide de l'UI
    setPelerins((prev) => prev.map((item) => item.id === id ? { ...item, sur_plateforme_gouv: nextValue } : item))
    setSessionSummary((prev) => {
      const diff = nextValue ? 1 : -1
      const newUsed = Math.max(0, prev.quota_utilise + diff)
      return {
        ...prev,
        quota_utilise: newUsed,
        quota_restant: Math.max(0, prev.quota_total - newUsed)
      }
    })

    // 3. Boucle de tentative automatique (Retry avec Backoff pour connexion instable)
    let retries = 3
    let success = false
    let lastError = null

    while (retries > 0 && !success) {
      try {
        const { data, error } = await supabase
          .from('pelerins')
          .update({
            sur_plateforme_gouv: nextValue,
            hajj_session_id: nextValue ? sessionSummary.id : null
          })
          .eq('id', id)
          .eq('sur_plateforme_gouv', currentStatus)
          .select()

        if (error) throw error

        if (!data || data.length === 0) {
          throw new Error('Mise à jour ignorée : Le statut a déjà été modifié.')
        }

        success = true
      } catch (err: any) {
        lastError = err
        retries--
        if (retries > 0) {
          await new Promise((res) => setTimeout(res, 800)) // Attendre 800ms avant re-tentative
        }
      }
    }

    if (success) {
      refreshQuotaFromServer(sessionSummary.id ?? null, sessionSummary.quota_total).catch(() => {})
      addMessage('success', nextValue ? 'Pèlerin inscrit sur la plateforme Gouv.' : 'Inscription Gouv retirée.')
    } else {
      console.error('Erreur finale mise à jour Gouv', lastError)

      // Annulation optimiste (Rollback) si échec total après les re-tentatives
      setPelerins((prev) => prev.map((item) => item.id === id ? { ...item, sur_plateforme_gouv: currentStatus } : item))
      setSessionSummary((prev) => {
        const revertDelta = nextValue ? -1 : 1
        const newUsed = Math.max(0, prev.quota_utilise + revertDelta)
        return {
          ...prev,
          quota_utilise: newUsed,
          quota_restant: Math.max(0, prev.quota_total - newUsed)
        }
      })

      addMessage('error', lastError?.message || 'Connexion instable : L\'action n\'a pas pu être enregistrée.')
    }

    setPendingIdState(id, false)
  }

  // Suppression pèlerin (Admin)
  const deletePelerin = async (id: string) => {
    if (userRole !== 'admin' || pendingIdsRef.current.has(id)) return

    setPendingIdState(id, true)
    try {
      const { error } = await supabase.from('pelerins').delete().eq('id', id)
      if (error) throw error

      setPelerins((prev) => prev.filter((item) => item.id !== id))
      addMessage('success', 'Pèlerin supprimé.')
      setShowDeleteConfirm(null)
    } catch (error) {
      console.error('Erreur suppression', error)
      addMessage('error', 'Impossible de supprimer le pèlerin.')
    } finally {
      setPendingIdState(id, false)
    }
  }

  // Composant Filtres réutilisable
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
          Éligibles Gouv
        </label>

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

      {/* Header FIXE : Optimisé PC & Mobile */}
      <div className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-sm transition-all">
        <div className="mx-auto max-w-7xl px-3 py-2 md:px-8 md:py-3 space-y-2 md:space-y-3">
          
          {/* Ligne Supérieure Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link
                href="/hajj/admin"
                className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 transition hover:border-slate-300 hover:text-indigo-600 hover:bg-indigo-50"
              >
                <ArrowLeft size={16} />
              </Link>

              <div>
                <p className="hidden md:block text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Espace administration</p>
                <div className="flex items-center gap-2">
                  <h1 className="flex items-center gap-1.5 text-base font-black tracking-tight text-slate-900 md:text-xl">
                    <Globe size={18} className="text-indigo-600" /> Plateforme MDH
                  </h1>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${sessionSummary.session_open ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {sessionSummary.session_open ? <CheckCircle2 size={11} /> : <Lock size={11} />}
                    {sessionSummary.session_open ? 'Ouverte' : 'Fermée'}
                  </span>
                </div>
              </div>

              {/* Card Quota Temps Réel PC (Identique à l'entête mobile) */}
              <div className="hidden md:flex items-center justify-between rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-slate-50 to-emerald-50/90 px-3.5 py-1.5 shadow-sm ml-4">
                <div className="flex items-center gap-2 mr-3">
                  <PieChart size={16} className="text-indigo-600" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">Quotas :</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-black">
                  <span className="text-indigo-600">Utilisés: {sessionSummary.quota_utilise}</span>
                  <span className="text-emerald-600">Reste: {sessionSummary.quota_restant} / {sessionSummary.quota_total}</span>
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
                disabled={loading}
                className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 transition hover:border-slate-300 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 shadow-sm"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Mini Card Quota Mobile (Uniquement sur smartphones) */}
          <div className="md:hidden flex items-center justify-between rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-slate-50 to-emerald-50/90 px-3 py-1.5 shadow-sm">
            <div className="flex items-center gap-2">
              <PieChart size={15} className="text-indigo-600" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">Quotas :</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-black">
              <span className="text-indigo-600">Utilisés: {sessionSummary.quota_utilise}</span>
              <span className="text-emerald-600">Reste: {sessionSummary.quota_restant} / {sessionSummary.quota_total}</span>
            </div>
          </div>

          {/* Filtres affichés dans l'entête fixe UNIQUEMENT sur Desktop */}
          <div className="hidden md:block">
            <SearchAndFilters />
          </div>

        </div>
      </div>

      {/* Contenu principal de la page */}
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-8">

        {/* Filtres affichés dans la page (non fixe) UNIQUEMENT sur Mobile */}
        <div className="mb-4 md:hidden">
          <SearchAndFilters />
        </div>

        {/* Synthèse globale sous forme de cartes */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Total Filtré</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{stats.total}</p>
            <p className="text-xs text-slate-500">Pèlerins affichés</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Utilisé</p>
            <p className="mt-2 text-2xl font-black text-indigo-600">{sessionSummary.quota_utilise}</p>
            <p className="text-xs text-slate-500">Inscriptions effectives</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Disponible</p>
            <p className="mt-2 text-2xl font-black text-emerald-600">{sessionSummary.quota_restant}</p>
            <p className="text-xs text-slate-500">Places attribuables</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Inscrits Gouv</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{stats.gouvInscrits}</p>
            <p className="text-xs text-slate-500">Sur la sélection actuelle</p>
          </div>
        </div>

        {/* Table responsive (Desktop) */}
        <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Pèlerin</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Agence</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Dossier</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Gouv</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Nusuk</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw size={16} className="animate-spin" /> Chargement des pèlerins…
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">
                      Aucun pèlerin trouvé.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((p) => {
                    const isEligibleToGouv = Boolean(p.document_url)
                    const isGouvRegistered = Boolean(p.sur_plateforme_gouv)
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
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${isGouvRegistered ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                            <ShieldCheck size={12} />
                            {isGouvRegistered ? 'Inscrit' : 'Non'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${isNusukRegistered ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                            <Globe size={12} />
                            {isNusukRegistered ? 'Inscrit' : 'Non'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              disabled={isPending || !sessionSummary.session_open || (isGouvRegistered && userRole !== 'admin')}
                              onClick={() => toggleGouvStatus(p.id, isGouvRegistered)}
                              className={`flex items-center justify-center min-w-[90px] rounded-lg px-3 py-1.5 text-[10px] font-black uppercase transition ${isPending ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : !sessionSummary.session_open || (isGouvRegistered && userRole !== 'admin') ? 'cursor-not-allowed bg-slate-100 text-slate-400' : isGouvRegistered ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                            >
                              {isPending ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : isGouvRegistered ? (
                                userRole === 'admin' ? 'Retirer' : 'Déjà inscrit'
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

        {/* Vue Mobile en Cartes */}
        <div className="mt-4 space-y-3 md:hidden">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm font-semibold text-slate-500 shadow-sm">
              <div className="flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin" /> Chargement des pèlerins…
              </div>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm font-semibold text-slate-500 shadow-sm">
              Aucun pèlerin trouvé.
            </div>
          ) : (
            filteredData.map((p) => {
              const isEligibleToGouv = Boolean(p.document_url)
              const isGouvRegistered = Boolean(p.sur_plateforme_gouv)
              const isPending = pendingIds.has(p.id)

              return (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900">{p.prenom} {p.nom_complet}</p>
                      <p className="mt-1 text-xs text-slate-500">{p.num_passeport || 'Sans passeport'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${isGouvRegistered ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                        <ShieldCheck size={11} />
                        {isGouvRegistered ? 'Gouv' : 'Non'}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${isEligibleToGouv ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {isEligibleToGouv ? <FileCheck size={11} /> : <FileWarning size={11} />}
                        {isEligibleToGouv ? 'Complet' : 'Incomplet'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="font-black uppercase tracking-[0.2em] text-slate-400">Agence</p>
                      <p className="mt-1 font-semibold text-slate-700">{p.agences?.nom_agence || '—'}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="font-black uppercase tracking-[0.2em] text-slate-400">Statut</p>
                      <p className="mt-1 font-semibold text-slate-700">{isGouvRegistered ? 'Inscrit' : 'En attente'}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      disabled={isPending || !sessionSummary.session_open || (isGouvRegistered && userRole !== 'admin')}
                      onClick={() => toggleGouvStatus(p.id, isGouvRegistered)}
                      className={`w-full flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-black uppercase transition ${isPending ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : !sessionSummary.session_open || (isGouvRegistered && userRole !== 'admin') ? 'cursor-not-allowed bg-slate-100 text-slate-400' : isGouvRegistered ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                    >
                      {isPending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : isGouvRegistered ? (
                        userRole === 'admin' ? 'Retirer' : 'Déjà inscrit'
                      ) : (
                        'Inscrire'
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
      </div>

      {/* Modal confirmation suppression admin */}
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