'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { usePowerSync, useQuery } from '@powersync/react'
import { supabase, getUser } from '../../../lib/supabase'
import { useYear } from '@/lib/YearContext'
import { YearSelector } from '@/components/YearSelector'
import {
  ArrowLeft, TrendingUp, Wallet, PieChart,
  AlertCircle, CreditCard, RefreshCw, BarChart2,
  Plus, Trash2, Archive, X,
  TrendingDown, DollarSign, ShieldCheck, FileText, Info,
  ArrowRightLeft, Plane, Globe, Hotel, Bus, Receipt, Package,
  Target, Moon, Sun
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceStats {
  ventes: number
  achats: number
  fraisAnnexes: number
  benefice: number
  montantVerse: number
  dette: number
  count: number
}

interface Stats {
  totalVentes: number
  totalAchats: number
  totalFraisAnnexes: number
  totalBenefice: number
  totalMontantVerse: number
  totalCreances: number
  count: number
  parType: { [k: string]: ServiceStats }
  parModePaiement: { [k: string]: number }
}

interface Depense {
  id: string
  agence_id: string
  libelle: string
  categorie: string
  montant: number
  mode_paiement: string
  date_depense: string
  notes?: string
  created_at: string
}

interface DepenseSupprimee extends Depense {
  depense_id: string
  supprime_le: string
}

interface BudgetPosteBD {
  id: string
  agence_id: string
  categorie_id: string
  label: string
  couleur: string
  montant_plafond: number
  periode_type: string
}

// ─── Catégories par défaut ───────────────────────────────────────────────────

const BUDGETS_DEFAUT = [
  { categorie_id: 'LOYER', label: 'Loyer / Local', couleur: '#6366f1', montant_plafond: 250000 },
  { categorie_id: 'SALAIRES', label: 'Salaires & Personnel', couleur: '#ec4899', montant_plafond: 500000 },
  { categorie_id: 'MARKETING', label: 'Publicité & Marketing', couleur: '#f59e0b', montant_plafond: 100000 },
  { categorie_id: 'COMMUNICATION', label: 'Internet / Téléphone', couleur: '#8b5cf6', montant_plafond: 50000 },
  { categorie_id: 'FOURNITURES', label: 'Fournitures & Papiers', couleur: '#3b82f6', montant_plafond: 40000 },
  { categorie_id: 'TRANSPORT', label: 'Déplacements & Carburant', couleur: '#f97316', montant_plafond: 60000 },
  { categorie_id: 'IMPOTS', label: 'Impôts, Taxes & Licences', couleur: '#ef4444', montant_plafond: 150000 },
  { categorie_id: 'AUTRES', label: 'Autres charges courantes', couleur: '#8E8E93', montant_plafond: 50000 },
]

const MODES = [
  { id: 'ESPECES', label: 'Espèces (Caisse)' },
  { id: 'ORANGE_MONEY', label: 'Orange Money' },
  { id: 'WAVE', label: 'Wave Mali' },
  { id: 'MOOV_MONEY', label: 'Moov Money' },
  { id: 'VIREMENT', label: 'Compte Bancaire' },
]

const SERVICE_ICONS: Record<string, React.ElementType> = {
  TRANSFERT: ArrowRightLeft,
  BILLET: Plane,
  VISA: Globe,
  HOTEL: Hotel,
  TRANSPORT: Bus,
  ASSURANCE: Receipt,
  PACKAGE: Package,
}

const fmt = (n: number) => n.toLocaleString('fr-FR')

function useAgenceId() {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const m = user.user_metadata?.agence_id ?? user.app_metadata?.agence_id
      if (m) {
        setId(m)
        return
      }
      const { data } = await supabase.from('profiles').select('agence_id').eq('id', user.id).single()
      if (data?.agence_id) setId(data.agence_id)
    })
  }, [])
  return id
}

// ─── StatCard Adaptative Mobile & Desktop ─────────────────────────────────────

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  unit = 'F',
  sub,
  subValue,
  highlight,
  isDark = false
}: {
  icon: React.ElementType
  iconColor: string
  label: string
  value: string | number
  unit?: string
  sub?: string
  subValue?: string
  highlight?: 'emerald' | 'amber' | 'rose' | 'violet'
  isDark?: boolean
}) {
  const highlights: Record<string, string> = {
    emerald: isDark ? 'text-[#34C759]' : 'text-emerald-700',
    amber: isDark ? 'text-[#FF9F0A]' : 'text-amber-700',
    rose: isDark ? 'text-[#FF453A]' : 'text-rose-700',
    violet: isDark ? 'text-[#BF5AF2]' : 'text-violet-700',
  }
  const valueColor = highlight ? highlights[highlight] : (isDark ? 'text-[#F5F5F7]' : 'text-slate-800')

  return (
    <div className={`border rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col justify-between gap-2 sm:gap-3 transition-colors ${
      isDark 
        ? 'bg-[#1C1C1E] border-[#2C2C2E] shadow-none' 
        : 'bg-[#FFFFFF]/90 border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.03)]'
    }`}>
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider truncate ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>{label}</span>
        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconColor + (isDark ? '25' : '15') }}>
          <Icon size={13} style={{ color: iconColor }} />
        </div>
      </div>
      <div>
        <span className={`text-base sm:text-2xl font-bold tracking-tight truncate block ${valueColor}`}>
          {typeof value === 'number' ? fmt(value) : value}
          {unit && <span className={`text-[10px] sm:text-xs font-semibold ml-1 ${isDark ? 'text-[#636366]' : 'text-slate-400'}`}>{unit}</span>}
        </span>
      </div>
      {sub && (
        <div className={`flex items-center justify-between border-t pt-1.5 sm:pt-2 text-[10px] sm:text-[11px] ${isDark ? 'border-[#2C2C2E]' : 'border-slate-100/90'}`}>
          <span className={`truncate ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>{sub}</span>
          <span className={`font-semibold shrink-0 ml-1 ${isDark ? 'text-[#D1D1D6]' : 'text-slate-700'}`}>{subValue}</span>
        </div>
      )}
    </div>
  )
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

function Section({ icon: Icon, iconColor = '#64748b', title, subtitle, action, children, isDark = false }: {
  icon: React.ElementType; iconColor?: string; title: string; subtitle?: string
  action?: React.ReactNode; children: React.ReactNode; isDark?: boolean
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconColor + (isDark ? '25' : '15') }}>
            <Icon size={14} style={{ color: iconColor }} />
          </div>
          <div className="min-w-0">
            <h2 className={`text-xs sm:text-sm font-bold uppercase tracking-wider truncate leading-none ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{title}</h2>
            {subtitle && <p className={`text-[10px] font-medium truncate mt-0.5 ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

// ─── Modal Formulaire Dépense ────────────────────────────────────────────────

function FormDepense({
  agenceId,
  categoriesDisponibles,
  isDark,
  onAdded,
  onClose
}: {
  agenceId: string
  categoriesDisponibles: { id: string; label: string; color: string }[]
  isDark: boolean
  onAdded: () => void
  onClose: () => void
}) {
  const db = usePowerSync()
  const [libelle, setLibelle] = useState('')
  const [categorie, setCategorie] = useState(categoriesDisponibles[0]?.id || 'AUTRES')
  const [montant, setMontant] = useState('')
  const [montantFmt, setMontantFmt] = useState('')
  const [mode, setMode] = useState('ESPECES')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const onMontant = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, '')
    setMontant(d)
    setMontantFmt(d ? new Intl.NumberFormat('fr-FR').format(+d) : '')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!libelle.trim() || !montant || +montant <= 0) { 
      setError('Libellé et montant requis.')
      return 
    }
    setSaving(true)
    setError('')
    try {
      await db.execute(
        `INSERT INTO depenses (id, agence_id, libelle, categorie, montant, mode_paiement, date_depense, notes, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), agenceId, libelle.trim(), categorie, +montant, mode, date, notes.trim() || null, new Date().toISOString()]
      )
      onAdded()
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’enregistrement')
    }
    setSaving(false)
  }

  const inp = `w-full px-3 py-2.5 rounded-xl outline-none font-semibold text-xs transition-colors border ${
    isDark
      ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7] placeholder:text-[#636366] focus:border-[#545458]'
      : 'bg-slate-50/70 border-slate-200 text-slate-800 focus:border-slate-700 focus:bg-white'
  }`
  const lbl = `block text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4" onClick={onClose}>
      <div className={`w-full max-w-lg rounded-t-3xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden max-h-[92vh] ${
        isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200'
      }`} onClick={e => e.stopPropagation()}>
        
        <div className={`flex items-center justify-between px-4 sm:px-5 py-3.5 border-b ${isDark ? 'border-[#2C2C2E]' : 'border-slate-100'}`}>
          <div>
            <h2 className={`font-bold text-sm ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>Nouvelle charge / Dépense</h2>
            <p className="text-[10px] text-slate-400">Charge de fonctionnement</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>
        
        <div className="overflow-y-auto p-4 sm:p-5 space-y-3.5">
          <form onSubmit={submit} id="depense-form" className="space-y-3.5">
            {error && <p className="text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-lg font-semibold border border-rose-500/20">{error}</p>}

            <div>
              <label className={lbl}>Libellé *</label>
              <input required className={inp} placeholder="" value={libelle} onChange={e => setLibelle(e.target.value)} />
            </div>

            <div>
              <label className={lbl}>Poste Budgétaire / Catégorie</label>
              <div className={`grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-32 sm:max-h-36 overflow-y-auto p-1 border rounded-xl ${
                isDark ? 'border-[#2C2C2E] bg-[#161618]' : 'border-slate-100'
              }`}>
                {categoriesDisponibles.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategorie(c.id)}
                    className={`py-2 px-2 rounded-lg text-[10px] font-semibold border transition-colors truncate ${
                      categorie === c.id 
                        ? 'text-white border-transparent' 
                        : isDark 
                        ? 'bg-[#2C2C2E] border-[#38383A] text-[#D1D1D6]' 
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                    style={categorie === c.id ? { background: c.color, borderColor: c.color } : {}}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className={lbl}>Montant (CFA) *</label>
                <input type="text" inputMode="numeric" required className={inp} placeholder="" value={montantFmt} onChange={onMontant} />
              </div>
              <div>
                <label className={lbl}>Date</label>
                <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>

            <div>
              <label className={lbl}>Mode de paiement</label>
              <div className="grid grid-cols-2 gap-1.5">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      mode === m.id 
                        ? isDark ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF]' : 'bg-slate-800 text-white border-slate-800' 
                        : isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#D1D1D6]' : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={lbl}>Notes (Optionnel)</label>
              <textarea rows={2} className={`${inp} resize-none`} placeholder="" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </form>
        </div>

        <div className={`p-3.5 sm:p-4 border-t ${isDark ? 'border-[#2C2C2E] bg-[#161618]' : 'border-slate-100 bg-[#FAFBFD]'}`}>
          <button
            type="submit"
            form="depense-form"
            disabled={saving}
            className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors disabled:opacity-40 cursor-pointer ${
              isDark ? 'bg-[#FFFFFF] hover:bg-[#E5E5EA] text-[#000000]' : 'bg-slate-800 hover:bg-slate-900 text-white'
            }`}
          >
            {saving ? 'Enregistrement…' : <><Plus size={14} /> Enregistrer la dépense</>}
          </button>
        </div>

      </div>
    </div>
  )
}

// ─── Modal Définition Budget Modulable ────────────────────────────────────────

function FormBudgetModulable({
  agenceId,
  budgetsActuels,
  isDark,
  onClose
}: {
  agenceId: string
  budgetsActuels: BudgetPosteBD[]
  isDark: boolean
  onClose: () => void
}) {
  const db = usePowerSync()
  const [localList, setLocalList] = useState<BudgetPosteBD[]>(budgetsActuels)
  const [nouveauLabel, setNouveauLabel] = useState('')
  const [nouveauPlafond, setNouveauPlafond] = useState('')
  const [nouvelleCouleur, setNouvelleCouleur] = useState('#6366f1')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLocalList(budgetsActuels)
  }, [budgetsActuels])

  const handlePlafondChange = (id: string, valStr: string) => {
    const num = parseInt(valStr.replace(/\D/g, ''), 10) || 0
    setLocalList(prev => prev.map(b => b.id === id ? { ...b, montant_plafond: num } : b))
  }

  const handleAjouterPoste = async () => {
    if (!nouveauLabel.trim()) return
    const montant = parseInt(nouveauPlafond.replace(/\D/g, ''), 10) || 0
    const catId = nouveauLabel.trim().toUpperCase().replace(/\s+/g, '_')
    const newId = crypto.randomUUID()

    try {
      await db.execute(
        `INSERT INTO budgets_agence (id, agence_id, categorie_id, label, couleur, montant_plafond, periode_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, agenceId, catId, nouveauLabel.trim(), nouvelleCouleur, montant, 'MOIS', new Date().toISOString(), new Date().toISOString()]
      )
      setNouveauLabel('')
      setNouveauPlafond('')
    } catch (e: any) {
      alert("Erreur lors de l'ajout en base : " + e?.message)
    }
  }

  const handleSupprimerPoste = async (id: string, label: string) => {
    if (!confirm(`Supprimer le poste budgétaire "${label}" de votre base de données ?`)) return
    try {
      await db.execute(`DELETE FROM budgets_agence WHERE id = ? AND agence_id = ?`, [id, agenceId])
    } catch (e: any) {
      alert("Erreur lors de la suppression : " + e?.message)
    }
  }

  const handleSauvegarderPlafonds = async () => {
    setSaving(true)
    try {
      for (const item of localList) {
        await db.execute(
          `UPDATE budgets_agence SET montant_plafond = ?, updated_at = ? WHERE id = ?`,
          [item.montant_plafond, new Date().toISOString(), item.id]
        )
      }
      onClose()
    } catch (e: any) {
      alert("Erreur de synchronisation base : " + e?.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4" onClick={onClose}>
      <div className={`w-full max-w-2xl rounded-t-3xl sm:rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
        isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200'
      }`} onClick={e => e.stopPropagation()}>
        
        <div className={`flex items-center justify-between px-4 sm:px-5 py-3.5 border-b ${isDark ? 'border-[#2C2C2E]' : 'border-slate-100'}`}>
          <div>
            <h2 className={`font-bold text-sm ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>Gestion des Budgets & Postes</h2>
            <p className="text-[10px] text-slate-400">Plafonds mensuels alloués</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        <div className={`overflow-y-auto p-4 sm:p-5 space-y-4 flex-1 ${isDark ? 'bg-[#121214]' : 'bg-[#FAFBFD]'}`}>
          <div className={`p-3 border rounded-xl space-y-2.5 ${isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200'}`}>
            <span className={`text-[11px] font-bold block uppercase tracking-wider ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>
              + Ajouter un poste personnalisé
            </span>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                placeholder="Nom du poste (Ex: Climatisation...)"
                value={nouveauLabel}
                onChange={e => setNouveauLabel(e.target.value)}
                className={`flex-1 p-2 text-xs font-semibold rounded-lg border outline-none ${
                  isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7] placeholder:text-[#636366]' : 'bg-slate-50/70 border-slate-200 text-slate-800'
                }`}
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Plafond CFA"
                  value={nouveauPlafond}
                  onChange={e => setNouveauPlafond(e.target.value)}
                  className={`flex-1 sm:w-28 p-2 text-xs font-semibold rounded-lg border outline-none text-right ${
                    isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' : 'bg-slate-50/70 border-slate-200 text-slate-800'
                  }`}
                />
                <input
                  type="color"
                  value={nouvelleCouleur}
                  onChange={e => setNouvelleCouleur(e.target.value)}
                  className="w-8 h-8 rounded border border-slate-700 cursor-pointer p-0.5 bg-transparent shrink-0"
                />
                <button
                  type="button"
                  onClick={handleAjouterPoste}
                  className={`px-3 py-2 rounded-lg text-xs font-bold shrink-0 transition-colors ${
                    isDark ? 'bg-[#FFFFFF] text-[#000000]' : 'bg-slate-800 text-white'
                  }`}
                >
                  Ajouter
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>
              Postes actifs ({localList.length}) :
            </span>

            {localList.map((item) => (
              <div key={item.id} className={`flex items-center justify-between gap-2 p-2.5 border rounded-xl transition-colors ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.couleur || '#64748b' }} />
                  <span className={`text-xs font-semibold truncate ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.montant_plafond > 0 ? fmt(item.montant_plafond) : ''}
                    onChange={e => handlePlafondChange(item.id, e.target.value)}
                    placeholder="0"
                    className={`w-24 sm:w-28 p-1.5 border rounded-lg text-xs font-bold text-right outline-none ${
                      isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  />
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-400">F</span>
                  
                  <button
                    type="button"
                    onClick={() => handleSupprimerPoste(item.id, item.label)}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>

        <div className={`p-3.5 sm:p-4 border-t flex justify-end gap-2 ${isDark ? 'border-[#2C2C2E] bg-[#161618]' : 'border-slate-100 bg-white'}`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold ${isDark ? 'text-[#8E8E93]' : 'text-slate-600'}`}
          >
            Fermer
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSauvegarderPlafonds}
            className={`px-4 sm:px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50 ${
              isDark ? 'bg-[#FFFFFF] text-[#000000]' : 'bg-slate-800 text-white'
            }`}
          >
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ─── Modal Encaissement Créance ──────────────────────────────────────────────

function ModalReglerCreance({
  operation,
  isDark,
  onEncaisse,
  onClose
}: {
  operation: any
  isDark: boolean
  onEncaisse: () => void
  onClose: () => void
}) {
  const db = usePowerSync()
  const dette = Math.max(0, Number(operation.prix_vente || 0) - Number(operation.montant_verse || 0))
  const [montantAjout, setMontantAjout] = useState(dette.toString())
  const [montantFmt, setMontantFmt] = useState(fmt(dette))
  const [modePaiement, setModePaiement] = useState('ESPECES')
  const [saving, setSaving] = useState(false)

  const onMontant = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, '')
    setMontantAjout(d)
    setMontantFmt(d ? new Intl.NumberFormat('fr-FR').format(+d) : '')
  }

  const handleValider = async (e: React.FormEvent) => {
    e.preventDefault()
    const montantNum = Number(montantAjout) || 0
    if (montantNum <= 0) return

    setSaving(true)
    const nouveauTotalVerse = Number(operation.montant_verse || 0) + montantNum
    const totalVente = Number(operation.prix_vente || 0)
    const nouveauStatut = nouveauTotalVerse >= totalVente ? 'PAYE' : 'AVANCE'

    try {
      await db.execute(
        `UPDATE operations_agence 
         SET montant_verse = ?, statut_paiement = ?, updated_at = ? 
         WHERE id = ?`,
        [nouveauTotalVerse, nouveauStatut, new Date().toISOString(), operation.id]
      )
      onEncaisse()
      onClose()
    } catch {
      alert("Erreur lors de l'enregistrement de l'encaissement")
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4" onClick={onClose}>
      <div className={`w-full max-w-sm rounded-t-3xl sm:rounded-2xl border shadow-2xl overflow-hidden p-4 sm:p-5 space-y-3.5 ${
        isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200'
      }`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-[#2C2C2E]' : 'border-slate-100'}`}>
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>Encaisser un paiement</h3>
            <p className="text-[10px] text-slate-400">{operation.client_nom || 'Client Comptoir'}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleValider} className="space-y-3">
          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-[#FF9F0A]/10 border-[#FF9F0A]/20' : 'bg-amber-50/70 border-amber-200'}`}>
            <span className={`text-[10px] font-bold uppercase block ${isDark ? 'text-[#FF9F0A]' : 'text-amber-800'}`}>Reste dû par le client</span>
            <span className={`text-base font-bold ${isDark ? 'text-[#FFD60A]' : 'text-amber-900'}`}>{fmt(dette)} CFA</span>
          </div>

          <div>
            <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>Montant perçu (CFA) *</label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={montantFmt}
              onChange={onMontant}
              className={`w-full p-2.5 border rounded-xl text-sm font-bold outline-none ${
                isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          <div>
            <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>Mode d'encaissement</label>
            <select
              value={modePaiement}
              onChange={e => setModePaiement(e.target.value)}
              className={`w-full p-2 border rounded-xl text-xs font-semibold outline-none ${
                isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              {MODES.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={`px-3 py-2 text-xs font-semibold rounded-lg ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-[#34C759] hover:bg-[#30B750] text-black font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer"
            >
              {saving ? 'Validation…' : 'Valider l’encaissement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Composant ERP Principal ──────────────────────────────────────────────────

type OngletCompta = 'VUE_ENSEMBLE' | 'SERVICES' | 'BUDGETS' | 'DEPENSES' | 'CREANCES'

export default function ComptabiliteAgence() {
  const db = usePowerSync()
  const agenceId = useAgenceId()
  const { selectedYear } = useYear()
  const [onglet, setOnglet] = useState<OngletCompta>('VUE_ENSEMBLE')
  const [periode, setPeriode] = useState<'mois' | 'an' | 'annee' | 'tout'>('mois')
  const [modeFiltre, setModeFiltre] = useState('TOUS')
  const [showFormDepense, setShowFormDepense] = useState(false)
  const [showFormBudget, setShowFormBudget] = useState(false)
  const [catFiltre, setCatFiltre] = useState('TOUTES')
  const [showCorbeille, setShowCorbeille] = useState(false)
  const [operationAEncaisser, setOperationAEncaisser] = useState<any | null>(null)

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

  const effectiveYear = typeof selectedYear === 'number' ? selectedYear : new Date().getFullYear()

  const { data: budgetsBD = [] } = useQuery<BudgetPosteBD>(
    `SELECT id, agence_id, categorie_id, label, couleur, montant_plafond, periode_type 
     FROM budgets_agence 
     WHERE agence_id = ? 
     ORDER BY label ASC`,
    [agenceId ?? '']
  )

  useEffect(() => {
    async function initDefaultBudgets() {
      if (!agenceId) return
      try {
        const check = await db.getAll(`SELECT id FROM budgets_agence WHERE agence_id = ? LIMIT 1`, [agenceId])
        if (check.length === 0) {
          for (const b of BUDGETS_DEFAUT) {
            await db.execute(
              `INSERT INTO budgets_agence (id, agence_id, categorie_id, label, couleur, montant_plafond, periode_type, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [crypto.randomUUID(), agenceId, b.categorie_id, b.label, b.couleur, b.montant_plafond, 'MOIS', new Date().toISOString(), new Date().toISOString()]
            )
          }
        }
      } catch (err) {
        console.error('Initialisation budgets BD:', err)
      }
    }
    initDefaultBudgets()
  }, [agenceId, db])

  const getRange = useCallback(() => {
    if (periode === 'mois') {
      const d = new Date(effectiveYear, new Date().getMonth(), 1)
      d.setHours(0, 0, 0, 0)
      return { debut: d.toISOString(), fin: null }
    }
    if (periode === 'an') {
      const d = new Date(effectiveYear, 0, 1)
      d.setHours(0, 0, 0, 0)
      return { debut: d.toISOString(), fin: null }
    }
    if (periode === 'annee') {
      return {
        debut: new Date(effectiveYear, 0, 1).toISOString(),
        fin: new Date(effectiveYear, 11, 31, 23, 59, 59).toISOString()
      }
    }
    return { debut: null, fin: null }
  }, [periode, effectiveYear])

  const { debut, fin } = getRange()

  const operationFilters = ['(agence_id = ? OR agence_id IS NULL)']
  const operationParams: unknown[] = [agenceId ?? '']
  if (debut) { operationFilters.push('created_at >= ?'); operationParams.push(debut) }
  if (fin) { operationFilters.push('created_at <= ?'); operationParams.push(fin) }
  if (modeFiltre !== 'TOUS') { operationFilters.push('mode_paiement = ?'); operationParams.push(modeFiltre) }

  const expenseFilters = ['agence_id = ?']
  const expenseParams: unknown[] = [agenceId ?? '']
  if (debut) { expenseFilters.push('date_depense >= ?'); expenseParams.push(debut.slice(0, 10)) }
  if (fin) { expenseFilters.push('date_depense <= ?'); expenseParams.push(fin.slice(0, 10)) }
  if (catFiltre !== 'TOUTES') { expenseFilters.push('categorie = ?'); expenseParams.push(catFiltre) }

  const { data: operations = [] } = useQuery<any>(
    `SELECT * FROM operations_agence WHERE ${operationFilters.join(' AND ')} ORDER BY created_at DESC`,
    operationParams
  )

  const { data: localDepenses = [] } = useQuery<Depense>(
    `SELECT * FROM depenses WHERE ${expenseFilters.join(' AND ')} ORDER BY date_depense DESC`,
    expenseParams
  )

  const { data: localCorbeille = [] } = useQuery<DepenseSupprimee>(
    'SELECT * FROM depenses_supprimees WHERE agence_id = ? ORDER BY supprime_le DESC LIMIT 150',
    [agenceId ?? '']
  )

  const stats: Stats = useMemo(() => {
    const nextStats: Stats = {
      totalVentes: 0,
      totalAchats: 0,
      totalFraisAnnexes: 0,
      totalBenefice: 0,
      totalMontantVerse: 0,
      totalCreances: 0,
      count: operations.length,
      parType: {},
      parModePaiement: {}
    }

    operations.forEach((op: any) => {
      const vente = Number(op.prix_vente || 0)
      const achat = Number(op.prix_achat || 0)
      const frais = Number(op.frais_annexes || 0)
      const ben = Number(op.benefice || 0)
      const verse = Number(op.montant_verse || 0)
      const dette = Math.max(0, vente - verse)

      nextStats.totalVentes += vente
      nextStats.totalAchats += achat
      nextStats.totalFraisAnnexes += frais
      nextStats.totalBenefice += ben
      nextStats.totalMontantVerse += verse
      nextStats.totalCreances += dette

      const type = op.type_activite || 'AUTRES'
      if (!nextStats.parType[type]) {
        nextStats.parType[type] = {
          ventes: 0,
          achats: 0,
          fraisAnnexes: 0,
          benefice: 0,
          montantVerse: 0,
          dette: 0,
          count: 0
        }
      }

      nextStats.parType[type].ventes += vente
      nextStats.parType[type].achats += achat
      nextStats.parType[type].fraisAnnexes += frais
      nextStats.parType[type].benefice += ben
      nextStats.parType[type].montantVerse += verse
      nextStats.parType[type].dette += dette
      nextStats.parType[type].count += 1

      const mode = op.mode_paiement || 'ESPECES'
      nextStats.parModePaiement[mode] = (nextStats.parModePaiement[mode] || 0) + verse
    })

    return nextStats
  }, [operations])

  const totalDep = useMemo(() => {
    return localDepenses.reduce((total, d) => total + Number(d.montant || 0), 0)
  }, [localDepenses])

  const depByCat = useMemo(() => {
    const map: Record<string, number> = {}
    localDepenses.forEach(d => {
      map[d.categorie] = (map[d.categorie] || 0) + Number(d.montant || 0)
    })
    return map
  }, [localDepenses])

  const operationsAvecDettes = useMemo(() => {
    return operations.filter((op: any) => {
      const dette = Number(op.prix_vente || 0) - Number(op.montant_verse || 0)
      return dette > 0
    })
  }, [operations])

  const delDep = async (dep: Depense) => {
    if (!confirm(`Supprimer la dépense "${dep.libelle}" ?`)) return
    await db.execute(
      `INSERT INTO depenses_supprimees (id, agence_id, depense_id, libelle, categorie, montant, mode_paiement, date_depense, notes, created_at, supprime_le) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), dep.agence_id, dep.id, dep.libelle, dep.categorie, dep.montant, dep.mode_paiement, dep.date_depense, dep.notes || null, dep.created_at, new Date().toISOString()]
    )
    await db.execute('DELETE FROM depenses WHERE id = ?', [dep.id])
  }

  const tresorerieNette = stats.totalMontantVerse - totalDep
  const resultatNet = stats.totalBenefice - totalDep
  const tauxCharges = stats.totalVentes > 0 ? (totalDep / stats.totalVentes) * 100 : 0
  const periodeLabel = periode === 'mois' ? `Ce mois (${effectiveYear})` : periode === 'an' ? `Cette année (${effectiveYear})` : periode === 'annee' ? `Année ${effectiveYear}` : 'Toute la période'

  const categoriesDisponibles = useMemo(() => {
    if (budgetsBD.length > 0) {
      return budgetsBD.map(b => ({ id: b.categorie_id, label: b.label, color: b.couleur || '#64748b' }))
    }
    return BUDGETS_DEFAUT.map(c => ({ id: c.categorie_id, label: c.label, color: c.couleur }))
  }, [budgetsBD])

  return (
    <div className={`min-h-screen pb-24 sm:pb-20 transition-colors duration-150 ${
      isDark ? 'bg-[#000000] text-[#F5F5F7]' : 'bg-[#F4F6F8] text-slate-800'
    }`}>

      {/* ─── HEADER ERGONOMIQUE FIXE MOBILE / DESKTOP ─── */}
      <header className={`border-b sticky top-0 z-30 backdrop-blur-md transition-colors ${
        isDark ? 'bg-[#161618]/95 border-[#2C2C2E]' : 'bg-[#FAFBFD]/95 border-slate-200'
      }`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          
          {/* Ligne 1 : Navigation + Titre + Sélecteur PC / Bouton Thème */}
          <div className="flex items-center justify-between h-13 sm:h-14 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Link href="/agence/dashboard" className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                isDark ? 'text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#2C2C2E]' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/80'
              }`}>
                <ArrowLeft size={18} />
              </Link>
              <div className="min-w-0">
                <h1 className={`font-bold text-xs sm:text-base leading-tight truncate ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>
                  Comptabilité Agence
                </h1>
                <p className={`text-[9px] sm:text-[10px] font-medium truncate ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>{periodeLabel}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              {/* Bouton Dark Mode (Masqué sur mobile) */}
              <button
                type="button"
                onClick={toggleDarkMode}
                className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  isDark 
                    ? 'bg-[#2C2C2E] border-[#38383A] text-[#FFD60A] hover:bg-[#3A3A3C]' 
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {isDark ? <Sun size={14} className="text-[#FFD60A]" /> : <Moon size={14} className="text-slate-600" />}
                <span>{isDark ? 'Mode clair' : 'Mode sombre'}</span>
              </button>

              {/* YearSelector sur Desktop */}
              <div className="hidden md:block">
                <YearSelector />
              </div>
            </div>
          </div>

          {/* Ligne 2 : Filtres Temporels + YearSelector Mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2 border-t border-slate-100 dark:border-slate-800/60">
            {/* Ligne des filtres temporels (avec défilement horizontal isolé) */}
            <div className="flex items-center gap-1 w-full overflow-x-auto scrollbar-none pb-1 sm:pb-0">
              {(['mois', 'an', 'annee', 'tout'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriode(p)}
                  className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold transition-colors border shrink-0 ${
                    periode === p 
                      ? isDark ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF]' : 'bg-slate-800 text-white border-slate-800' 
                      : isDark ? 'bg-[#1C1C1E] text-[#8E8E93] border-[#2C2C2E]' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {p === 'mois' ? 'Ce mois' : p === 'an' ? 'Cette année' : p === 'annee' ? 'Par année' : 'Tout'}
                </button>
              ))}
            </div>

            {/* Selecteurs (Year + Mode de paiement) protégés du overflow-x-auto */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="block md:hidden shrink-0">
                <YearSelector />
              </div>

              <select
                value={modeFiltre}
                onChange={e => setModeFiltre(e.target.value)}
                className={`flex-1 sm:flex-none border px-2.5 py-1.5 rounded-xl font-semibold text-[11px] sm:text-[11px] outline-none ${
                  isDark ? 'bg-[#1C1C1E] border-[#2C2C2E] text-[#F5F5F7]' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <option value="TOUS">Tous modes</option>
                <option value="ESPECES">Espèces</option>
                <option value="ORANGE_MONEY">Orange Money</option>
                <option value="WAVE">Wave</option>
                <option value="MOOV_MONEY">Moov</option>
                <option value="VIREMENT">Virement</option>
              </select>
            </div>
          </div>

          {/* Ligne 3 : Barre des Onglets Défilante */}
          <div className={`flex items-center gap-1.5 pb-2 overflow-x-auto scrollbar-none`}>
            {[
              { id: 'VUE_ENSEMBLE', label: 'Vue Générale', icon: Wallet },
              { id: 'SERVICES', label: 'Par Service', icon: BarChart2 },
              { id: 'BUDGETS', label: 'Budgets', icon: Target },
              { id: 'DEPENSES', label: 'Dépenses', icon: TrendingDown },
              { id: 'CREANCES', label: 'Créances', icon: AlertCircle },
            ].map(tab => {
              const Icon = tab.icon
              const isCurrent = onglet === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setOnglet(tab.id as OngletCompta)}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-colors border ${
                    isCurrent
                      ? isDark ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF]' : 'bg-slate-800 text-white border-slate-800'
                      : isDark ? 'bg-[#1C1C1E] text-[#8E8E93] border-[#2C2C2E]' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <Icon size={13} className={isCurrent ? (isDark ? 'text-[#000000]' : 'text-white') : ''} />
                  <span>{tab.label}</span>
                  {tab.id === 'CREANCES' && operationsAvecDettes.length > 0 && (
                    <span className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                      isDark ? 'bg-[#FF9F0A] text-[#000000]' : 'bg-amber-600 text-white'
                    }`}>
                      {operationsAvecDettes.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

        </div>
      </header>

      {/* ─── CONTENU ADAPTATIF ─── */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3.5 sm:py-5 space-y-4 sm:space-y-6">

        {/* ══════════════════ 1. ONGLET : VUE GÉNÉRALE ══════════════════ */}
        {onglet === 'VUE_ENSEMBLE' && (
          <div className="space-y-4 sm:space-y-6">
            
            {/* Note explicative responsive */}
            <div className={`border rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-start gap-2.5 sm:gap-3 ${
              isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-[#FFFFFF]/90 border-slate-200/90'
            }`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                isDark ? 'bg-[#0A84FF]/15 text-[#0A84FF]' : 'bg-blue-50 text-blue-600'
              }`}>
                <Info size={15} />
              </div>
              <p className={`text-[11px] sm:text-xs leading-relaxed ${isDark ? 'text-[#8E8E93]' : 'text-slate-600'}`}>
                <strong>CA Brut :</strong> volume global des ventes. <strong>Bénéfice :</strong> gain réel de l'agence. <strong>Trésorerie :</strong> montant effectivement présent en caisse et comptes.
              </p>
            </div>

            {/* Grille des KPIs en 2 colonnes sur mobile */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-2.5">
              <StatCard
                icon={Wallet}
                iconColor="#0A84FF"
                label="Chiffre d'Affaires"
                value={stats.totalVentes}
                sub="Volume"
                subValue={`${stats.count} dossier(s)`}
                isDark={isDark}
              />
              <StatCard
                icon={TrendingUp}
                iconColor="#34C759"
                label="Bénéfice Brut"
                value={stats.totalBenefice}
                highlight="emerald"
                sub="Marge brute"
                subValue={stats.totalVentes > 0 ? `${((stats.totalBenefice / stats.totalVentes) * 100).toFixed(1)}%` : '0%'}
                isDark={isDark}
              />
              <StatCard
                icon={TrendingDown}
                iconColor="#FF453A"
                label="Dépenses Total"
                value={totalDep}
                highlight="rose"
                sub="Charges"
                subValue={`${tauxCharges.toFixed(1)}% CA`}
                isDark={isDark}
              />
              
              {/* Carte Résultat Net */}
              <div className={`col-span-2 md:col-span-1 border rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col justify-between gap-2 sm:gap-3 ${
                isDark 
                  ? (resultatNet >= 0 ? 'bg-[#1C1C1E] border-[#34C759]/30' : 'bg-[#1C1C1E] border-[#FF453A]/30')
                  : (resultatNet >= 0 ? 'bg-[#FFFFFF]/90 border-emerald-300' : 'bg-[#FFFFFF]/90 border-rose-300')
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>Résultat Net</span>
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center ${
                    isDark 
                      ? (resultatNet >= 0 ? 'bg-[#34C759]/20 text-[#34C759]' : 'bg-[#FF453A]/20 text-[#FF453A]')
                      : (resultatNet >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600')
                  }`}>
                    <ShieldCheck size={14} />
                  </div>
                </div>
                <div>
                  <span className={`text-base sm:text-2xl font-bold tracking-tight ${
                    isDark 
                      ? (resultatNet >= 0 ? 'text-[#34C759]' : 'text-[#FF453A]') 
                      : (resultatNet >= 0 ? 'text-emerald-700' : 'text-rose-600')
                  }`}>
                    {resultatNet >= 0 ? '+' : ''}{fmt(resultatNet)}
                  </span>
                  <span className={`text-[10px] sm:text-xs font-semibold ml-1 ${isDark ? 'text-[#636366]' : 'text-slate-400'}`}>CFA</span>
                </div>
                <div className={`text-[9px] sm:text-[10px] font-semibold border-t pt-1.5 sm:pt-2 ${
                  isDark 
                    ? (resultatNet >= 0 ? 'border-[#2C2C2E] text-[#34C759]' : 'border-[#2C2C2E] text-[#FF453A]')
                    : (resultatNet >= 0 ? 'border-emerald-100 text-emerald-800' : 'border-rose-100 text-rose-700')
                }`}>
                  {resultatNet >= 0 ? '✓ Excédent' : '⚠ Déficit'} (Gain − Dépenses)
                </div>
              </div>
            </div>

            {/* Trésorerie & Encaissements */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className={`border rounded-xl sm:rounded-2xl p-3.5 sm:p-4 space-y-2.5 ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-[#FFFFFF]/90 border-slate-200/90'
              }`}>
                <span className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider block ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>
                  Cash Réel Disponible
                </span>
                <div className={`p-2.5 sm:p-3 border rounded-xl ${
                  isDark ? 'bg-[#2C2C2E] border-[#38383A]' : 'bg-slate-50 border border-slate-200'
                }`}>
                  <span className={`text-[9px] sm:text-[10px] font-semibold uppercase block ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>En caisse & comptes</span>
                  <div className={`text-xl sm:text-2xl font-bold mt-0.5 ${
                    tresorerieNette >= 0 
                      ? isDark ? 'text-[#F5F5F7]' : 'text-slate-800' 
                      : isDark ? 'text-[#FF453A]' : 'text-rose-700'
                  }`}>
                    {tresorerieNette >= 0 ? '+' : ''}{fmt(tresorerieNette)} CFA
                  </div>
                </div>
                <div className={`text-[11px] sm:text-xs space-y-1 ${isDark ? 'text-[#8E8E93]' : 'text-slate-600'}`}>
                  <div className="flex justify-between">
                    <span>Encaissé réel :</span>
                    <strong className={isDark ? 'text-[#34C759]' : 'text-emerald-700'}>+{fmt(stats.totalMontantVerse)} CFA</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Décaissements :</span>
                    <strong className={isDark ? 'text-[#FF453A]' : 'text-rose-700'}>−{fmt(totalDep)} CFA</strong>
                  </div>
                </div>
              </div>

              <div className={`lg:col-span-2 border rounded-xl sm:rounded-2xl p-3.5 sm:p-4 space-y-2.5 ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-[#FFFFFF]/90 border-slate-200/90'
              }`}>
                <span className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider block ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>
                  Perceptions par Canal
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                  {MODES.map(m => {
                    const totalPer = stats.parModePaiement[m.id] || 0
                    return (
                      <div key={m.id} className={`p-2.5 sm:p-3 border rounded-xl ${
                        isDark ? 'bg-[#2C2C2E] border-[#38383A]' : 'bg-slate-50 border border-slate-200'
                      }`}>
                        <span className={`text-[9px] sm:text-[10px] font-semibold block truncate ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>{m.label}</span>
                        <span className={`text-xs sm:text-sm font-bold block mt-1 truncate ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>
                          {fmt(totalPer)} F
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ 2. ONGLET : PAR SERVICE ══════════════════ */}
        {onglet === 'SERVICES' && (
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-xs sm:text-sm font-bold uppercase tracking-wide ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>Rentabilité par Service</h2>
                <p className={`text-[10px] sm:text-xs ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>Contribution de chaque activité</p>
              </div>
            </div>

            {Object.keys(stats.parType).length === 0 ? (
              <div className={`border rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center text-xs ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E] text-[#8E8E93]' : 'bg-[#FFFFFF]/90 border-slate-200/90 text-slate-400'
              }`}>
                Aucune vente enregistrée pour cette période.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                {Object.entries(stats.parType)
                  .sort((a, b) => b[1].benefice - a[1].benefice)
                  .map(([type, item]) => {
                    const Icon = SERVICE_ICONS[type] || FileText
                    const partBenefice = stats.totalBenefice > 0 ? (item.benefice / stats.totalBenefice) * 100 : 0
                    const margePourcent = item.ventes > 0 ? (item.benefice / item.ventes) * 100 : 0

                    return (
                      <div key={type} className={`border rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2.5 sm:space-y-3 ${
                        isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-[#FFFFFF]/90 border-slate-200/90'
                      }`}>
                        <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-[#2C2C2E]' : 'border-slate-100'}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 ${isDark ? 'bg-[#2C2C2E] text-[#D1D1D6]' : 'bg-slate-100 text-slate-600'}`}>
                              <Icon size={14} />
                            </div>
                            <span className={`font-bold text-xs uppercase truncate ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{type.replace(/_/g, ' ')}</span>
                          </div>
                          <span className={`text-[9px] sm:text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 ${
                            isDark ? 'bg-[#2C2C2E] text-[#D1D1D6]' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.count} dossier(s)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#2C2C2E] border-[#38383A]' : 'bg-slate-50 border-slate-100'}`}>
                            <span className={`text-[9px] font-semibold block uppercase ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>CA Brut</span>
                            <span className={`text-xs font-bold block truncate ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{fmt(item.ventes)} F</span>
                          </div>
                          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#34C759]/10 border-[#34C759]/20' : 'bg-emerald-50/60 border-emerald-100'}`}>
                            <span className={`text-[9px] font-semibold block uppercase ${isDark ? 'text-[#34C759]' : 'text-emerald-800'}`}>Bénéfice</span>
                            <span className={`text-xs font-bold block truncate ${isDark ? 'text-[#30D158]' : 'text-emerald-800'}`}>+{fmt(item.benefice)} F</span>
                          </div>
                          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#2C2C2E] border-[#38383A]' : 'bg-slate-50 border-slate-100'}`}>
                            <span className={`text-[9px] font-semibold block uppercase ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>Encaissé</span>
                            <span className={`text-xs font-semibold block truncate ${isDark ? 'text-[#D1D1D6]' : 'text-slate-800'}`}>{fmt(item.montantVerse)} F</span>
                          </div>
                          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#FF9F0A]/10 border-[#FF9F0A]/20' : 'bg-amber-50/60 border-amber-100'}`}>
                            <span className={`text-[9px] font-semibold block uppercase ${isDark ? 'text-[#FF9F0A]' : 'text-amber-800'}`}>Dettes</span>
                            <span className={`text-xs font-semibold block truncate ${isDark ? 'text-[#FFD60A]' : 'text-amber-900'}`}>{fmt(item.dette)} F</span>
                          </div>
                        </div>

                        <div className={`border-t pt-2 flex justify-between text-[10px] font-semibold ${isDark ? 'border-[#2C2C2E] text-[#8E8E93]' : 'border-slate-100 text-slate-500'}`}>
                          <span>Marge : <strong className={isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}>{margePourcent.toFixed(1)}%</strong></span>
                          <span>Part : <strong className={isDark ? 'text-[#34C759]' : 'text-emerald-800'}>{partBenefice.toFixed(1)}%</strong></span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ 3. ONGLET : BUDGETS ══════════════════ */}
        {onglet === 'BUDGETS' && (
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className={`text-xs sm:text-sm font-bold uppercase tracking-wide ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>
                  Contrôle Budgétaire
                </h2>
                <p className={`text-[10px] sm:text-xs ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>
                  {budgetsBD.length} poste(s) configuré(s)
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowFormBudget(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  isDark ? 'bg-[#FFFFFF] text-[#000000]' : 'bg-slate-800 text-white'
                }`}
              >
                <Target size={14} /> <span>Gérer Postes</span>
              </button>
            </div>

            {budgetsBD.length === 0 ? (
              <div className={`border rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center text-xs ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E] text-[#8E8E93]' : 'bg-[#FFFFFF]/90 border-slate-200/90 text-slate-400'
              }`}>
                Aucun budget configuré en base de données.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                {budgetsBD.map((b) => {
                  const depReelle = depByCat[b.categorie_id] || 0
                  const plafond = Number(b.montant_plafond) || 0
                  const pct = plafond > 0 ? (depReelle / plafond) * 100 : 0
                  const depasse = plafond > 0 && depReelle > plafond

                  return (
                    <div key={b.id} className={`border rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 ${
                      isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-[#FFFFFF]/90 border-slate-200/90'
                    }`}>
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.couleur || '#8E8E93' }} />
                          <span className={`text-xs font-semibold truncate ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{b.label}</span>
                        </div>
                        <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          plafond === 0 
                            ? isDark ? 'bg-[#2C2C2E] text-[#8E8E93]' : 'bg-slate-100 text-slate-600'
                            : depasse 
                            ? isDark ? 'bg-[#FF453A]/15 text-[#FF453A]' : 'bg-rose-50 text-rose-700'
                            : pct >= 80 
                            ? isDark ? 'bg-[#FF9F0A]/15 text-[#FF9F0A]' : 'bg-amber-50 text-amber-800'
                            : isDark ? 'bg-[#34C759]/15 text-[#34C759]' : 'bg-emerald-50 text-emerald-800'
                        }`}>
                          {plafond === 0 ? 'Illimité' : `${Math.round(pct)}%`}
                        </span>
                      </div>

                      {plafond > 0 && (
                        <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? 'bg-[#2C2C2E]' : 'bg-slate-100'}`}>
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              depasse ? 'bg-[#FF453A]' : pct >= 80 ? 'bg-[#FF9F0A]' : 'bg-[#34C759]'
                            }`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      )}

                      <div className={`flex items-center justify-between text-[11px] pt-1 ${isDark ? 'text-[#8E8E93]' : 'text-slate-600'}`}>
                        <span>Réalisé : <strong className={isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}>{fmt(depReelle)} F</strong></span>
                        <span>Plafond : <strong className={isDark ? 'text-[#D1D1D6]' : 'text-slate-700'}>{plafond > 0 ? `${fmt(plafond)} F` : '—'}</strong></span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ 4. ONGLET : DÉPENSES ══════════════════ */}
        {onglet === 'DEPENSES' && (
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className={`text-xs sm:text-sm font-bold uppercase tracking-wide ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>Journal Dépenses</h2>
                <p className={`text-[10px] sm:text-xs ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>Total : {fmt(totalDep)} CFA</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCorbeille(!showCorbeille)}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    showCorbeille 
                      ? isDark ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' : 'bg-slate-100 border-slate-300 text-slate-700' 
                      : isDark ? 'bg-[#1C1C1E] border-[#2C2C2E] text-[#8E8E93]' : 'bg-white border-slate-200 text-slate-500'
                  }`}
                  title="Corbeille"
                >
                  <Archive size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowFormDepense(true)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                    isDark ? 'bg-[#FFFFFF] text-[#000000]' : 'bg-slate-800 text-white'
                  }`}
                >
                  <Plus size={14} /> <span>Ajouter</span>
                </button>
              </div>
            </div>

            {/* Filtre par catégorie de charge */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setCatFiltre('TOUTES')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  catFiltre === 'TOUTES' 
                    ? isDark ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF]' : 'bg-slate-800 text-white border-slate-800'
                    : isDark ? 'bg-[#1C1C1E] text-[#8E8E93] border-[#2C2C2E]' : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                Toutes ({localDepenses.length})
              </button>
              {categoriesDisponibles.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCatFiltre(c.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border ${
                    catFiltre === c.id 
                      ? isDark ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF]' : 'bg-slate-800 text-white border-slate-800'
                      : isDark ? 'bg-[#1C1C1E] text-[#8E8E93] border-[#2C2C2E]' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {c.label} {depByCat[c.id] ? `(${fmt(depByCat[c.id])} F)` : ''}
                </button>
              ))}
            </div>

            {localDepenses.length === 0 ? (
              <div className={`border rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center text-xs ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E] text-[#8E8E93]' : 'bg-[#FFFFFF]/90 border-slate-200/90 text-slate-400'
              }`}>
                Aucune dépense enregistrée sur cette période.
              </div>
            ) : (
              <div className={`border rounded-xl sm:rounded-2xl divide-y overflow-hidden ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E] divide-[#2C2C2E]' : 'bg-[#FFFFFF]/90 border-slate-200/90 divide-slate-100'
              }`}>
                {localDepenses.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-2.5 p-3 sm:px-4 sm:py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg shrink-0 flex items-center justify-center text-[9px] font-bold text-white" style={{ background: '#8E8E93' }}>
                        {d.categorie.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold truncate ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{d.libelle}</p>
                        <p className={`text-[10px] truncate ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>
                          {d.categorie} &bull; {new Date(d.date_depense).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-xs font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{fmt(d.montant)} F</span>
                      <button type="button" onClick={() => delDep(d)} className="p-1.5 rounded text-slate-400 hover:text-rose-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Corbeille */}
            {showCorbeille && (
              <div className={`border rounded-xl sm:rounded-2xl p-3.5 space-y-2.5 ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-[#FFFFFF]/90 border-slate-200/90'
              }`}>
                <span className={`text-xs font-bold uppercase tracking-wider block ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>Corbeille</span>
                {localCorbeille.length === 0 ? (
                  <p className="text-xs text-slate-400">La corbeille est vide.</p>
                ) : (
                  <div className={`divide-y ${isDark ? 'divide-[#2C2C2E]' : 'divide-slate-100'}`}>
                    {localCorbeille.map(dep => (
                      <div key={dep.id} className="py-2 flex justify-between text-xs text-slate-400 gap-2">
                        <span className="line-through truncate">{dep.libelle}</span>
                        <span className="line-through shrink-0">{fmt(dep.montant)} F</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ 5. ONGLET : CRÉANCES ══════════════════ */}
        {onglet === 'CREANCES' && (
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-xs sm:text-sm font-bold uppercase tracking-wide ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>Créances Clients</h2>
                <p className={`text-[10px] sm:text-xs ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>Total à recouvrer : {fmt(stats.totalCreances)} CFA</p>
              </div>
            </div>

            {operationsAvecDettes.length === 0 ? (
              <div className={`border rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center text-xs ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E] text-[#8E8E93]' : 'bg-[#FFFFFF]/90 border-slate-200/90 text-slate-400'
              }`}>
                Aucune créance en attente sur cette période.
              </div>
            ) : (
              <div className={`border rounded-xl sm:rounded-2xl divide-y overflow-hidden ${
                isDark ? 'bg-[#1C1C1E] border-[#2C2C2E] divide-[#2C2C2E]' : 'bg-[#FFFFFF]/90 border-slate-200/90 divide-slate-100'
              }`}>
                {operationsAvecDettes.map((op: any) => {
                  const resteDu = Number(op.prix_vente || 0) - Number(op.montant_verse || 0)
                  return (
                    <div key={op.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold truncate ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{op.client_nom || 'Client Comptoir'}</span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded shrink-0 ${
                            isDark ? 'bg-[#2C2C2E] text-[#D1D1D6]' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {op.type_activite}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">
                          {op.client_telephone || 'Sans numéro'} &bull; {new Date(op.created_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                        <div className="text-left sm:text-right">
                          <span className={`text-xs font-bold block ${isDark ? 'text-[#FF9F0A]' : 'text-amber-800'}`}>Reste : {fmt(resteDu)} CFA</span>
                          <span className="text-[9px] text-slate-400">Total : {fmt(op.prix_vente)} CFA</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setOperationAEncaisser(op)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                            isDark ? 'bg-[#34C759] text-black font-bold' : 'bg-emerald-600 text-white'
                          }`}
                        >
                          Encaisser
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Modals ERP */}
      {showFormDepense && agenceId && (
        <FormDepense 
          agenceId={agenceId} 
          categoriesDisponibles={categoriesDisponibles}
          isDark={isDark}
          onAdded={() => {}} 
          onClose={() => setShowFormDepense(false)} 
        />
      )}

      {showFormBudget && agenceId && (
        <FormBudgetModulable
          agenceId={agenceId}
          budgetsActuels={budgetsBD}
          isDark={isDark}
          onClose={() => setShowFormBudget(false)}
        />
      )}

      {operationAEncaisser && (
        <ModalReglerCreance
          operation={operationAEncaisser}
          isDark={isDark}
          onEncaisse={() => setOperationAEncaisser(null)}
          onClose={() => setOperationAEncaisser(null)}
        />
      )}

    </div>
  )
}