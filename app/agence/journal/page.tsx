'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useQuery } from '@powersync/react'
import { supabase, getUser } from '../../../lib/supabase'
import {
  ArrowLeft, Plus, Search, Calendar, ArrowRightLeft,
  Plane, Globe, Hotel, Bus, Receipt, Package, FileText,
  Smartphone, Filter, X, Moon, Sun
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type Operation = {
  id: string
  created_at: string
  type_activite: string
  client_nom: string
  client_telephone: string | null
  compagnie_fournisseur: string | null
  reference_document: string | null
  description: string | null
  prix_achat: number
  prix_vente: number
  frais_annexes: number
  montant_verse: number
  benefice: number
  statut_paiement: string
  mode_paiement: string
  montant_transfert?: number | null
}

const CATEGORIES: { id: string; label: string; icon: React.ElementType }[] = [
  { id: 'TOUT', label: 'Toutes les opérations', icon: FileText },
  { id: 'TRANSFERT', label: "Transferts d'argent", icon: ArrowRightLeft },
  { id: 'BILLET', label: 'Billets d’avion', icon: Plane },
  { id: 'VISA', label: 'Visas & Séjours', icon: Globe },
  { id: 'HOTEL', label: 'Hôtels & Hébergements', icon: Hotel },
  { id: 'TRANSPORT', label: 'Transports', icon: Bus },
  { id: 'ASSURANCE', label: 'Assurances', icon: Receipt },
  { id: 'PACKAGE', label: 'Packages Voyages', icon: Package },
]

export default function JournalOperations() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [agenceId, setAgenceId] = useState<string | null>(null)

  // 🌓 GESTION DU THÈME SOMBRE (Synchronisé avec le reste de l'application)
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('compta_theme_dark') === 'true'
    }
    return false
  })

  const toggleDarkMode = () => {
    setIsDark(prev => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem('compta_theme_dark', String(next))
      }
      return next
    })
  }

  // 1. Session & Profil Agence
  useEffect(() => {
    async function initUser() {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user?.id) {
        setCurrentUserId(data.session.user.id)
      } else {
        const { data: userData } = await getUser()
        if (userData?.user?.id) setCurrentUserId(userData.user.id)
      }
    }
    initUser()
  }, [])

  const { data: profile } = useQuery<{ agence_id: string }>(
    `SELECT agence_id FROM profiles WHERE id = ? LIMIT 1`,
    [currentUserId ?? '']
  )

  useEffect(() => {
    if (profile?.[0]?.agence_id) {
      setAgenceId(profile[0].agence_id)
    }
  }, [profile])

  // 2. Requête SQLite locale PowerSync
  const { data: operationsRaw = [] } = useQuery<Operation>(
    `SELECT 
      id, created_at, type_activite, client_nom, client_telephone,
      compagnie_fournisseur, reference_document, description,
      prix_achat, prix_vente, frais_annexes, montant_verse, benefice,
      statut_paiement, mode_paiement, montant_transfert
     FROM operations_agence
     WHERE agence_id = ? OR agence_id IS NULL
     ORDER BY created_at DESC`,
    [agenceId ?? '']
  )

  // ─── Période temporelle (Mois en cours par défaut) ─────────────────────────

  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentYearKey = `${now.getFullYear()}`

  const [filterPeriodType, setFilterPeriodType] = useState<'MOIS' | 'ANNEE' | 'TOUT'>('MOIS')
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey)
  const [selectedYear, setSelectedYear] = useState<string>(currentYearKey)

  // Filtres principaux
  const [selectedCategory, setSelectedCategory] = useState<string>('TOUT')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('TOUS')

  // ─── Sous-Filtres spécifiques Transfert d'Argent ───────────────────────────
  const [transfertOperateur, setTransfertOperateur] = useState<string>('TOUS')
  const [transfertSens, setTransfertSens] = useState<'TOUS' | 'DEPOT' | 'RETRAIT'>('TOUS')

  // Logique de génération des années basée sur l'historique
  const anneesDisponibles = useMemo(() => {
    const yearsSet = new Set<string>()
    yearsSet.add(String(now.getFullYear()))

    operationsRaw.forEach((op) => {
      const d = new Date(op.created_at)
      if (!isNaN(d.getTime())) {
        yearsSet.add(String(d.getFullYear()))
      }
    })

    return Array.from(yearsSet).sort((a, b) => Number(b) - Number(a))
  }, [operationsRaw, now])

  // Génération des 18 derniers mois pour le sélecteur
  const optionsMois = useMemo(() => {
    const list: { key: string; label: string }[] = []
    const d = new Date()
    for (let i = 0; i < 18; i++) {
      const dateTarget = new Date(d.getFullYear(), d.getMonth() - i, 1)
      const key = `${dateTarget.getFullYear()}-${String(dateTarget.getMonth() + 1).padStart(2, '0')}`
      const label = dateTarget.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      list.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1) })
    }
    return list
  }, [])

  // Liste dynamique des opérateurs de transfert présents dans les données
  const operateursPresents = useMemo(() => {
    const ops = new Set<string>()
    operationsRaw
      .filter((op) => op.type_activite === 'TRANSFERT' && op.compagnie_fournisseur)
      .forEach((op) => ops.add(op.compagnie_fournisseur!))
    return Array.from(ops)
  }, [operationsRaw])

  // ─── Filtrage Dynamique ───────────────────────────────────────────────────

  const operationsFiltrees = useMemo(() => {
    return operationsRaw.filter((op) => {
      const opDate = new Date(op.created_at)
      if (isNaN(opDate.getTime())) return false

      // 1. Filtrage Temporel
      if (filterPeriodType === 'MOIS') {
        const opMonthKey = `${opDate.getFullYear()}-${String(opDate.getMonth() + 1).padStart(2, '0')}`
        if (opMonthKey !== selectedMonth) return false
      } else if (filterPeriodType === 'ANNEE') {
        if (String(opDate.getFullYear()) !== selectedYear) return false
      }

      // 2. Filtrage Catégorie
      if (selectedCategory !== 'TOUT' && op.type_activite !== selectedCategory) {
        return false
      }

      // 3. Sous-filtres spécifiques aux Transferts d'argent
      if (selectedCategory === 'TRANSFERT') {
        if (transfertOperateur !== 'TOUS' && op.compagnie_fournisseur !== transfertOperateur) {
          return false
        }

        if (transfertSens !== 'TOUS') {
          const desc = (op.description || '').toLowerCase()
          const isRetrait = desc.includes('retrait')
          if (transfertSens === 'RETRAIT' && !isRetrait) return false
          if (transfertSens === 'DEPOT' && isRetrait) return false
        }
      }

      // 4. Statut de paiement
      if (statusFilter !== 'TOUS' && op.statut_paiement !== statusFilter) {
        return false
      }

      // 5. Recherche textuelle
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchClient = op.client_nom?.toLowerCase().includes(q)
        const matchCompagnie = op.compagnie_fournisseur?.toLowerCase().includes(q)
        const matchRef = op.reference_document?.toLowerCase().includes(q)
        const matchTel = op.client_telephone?.toLowerCase().includes(q)
        if (!matchClient && !matchCompagnie && !matchRef && !matchTel) return false
      }

      return true
    })
  }, [
    operationsRaw, filterPeriodType, selectedMonth, selectedYear,
    selectedCategory, transfertOperateur, transfertSens, statusFilter, searchQuery
  ])

  // ─── Statistiques Financières de la Sélection ──────────────────────────────

  const stats = useMemo(() => {
    let ca = 0
    let gain = 0
    let encaisse = 0
    let dette = 0

    operationsFiltrees.forEach((op) => {
      const vente = Number(op.prix_vente) || 0
      const verse = Number(op.montant_verse) || 0
      const ben = Number(op.benefice) || 0

      ca += vente
      gain += ben
      encaisse += verse
      if (op.statut_paiement === 'AVANCE' || op.statut_paiement === 'NON_PAYE') {
        dette += Math.max(0, vente - verse)
      }
    })

    return { ca, gain, encaisse, dette, totalOps: operationsFiltrees.length }
  }, [operationsFiltrees])

  // Compteurs par catégorie selon la période temporelle choisie
  const countsByCategory = useMemo(() => {
    const map: Record<string, number> = { TOUT: 0 }
    operationsRaw.forEach((op) => {
      const opDate = new Date(op.created_at)
      if (filterPeriodType === 'MOIS') {
        const opMonthKey = `${opDate.getFullYear()}-${String(opDate.getMonth() + 1).padStart(2, '0')}`
        if (opMonthKey !== selectedMonth) return
      } else if (filterPeriodType === 'ANNEE') {
        if (String(opDate.getFullYear()) !== selectedYear) return
      }
      map.TOUT = (map.TOUT || 0) + 1
      map[op.type_activite] = (map[op.type_activite] || 0) + 1
    })
    return map
  }, [operationsRaw, filterPeriodType, selectedMonth, selectedYear])

  return (
    <div className={`min-h-screen pb-16 transition-colors duration-150 ${
      isDark ? 'bg-[#000000] text-[#F5F5F7]' : 'bg-slate-50/50 text-slate-800'
    }`}>
      
      {/* ─── BARRE SUPÉRIEURE ─── */}
      <div className={`sticky top-0 z-30 backdrop-blur-md border-b px-4 lg:px-8 py-3 transition-colors ${
        isDark ? 'bg-[#161618]/90 border-[#2C2C2E]' : 'bg-white/90 border-slate-200/80'
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link 
              href="/agence/dashboard"
              className={`p-1.5 rounded-lg transition-colors flex items-center ${
                isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#2C2C2E]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className={`text-sm sm:text-base font-bold tracking-tight leading-tight ${
                isDark ? 'text-[#F5F5F7]' : 'text-slate-900'
              }`}>
                Journal des Ventes & Opérations
              </h1>
              <p className={`text-[11px] hidden sm:block ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>
                Historique comptable et ventilation des flux
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* 🌓 Bouton Mode Sombre : masqué sur mobile */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                isDark 
                  ? 'bg-[#2C2C2E] border-[#38383A] text-[#FFD60A] hover:bg-[#3A3A3C]' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-xs'
              }`}
              title={isDark ? 'Basculer en mode clair' : 'Basculer en mode sombre'}
            >
              {isDark ? <Sun size={14} className="text-[#FFD60A]" /> : <Moon size={14} className="text-slate-600" />}
              <span>{isDark ? 'Mode clair' : 'Mode sombre'}</span>
            </button>

            <Link
              href="/agence/nouvelle-operation"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                isDark ? 'bg-[#FFFFFF] hover:bg-[#E5E5EA] text-[#000000]' : 'bg-slate-900 hover:bg-black text-white'
              }`}
            >
              <Plus size={15} />
              <span>Nouvelle Vente</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 sm:py-5 space-y-4">

        {/* ─── SÉLECTION DE PÉRIODE ─── */}
        <div className={`p-3.5 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition-colors ${
          isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/80'
        }`}>
          
          <div className={`flex items-center gap-1.5 p-1 rounded-xl w-full sm:w-auto ${
            isDark ? 'bg-[#2C2C2E]' : 'bg-slate-100'
          }`}>
            <button
              onClick={() => setFilterPeriodType('MOIS')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterPeriodType === 'MOIS' 
                  ? (isDark ? 'bg-[#1C1C1E] text-[#F5F5F7] shadow-xs' : 'bg-white text-slate-900 shadow-xs') 
                  : (isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7]' : 'text-slate-600 hover:text-slate-900')
              }`}
            >
              Mois
            </button>
            <button
              onClick={() => setFilterPeriodType('ANNEE')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterPeriodType === 'ANNEE' 
                  ? (isDark ? 'bg-[#1C1C1E] text-[#F5F5F7] shadow-xs' : 'bg-white text-slate-900 shadow-xs') 
                  : (isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7]' : 'text-slate-600 hover:text-slate-900')
              }`}
            >
              Année
            </button>
            <button
              onClick={() => setFilterPeriodType('TOUT')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterPeriodType === 'TOUT' 
                  ? (isDark ? 'bg-[#1C1C1E] text-[#F5F5F7] shadow-xs' : 'bg-white text-slate-900 shadow-xs') 
                  : (isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7]' : 'text-slate-600 hover:text-slate-900')
              }`}
            >
              Tout afficher
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {filterPeriodType === 'MOIS' && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Calendar size={15} className={`shrink-0 ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`} />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className={`flex-1 sm:flex-none p-1.5 border rounded-xl text-xs font-bold outline-none ${
                    isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  {optionsMois.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label} {m.key === currentMonthKey ? '(Mois en cours)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {filterPeriodType === 'ANNEE' && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Calendar size={15} className={`shrink-0 ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`} />
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className={`p-1.5 border rounded-xl text-xs font-bold outline-none ${
                    isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  {anneesDisponibles.map((y) => (
                    <option key={y} value={y}>
                      Année {y} {y === currentYearKey ? '(En cours)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ─── BLOCS INDICATEURS FINANCIERS FLAT ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className={`p-3.5 rounded-xl border transition-colors ${
            isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/80'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block mb-0.5 ${
              isDark ? 'text-[#8E8E93]' : 'text-slate-400'
            }`}>Chiffre d'Affaires</span>
            <div className={`text-base sm:text-xl font-extrabold ${
              isDark ? 'text-[#F5F5F7]' : 'text-slate-900'
            }`}>{stats.ca.toLocaleString('fr-FR')} CFA</div>
            <span className={`text-[10px] font-medium block ${
              isDark ? 'text-[#8E8E93]' : 'text-slate-500'
            }`}>{stats.totalOps} transaction(s)</span>
          </div>

          <div className={`p-3.5 rounded-xl border transition-colors ${
            isDark ? 'bg-[#1C1C1E] border-[#34C759]/30' : 'bg-white border-slate-200/80'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block mb-0.5 ${
              isDark ? 'text-[#34C759]' : 'text-emerald-600'
            }`}>Bénéfice Net Agence</span>
            <div className={`text-base sm:text-xl font-extrabold ${
              isDark ? 'text-[#34C759]' : 'text-emerald-600'
            }`}>{stats.gain.toLocaleString('fr-FR')} CFA</div>
            <span className={`text-[10px] font-semibold block ${
              isDark ? 'text-[#30D158]' : 'text-emerald-700/80'
            }`}>
              {stats.ca > 0 ? `${((stats.gain / stats.ca) * 100).toFixed(1)}% marge` : '0% marge'}
            </span>
          </div>

          <div className={`p-3.5 rounded-xl border transition-colors ${
            isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/80'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block mb-0.5 ${
              isDark ? 'text-[#8E8E93]' : 'text-slate-400'
            }`}>Encaissé Réel</span>
            <div className={`text-base sm:text-xl font-extrabold ${
              isDark ? 'text-[#F5F5F7]' : 'text-slate-900'
            }`}>{stats.encaisse.toLocaleString('fr-FR')} CFA</div>
            <span className={`text-[10px] font-medium block ${
              isDark ? 'text-[#8E8E93]' : 'text-slate-400'
            }`}>Espèces & Mobile</span>
          </div>

          <div className={`p-3.5 rounded-xl border transition-colors ${
            isDark ? 'bg-[#1C1C1E] border-[#FF9F0A]/30' : 'bg-white border-slate-200/80'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider block mb-0.5 ${
              isDark ? 'text-[#FF9F0A]' : 'text-amber-600'
            }`}>Créances / Dettes</span>
            <div className={`text-base sm:text-xl font-extrabold ${
              isDark ? 'text-[#FFD60A]' : 'text-amber-700'
            }`}>{stats.dette.toLocaleString('fr-FR')} CFA</div>
            <span className={`text-[10px] font-semibold block ${
              isDark ? 'text-[#FF9F0A]' : 'text-amber-600/80'
            }`}>À recouvrer</span>
          </div>
        </div>

        {/* ─── FILTRAGE DES CATÉGORIES PRINCIPALES ─── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const count = countsByCategory[cat.id] || 0
            const isSelected = selectedCategory === cat.id

            return (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id)
                  if (cat.id !== 'TRANSFERT') {
                    setTransfertOperateur('TOUS')
                    setTransfertSens('TOUS')
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
                  isSelected
                    ? (isDark ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF]' : 'bg-slate-900 text-white border-slate-900')
                    : (isDark ? 'bg-[#1C1C1E] text-[#8E8E93] border-[#2C2C2E] hover:text-[#F5F5F7]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
                }`}
              >
                <Icon size={13} className={isSelected ? (isDark ? 'text-[#000000]' : 'text-white') : (isDark ? 'text-[#8E8E93]' : 'text-slate-400')} />
                <span>{cat.label}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                  isSelected 
                    ? (isDark ? 'bg-black/20 text-[#000000]' : 'bg-white/20 text-white') 
                    : (isDark ? 'bg-[#2C2C2E] text-[#D1D1D6]' : 'bg-slate-100 text-slate-500')
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* ─── SOUS-SECTION DÉDIÉE : FILTRES TRANSFERT D'ARGENT ─── */}
        {selectedCategory === 'TRANSFERT' && (
          <div className={`p-3 rounded-xl border space-y-2.5 transition-colors ${
            isDark ? 'bg-[#1C1C1E] border-[#34C759]/30' : 'bg-white border-emerald-200/80'
          }`}>
            <div className={`flex flex-wrap items-center justify-between gap-2 border-b pb-2 ${
              isDark ? 'border-[#2C2C2E]' : 'border-slate-100'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isDark ? 'text-[#34C759]' : 'text-emerald-900'
              }`}>
                <Smartphone size={13} className={isDark ? 'text-[#34C759]' : 'text-emerald-600'} />
                Filtrer les transferts d'argent
              </span>

              {/* Sélecteur Sens : Dépôt ou Retrait */}
              <div className={`flex items-center gap-1 p-0.5 rounded-lg text-[11px] font-bold ${
                isDark ? 'bg-[#2C2C2E]' : 'bg-slate-100'
              }`}>
                <button
                  onClick={() => setTransfertSens('TOUS')}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    transfertSens === 'TOUS' 
                      ? (isDark ? 'bg-[#1C1C1E] text-[#F5F5F7] shadow-xs' : 'bg-white text-slate-900 shadow-xs') 
                      : (isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7]' : 'text-slate-500 hover:text-slate-800')
                  }`}
                >
                  Tous flux
                </button>
                <button
                  onClick={() => setTransfertSens('DEPOT')}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    transfertSens === 'DEPOT' 
                      ? (isDark ? 'bg-[#1C1C1E] text-[#34C759] shadow-xs' : 'bg-white text-emerald-800 shadow-xs') 
                      : (isDark ? 'text-[#8E8E93] hover:text-[#34C759]' : 'text-slate-500 hover:text-slate-800')
                  }`}
                >
                  ↗ Dépôts / Envois
                </button>
                <button
                  onClick={() => setTransfertSens('RETRAIT')}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    transfertSens === 'RETRAIT' 
                      ? (isDark ? 'bg-[#1C1C1E] text-[#0A84FF] shadow-xs' : 'bg-white text-blue-800 shadow-xs') 
                      : (isDark ? 'text-[#8E8E93] hover:text-[#0A84FF]' : 'text-slate-500 hover:text-slate-800')
                  }`}
                >
                  ↙ Retraits
                </button>
              </div>
            </div>

            {/* Boutons rapides par Opérateur */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                onClick={() => setTransfertOperateur('TOUS')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors border cursor-pointer ${
                  transfertOperateur === 'TOUS'
                    ? (isDark ? 'bg-[#34C759] text-black border-[#34C759] font-bold' : 'bg-emerald-600 text-white border-emerald-600')
                    : (isDark ? 'bg-[#2C2C2E] text-[#8E8E93] border-[#38383A] hover:bg-[#3A3A3C]' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100')
                }`}
              >
                Tous opérateurs
              </button>

              {operateursPresents.map((opNom) => {
                const isOpSelected = transfertOperateur === opNom
                return (
                  <button
                    key={opNom}
                    onClick={() => setTransfertOperateur(opNom)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors border cursor-pointer ${
                      isOpSelected
                        ? (isDark ? 'bg-[#34C759] text-black border-[#34C759] font-bold' : 'bg-emerald-600 text-white border-emerald-600')
                        : (isDark ? 'bg-[#2C2C2E] text-[#D1D1D6] border-[#38383A] hover:bg-[#3A3A3C]' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100')
                    }`}
                  >
                    {opNom}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── BARRE DE RECHERCHE & STATUT ─── */}
        <div className={`p-2.5 rounded-2xl border flex flex-col sm:flex-row items-center gap-2 transition-colors ${
          isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/80'
        }`}>
          <div className="relative flex-1 w-full">
            <Search size={14} className={`absolute left-3 top-2.5 ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`} />
            <input
              type="text"
              placeholder="Rechercher par client, tél, n° référence, opérateur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 rounded-xl text-xs font-medium outline-none border transition-colors ${
                isDark 
                  ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7] placeholder:text-[#636366] focus:border-[#545458]' 
                  : 'bg-slate-50 border-transparent focus:border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`w-full sm:w-auto p-1.5 border rounded-xl text-xs font-semibold outline-none transition-colors ${
                isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <option value="TOUS">Tous les statuts</option>
              <option value="PAYE">Payés intégralement</option>
              <option value="AVANCE">Avances en cours</option>
              <option value="NON_PAYE">Dettes / Non payés</option>
            </select>
          </div>
        </div>

        {/* ─── TABLEAU DES OPÉRATIONS (DESKTOP) & LISTE MOBILE ─── */}
        <div className={`rounded-2xl border overflow-hidden transition-colors ${
          isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/80'
        }`}>
          {operationsFiltrees.length === 0 ? (
            <div className="p-10 text-center">
              <FileText size={28} className={`mx-auto mb-2 ${isDark ? 'text-[#38383A]' : 'text-slate-300'}`} />
              <p className={`text-xs font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-700'}`}>Aucune opération trouvée</p>
              <p className={`text-[11px] mt-0.5 ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>Modifiez vos filtres de période ou de catégorie.</p>
            </div>
          ) : (
            <>
              {/* VUE TABLEAU (Grand Écran) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className={`border-b font-bold uppercase tracking-wider text-[10px] ${
                      isDark ? 'border-[#2C2C2E] bg-[#121214] text-[#8E8E93]' : 'border-slate-100 bg-slate-50/50 text-slate-400'
                    }`}>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Service</th>
                      <th className="py-2.5 px-4">Client</th>
                      <th className="py-2.5 px-4">Opérateur / Détail</th>
                      <th className="py-2.5 px-4 text-right">Montant Total</th>
                      <th className="py-2.5 px-4 text-right">Gain Net</th>
                      <th className="py-2.5 px-4 text-center">Statut</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${
                    isDark ? 'divide-[#2C2C2E] text-[#F5F5F7]' : 'divide-slate-100 text-slate-800'
                  }`}>
                    {operationsFiltrees.map((op) => {
                      const dateObj = new Date(op.created_at)
                      const isPaye = op.statut_paiement === 'PAYE'
                      const isAvance = op.statut_paiement === 'AVANCE'
                      const detteLigne = Math.max(0, (op.prix_vente || 0) - (op.montant_verse || 0))
                      const isTransfert = op.type_activite === 'TRANSFERT'
                      const desc = (op.description || '').toLowerCase()
                      const isRetrait = desc.includes('retrait')

                      return (
                        <tr key={op.id} className={`transition-colors ${
                          isDark ? 'hover:bg-[#2C2C2E]/40' : 'hover:bg-slate-50/60'
                        }`}>
                          <td className={`py-2.5 px-4 whitespace-nowrap text-[11px] ${
                            isDark ? 'text-[#8E8E93]' : 'text-slate-500'
                          }`}>
                            {dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} &bull; {dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className={`font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>{op.type_activite}</span>
                            {isTransfert && (
                              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                isRetrait 
                                  ? (isDark ? 'bg-[#0A84FF]/20 text-[#0A84FF]' : 'bg-blue-50 text-blue-700')
                                  : (isDark ? 'bg-[#34C759]/20 text-[#34C759]' : 'bg-emerald-50 text-emerald-700')
                              }`}>
                                {isRetrait ? 'Retrait' : 'Dépôt'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className={`font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>{op.client_nom || 'Client Comptoir'}</div>
                            {op.client_telephone && <div className={`text-[10px] ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>{op.client_telephone}</div>}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className={`font-semibold ${isDark ? 'text-[#D1D1D6]' : 'text-slate-700'}`}>{op.compagnie_fournisseur || '—'}</div>
                            {op.reference_document && <div className={`text-[10px] truncate max-w-[150px] ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>{op.reference_document}</div>}
                          </td>
                          <td className={`py-2.5 px-4 text-right whitespace-nowrap font-bold ${
                            isDark ? 'text-[#F5F5F7]' : 'text-slate-900'
                          }`}>
                            {Number(op.prix_vente).toLocaleString('fr-FR')} CFA
                          </td>
                          <td className={`py-2.5 px-4 text-right whitespace-nowrap font-bold ${
                            isDark ? 'text-[#34C759]' : 'text-emerald-600'
                          }`}>
                            +{Number(op.benefice).toLocaleString('fr-FR')} CFA
                          </td>
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            {isPaye && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isDark 
                                  ? 'bg-[#34C759]/15 text-[#34C759] border-[#34C759]/30' 
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              }`}>
                                Payé
                              </span>
                            )}
                            {isAvance && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isDark 
                                  ? 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30' 
                                  : 'bg-amber-50 text-amber-800 border-amber-100'
                              }`}>
                                Avance (-{detteLigne.toLocaleString('fr-FR')})
                              </span>
                            )}
                            {!isPaye && !isAvance && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isDark 
                                  ? 'bg-[#FF453A]/15 text-[#FF453A] border-[#FF453A]/30' 
                                  : 'bg-red-50 text-red-700 border-red-100'
                              }`}>
                                Dette
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* VUE MOBILE FLUIDE */}
              <div className={`md:hidden divide-y ${
                isDark ? 'divide-[#2C2C2E]' : 'divide-slate-100'
              }`}>
                {operationsFiltrees.map((op) => {
                  const dateObj = new Date(op.created_at)
                  const detteLigne = Math.max(0, (op.prix_vente || 0) - (op.montant_verse || 0))
                  const isTransfert = op.type_activite === 'TRANSFERT'
                  const desc = (op.description || '').toLowerCase()
                  const isRetrait = desc.includes('retrait')

                  return (
                    <div key={op.id} className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            isDark ? 'text-[#8E8E93]' : 'text-slate-400'
                          }`}>
                            {op.type_activite}
                          </span>
                          {isTransfert && (
                            <span className={`px-1 rounded text-[9px] font-bold ${
                              isRetrait 
                                ? (isDark ? 'bg-[#0A84FF]/20 text-[#0A84FF]' : 'bg-blue-50 text-blue-700')
                                : (isDark ? 'bg-[#34C759]/20 text-[#34C759]' : 'bg-emerald-50 text-emerald-700')
                            }`}>
                              {isRetrait ? 'Retrait' : 'Dépôt'}
                            </span>
                          )}
                          <span className={`text-[10px] ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>
                            &bull; {dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>

                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                          op.statut_paiement === 'PAYE'
                            ? (isDark ? 'bg-[#34C759]/15 text-[#34C759]' : 'bg-emerald-50 text-emerald-700')
                            : op.statut_paiement === 'AVANCE'
                            ? (isDark ? 'bg-[#FF9F0A]/15 text-[#FF9F0A]' : 'bg-amber-50 text-amber-800')
                            : (isDark ? 'bg-[#FF453A]/15 text-[#FF453A]' : 'bg-red-50 text-red-700')
                        }`}>
                          {op.statut_paiement === 'PAYE' ? 'Payé' : op.statut_paiement === 'AVANCE' ? 'Avance' : 'Dette'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className={`text-xs font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>{op.client_nom || 'Client Comptoir'}</div>
                          <div className={`text-[11px] ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>{op.compagnie_fournisseur || '—'}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xs font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>{Number(op.prix_vente).toLocaleString('fr-FR')} CFA</div>
                          <div className={`text-[10px] font-semibold ${isDark ? 'text-[#34C759]' : 'text-emerald-600'}`}>+{Number(op.benefice).toLocaleString('fr-FR')} CFA</div>
                        </div>
                      </div>

                      {op.statut_paiement === 'AVANCE' && detteLigne > 0 && (
                        <div className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          isDark ? 'bg-[#FF9F0A]/15 text-[#FF9F0A]' : 'bg-amber-50/60 text-amber-700'
                        }`}>
                          Reste dû : {detteLigne.toLocaleString('fr-FR')} CFA
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}