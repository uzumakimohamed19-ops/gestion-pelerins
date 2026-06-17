'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import {
  ArrowLeft, TrendingUp, Wallet, PieChart,
  AlertCircle, CreditCard, RefreshCw, BarChart2,
  Plus, Trash2, Archive, X,
  TrendingDown, DollarSign, ShieldCheck, FileText
} from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  totalVentes: number;
  totalAchats: number;
  totalFraisAnnexes: number;
  totalBenefice: number;
  totalMontantVerse: number;
  totalCreances: number;
  count: number;
  parType: { [k: string]: { ventes: number; benefice: number; count: number } };
  parModePaiement: { [k: string]: number };
}
interface Depense {
  id: string;
  agence_id: string;
  libelle: string;
  categorie: string;
  montant: number;
  mode_paiement: string;
  date_depense: string;
  notes?: string;
  created_at: string;
}
interface DepenseSupprimee extends Depense { depense_id: string; supprime_le: string }

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATS = [
  { id: 'LOYER',         label: 'Loyer / Local',      color: '#6366f1' },
  { id: 'SALAIRES',      label: 'Salaires',           color: '#ec4899' },
  { id: 'MARKETING',     label: 'Marketing',          color: '#f59e0b' },
  { id: 'MATERIEL',      label: 'Matériel',           color: '#10b981' },
  { id: 'FOURNITURES',   label: 'Fournitures',        color: '#3b82f6' },
  { id: 'COMMUNICATION', label: 'Internet / Tél.',    color: '#8b5cf6' },
  { id: 'TRANSPORT',     label: 'Transport',          color: '#f97316' },
  { id: 'IMPOTS',        label: 'Impôts & Taxes',     color: '#ef4444' },
  { id: 'AUTRES',        label: 'Autres',             color: '#6b7280' },
]
const MODES = [
  { id: 'ESPECES',      label: 'Espèces' },
  { id: 'ORANGE_MONEY', label: 'Orange Money' },
  { id: 'MOOV_MONEY',   label: 'Moov Money' },
  { id: 'VIREMENT',     label: 'Virement' },
]
const ANNEE = new Date().getFullYear()
const ANNEES = Array.from({ length: (ANNEE + 10) - 2020 + 1 }, (_, i) => 2020 + i)
const ACCENT_BORDER = ['border-l-indigo-400','border-l-emerald-400','border-l-amber-400','border-l-rose-400','border-l-violet-400','border-l-cyan-400']
const ACCENT_TEXT   = ['text-indigo-600','text-emerald-600','text-amber-600','text-rose-600','text-violet-600','text-cyan-600']
const ACCENT_BG     = ['bg-indigo-50','bg-emerald-50','bg-amber-50','bg-rose-50','bg-violet-50','bg-cyan-50']

const fmt = (n: number) => n.toLocaleString('fr-FR')
const catLabel = (id: string) => CATS.find(c => c.id === id)?.label ?? id
const catColor = (id: string) => CATS.find(c => c.id === id)?.color ?? '#6b7280'

// ─── Gestion IndexedDB Native ─────────────────────────────────────────────────

const DB_NAME = 'AlBouraqComptaDB'
const DB_VERSION = 1

function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject('SSR')
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getCacheLocal(key: string): Promise<any> {
  try {
    const db = await initDB()
    return new Promise((resolve) => {
      const tx = db.transaction('cache', 'readonly')
      const store = tx.objectStore('cache')
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result?.data || null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

async function setCacheLocal(key: string, data: any): Promise<void> {
  try {
    const db = await initDB()
    const tx = db.transaction('cache', 'readwrite')
    const store = tx.objectStore('cache')
    store.put({ id: key, data, updated_at: Date.now() })
  } catch (e) { console.error(e) }
}

// ─── Hook agence ──────────────────────────────────────────────────────────────

function useAgenceId() {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const m = user.user_metadata?.agence_id ?? user.app_metadata?.agence_id
      if (m) { setId(m); return }
      const { data } = await supabase.from('profiles').select('agence_id').eq('id', user.id).single()
      if (data?.agence_id) setId(data.agence_id)
    })
  }, [])
  return id
}

// ─── Pill badge ───────────────────────────────────────────────────────────────

function Pill({ children, active, color, onClick }: {
  children: React.ReactNode; active?: boolean; color?: string; onClick?: () => void
}) {
  return (
    <button onClick={onClick}
      className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-black transition-all border ${active ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
      style={active && color ? { background: color, borderColor: color } : active ? { background: '#0f172a' } : {}}
    >{children}</button>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, iconColor, label, value, unit = 'F', sub, subValue, highlight }: {
  icon: React.ElementType; iconColor: string; label: string; value: string | number
  unit?: string; sub?: string; subValue?: string; highlight?: 'emerald' | 'amber' | 'rose' | 'violet' | 'result-pos' | 'result-neg'
}) {
  const highlights: Record<string, string> = {
    emerald: 'text-emerald-600', amber: 'text-amber-500', rose: 'text-rose-500', violet: 'text-violet-600',
    'result-pos': 'text-emerald-600', 'result-neg': 'text-red-500',
  }
  const valueColor = highlight ? highlights[highlight] : 'text-slate-900'
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconColor + '18' }}>
          <Icon size={16} style={{ color: iconColor }} />
        </div>
      </div>
      <div>
        <span className={`text-2xl font-black leading-none ${valueColor}`}>{typeof value === 'number' ? fmt(value) : value}</span>
        {unit && <span className="text-xs font-bold text-slate-400 ml-1">{unit}</span>}
      </div>
      {sub && (
        <div className="flex items-center justify-between border-t border-slate-50 pt-2">
          <span className="text-[10px] text-slate-400 font-bold">{sub}</span>
          <span className="text-[10px] font-black text-slate-700">{subValue}</span>
        </div>
      )}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ icon: Icon, iconColor = '#64748b', title, subtitle, action, children }: {
  icon: React.ElementType; iconColor?: string; title: string; subtitle?: string
  action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: iconColor + '15' }}>
            <Icon size={15} style={{ color: iconColor }} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider leading-none">{title}</h2>
            {subtitle && <p className="text-[10px] text-slate-400 font-bold mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

// ─── Bottom Sheet Formulaire Corrigé pour le Navbar fixe du Bas ───────────────

function FormDepense({ agenceId, onAdded, onClose }: {
  agenceId: string; onAdded: () => void; onClose: () => void
}) {
  const [libelle, setLibelle]   = useState('')
  const [categorie, setCategorie] = useState('AUTRES')
  const [montant, setMontant]   = useState('')
  const [montantFmt, setMontantFmt] = useState('')
  const [mode, setMode]         = useState('ESPECES')
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const onMontant = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value.replace(/\D/g, '')
    setMontant(d)
    setMontantFmt(d ? new Intl.NumberFormat('fr-FR').format(+d) : '')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!libelle.trim() || !montant || +montant <= 0) { setError('Libellé et montant requis.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('depenses').insert([{
      agence_id: agenceId, libelle: libelle.trim(), categorie,
      montant: +montant, mode_paiement: mode, date_depense: date, notes: notes.trim() || null,
    }])
    setSaving(false)
    if (err) { setError(err.message); return }
    onAdded(); onClose()
  }

  const inp = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-semibold text-sm focus:border-slate-900 focus:bg-white transition-all placeholder:text-slate-300"
  const lbl = "block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5"

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-[2.5rem] shadow-2xl flex flex-col relative overflow-hidden" style={{ height: '82dvh' }} onClick={e => e.stopPropagation()}>
        
        <div className="flex justify-center pt-3 pb-0 flex-shrink-0">
          <div className="w-12 h-1 rounded-full bg-slate-200" />
        </div>
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-black text-slate-900 text-base">Nouvelle dépense</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Charge de fonctionnement</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform">
            <X size={15} />
          </button>
        </div>
        
        {/* Zone Scrollable principale avec un gros padding bottom pour dégager l'espace sous le bouton */}
        <div className="overflow-y-auto flex-1 px-6 py-4 pb-32 scrollbar-none">
          <form onSubmit={submit} id="depense-form" className="space-y-5">
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl font-bold">{error}</p>}

            <div>
              <label className={lbl}>Libellé *</label>
              <input required className={inp} placeholder="Ex : Loyer du mois de janvier"
                value={libelle} onChange={e => setLibelle(e.target.value)} />
            </div>

            <div>
              <label className={lbl}>Catégorie</label>
              <div className="grid grid-cols-3 gap-2">
                {CATS.map(c => (
                  <button key={c.id} type="button" onClick={() => setCategorie(c.id)}
                    className={`py-2.5 rounded-xl text-[10px] font-black border transition-all leading-tight text-center ${categorie === c.id ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-500'}`}
                    style={categorie === c.id ? { background: c.color, borderColor: c.color } : {}}
                  >{c.label}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Montant (CFA) *</label>
                <div className="relative">
                  <input type="text" inputMode="numeric" required className={`${inp} pl-10`}
                    placeholder="150 000" value={montantFmt} onChange={onMontant} />
                  <DollarSign size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                </div>
              </div>
              <div>
                <label className={lbl}>Date</label>
                <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>

            <div>
              <label className={lbl}>Mode de paiement</label>
              <div className="grid grid-cols-2 gap-2">
                {MODES.map(m => (
                  <button key={m.id} type="button" onClick={() => setMode(m.id)}
                    className={`py-2.5 rounded-xl text-xs font-black border transition-all ${mode === m.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-500'}`}
                  >{m.label}</button>
                ))}
              </div>
            </div>

            <div>
              <label className={lbl}>Notes <span className="font-normal normal-case text-slate-300">(optionnel)</span></label>
              <textarea rows={2} className={`${inp} resize-none`} placeholder="Ex : Facture N°023…"
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </form>
        </div>

        {/* CONTENEUR DU BOUTON EN VISUELLEMENT PARFAIT AU-DESSUS DE LA NAVBAR MOBILE GRÂCE À UN PADDING BAS LOCALISÉ */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 pb-6 md:pb-4 z-20 shadow-[0_-10px_25px_rgba(0,0,0,0.03)]">
          <button type="submit" form="depense-form" disabled={saving}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.97] transition-all"
          >
            {saving
              ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Enregistrement…</>
              : <><Plus size={16} />Enregistrer la dépense</>}
          </button>
        </div>

      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

type Periode = 'mois' | 'an' | 'annee' | 'tout'

export default function ComptabiliteAgence() {
  const agenceId = useAgenceId()
  const [loading, setLoading]     = useState(true)
  const [loadDep, setLoadDep]     = useState(true)
  const [periode, setPeriode]     = useState<Periode>('mois')
  const [annee, setAnnee]         = useState(ANNEE)
  const [modeFiltre, setModeFiltre] = useState('TOUS')
  const [showForm, setShowForm]   = useState(false)
  const [catFiltre, setCatFiltre] = useState('TOUTES')
  const [showCorbeille, setShowCorbeille] = useState(false)

  const [stats, setStats] = useState<Stats>({
    totalVentes:0,totalAchats:0,totalFraisAnnexes:0,
    totalBenefice:0,totalMontantVerse:0,totalCreances:0,
    count:0,parType:{},parModePaiement:{}
  })
  const [depenses, setDepenses]           = useState<Depense[]>([])
  const [totalDep, setTotalDep]           = useState(0)
  const [corbeille, setCorbeille]         = useState<DepenseSupprimee[]>([])

  const getRange = useCallback(() => {
    if (periode==='mois')  { const d=new Date();d.setDate(1);d.setHours(0,0,0,0);return{debut:d.toISOString(),fin:null} }
    if (periode==='an')    { const d=new Date();d.setMonth(0,1);d.setHours(0,0,0,0);return{debut:d.toISOString(),fin:null} }
    if (periode==='annee') return{debut:new Date(annee,0,1).toISOString(),fin:new Date(annee,11,31,23,59,59).toISOString()}
    return{debut:null,fin:null}
  },[periode,annee])

  const loadLocalCache = useCallback(async () => {
    const cacheKey = `compta_${periode}_${annee}_${modeFiltre}_${catFiltre}`
    const localData = await getCacheLocal(cacheKey)
    if (localData) {
      if (localData.stats) setStats(localData.stats)
      if (localData.depenses) {
        setDepenses(localData.depenses)
        setTotalDep(localData.depenses.reduce((a: number, d: Depense) => a + d.montant, 0))
      }
      if (localData.corbeille) setCorbeille(localData.corbeille)
      setLoading(false)
      setLoadDep(false)
    }
  }, [periode, annee, modeFiltre, catFiltre])

  const fetchStats = useCallback(async () => {
    if(!agenceId) return
    const {debut, fin} = getRange()
    let q = supabase.from('operations_agence').select('*')
    if(debut) q = q.gte('created_at', debut)
    if(fin) q = q.lte('created_at', fin)
    if(modeFiltre !== 'TOUS') q = q.eq('mode_paiement', modeFiltre)
    
    const {data} = await q
    if(data){
      const s: Stats = {totalVentes:0,totalAchats:0,totalFraisAnnexes:0,totalBenefice:0,totalMontantVerse:0,totalCreances:0,count:data.length,parType:{},parModePaiement:{}}
      data.forEach(o=>{
        s.totalVentes += (o.prix_vente||0); s.totalAchats += (o.prix_achat||0); s.totalFraisAnnexes += (o.frais_annexes||0)
        s.totalBenefice += (o.benefice||0); s.totalMontantVerse += (o.montant_verse||0)
        const r = (o.prix_vente||0) - (o.montant_verse||0); if(r>0) s.totalCreances += r
        if(!s.parType[o.type_activite]) s.parType[o.type_activite] = {ventes:0, benefice:0, count:0}
        s.parType[o.type_activite].ventes += (o.prix_vente||0); s.parType[o.type_activite].benefice += (o.benefice||0); s.parType[o.type_activite].count += 1
        const m = o.mode_paiement||'NON_DEFINI'; s.parModePaiement[m] = (s.parModePaiement[m]||0) + (o.prix_vente||0)
      })
      setStats(s)
      
      const cacheKey = `compta_${periode}_${annee}_${modeFiltre}_${catFiltre}`
      getCacheLocal(cacheKey).then(old => {
        setCacheLocal(cacheKey, { ...(old || {}), stats: s })
      })
    }
    setLoading(false)
  }, [agenceId, getRange, modeFiltre, periode, annee, catFiltre])

  const fetchDep = useCallback(async () => {
    if(!agenceId) return
    const {debut, fin} = getRange()
    let q = supabase.from('depenses').select('*').order('date_depense', {ascending:false})
    if(debut) q = q.gte('date_depense', debut.slice(0,10))
    if(fin) q = q.lte('date_depense', fin.slice(0,10))
    if(catFiltre !== 'TOUTES') q = q.eq('categorie', catFiltre)
    
    const {data} = await q
    const l = (data??[]) as Depense[]
    setDepenses(l)
    setTotalDep(l.reduce((a,d) => a+d.montant, 0))
    setLoadDep(false)

    const cacheKey = `compta_${periode}_${annee}_${modeFiltre}_${catFiltre}`
    getCacheLocal(cacheKey).then(old => {
      setCacheLocal(cacheKey, { ...(old || {}), depenses: l })
    })
  }, [agenceId, getRange, catFiltre, periode, annee, modeFiltre])

  const fetchCorbeille = useCallback(async () => {
    if(!agenceId) return
    const {data} = await supabase.from('depenses_supprimees').select('*').order('supprime_le', {ascending:false}).limit(200)
    const list = (data??[]) as DepenseSupprimee[]
    setCorbeille(list)

    const cacheKey = `compta_${periode}_${annee}_${modeFiltre}_${catFiltre}`
    getCacheLocal(cacheKey).then(old => {
      setCacheLocal(cacheKey, { ...(old || {}), corbeille: list })
    })
  }, [agenceId, periode, annee, modeFiltre, catFiltre])

  const refreshAllData = useCallback(() => {
    fetchStats()
    fetchDep()
    fetchCorbeille()
  }, [fetchStats, fetchDep, fetchCorbeille])

  useEffect(() => {
    if (agenceId) {
      loadLocalCache().then(() => {
        refreshAllData()
      })
    }
  }, [agenceId, periode, annee, modeFiltre, catFiltre, loadLocalCache, refreshAllData])

  const delDep = async (dep: Depense) => {
    if(!confirm(`Supprimer "${dep.libelle}" ?\nElle sera conservée dans la corbeille.`)) return
    await supabase.from('depenses_supprimees').insert([{agence_id:dep.agence_id,depense_id:dep.id,libelle:dep.libelle,categorie:dep.categorie,montant:dep.montant,mode_paiement:dep.mode_paiement,date_depense:dep.date_depense,notes:dep.notes,created_at:dep.created_at}])
    await supabase.from('depenses').delete().eq('id', dep.id)
    refreshAllData()
  }

  const resultatNet = stats.totalBenefice - totalDep
  const tauxCharges = stats.totalVentes > 0 ? (totalDep/stats.totalVentes)*100 : 0
  const depByCat: {[c:string]:number} = {}
  depenses.forEach(d => { depByCat[d.categorie] = (depByCat[d.categorie]||0) + d.montant })

  if(!agenceId) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <span className="text-slate-300 font-black text-xs uppercase tracking-widest animate-pulse">Connexion…</span>
    </div>
  )

  const periodeLabel = periode==='mois'?'Ce mois':periode==='an'?'Cette année':periode==='annee'?String(annee):'Toute la période'

  return (
    <div className="min-h-screen bg-white text-slate-900 pb-24">

      {/* ════ HEADER ════════════════════════════════════════════════════════ */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 md:px-6">

          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Link href="/selection" className="hidden md:flex w-8 h-8 rounded-lg bg-slate-100 items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                <ArrowLeft size={16} />
              </Link>
              <div>
                <h1 className="font-black text-slate-900 text-base md:text-lg leading-none">Comptabilité</h1>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5 hidden md:block">{periodeLabel}</p>
              </div>
            </div>
            <button onClick={refreshAllData}
              className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
            ><RefreshCw size={15} className={loading?'animate-spin text-emerald-500':''} /></button>
          </div>

          <div className="flex items-center gap-2 pb-3 overflow-x-auto scrollbar-none -mx-1 px-1">
            {(['mois','an','annee','tout'] as const).map(p=>(
              <Pill key={p} active={periode===p} onClick={()=>setPeriode(p)}>
                {p==='mois'?'Ce mois':p==='an'?'Cette année':p==='annee'?'Par année':'Tout'}
              </Pill>
            ))}
            {periode==='annee'&&(
              <select value={annee} onChange={e=>setAnnee(+e.target.value)}
                className="flex-shrink-0 bg-slate-900 text-white px-3 py-1.5 rounded-full font-black text-[11px] outline-none border-0"
              >{ANNEES.map(a=><option key={a} value={a}>{a}</option>)}</select>
            )}
            <div className="w-px h-4 bg-slate-200 flex-shrink-0 mx-1" />
            <select value={modeFiltre} onChange={e=>setModeFiltre(e.target.value)}
              className="flex-shrink-0 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full font-bold text-[11px] outline-none bg-white"
            >
              <option value="TOUS">Tous modes</option>
              <option value="ESPECES">Espèces</option>
              <option value="ORANGE_MONEY">Orange Money</option>
              <option value="MOOV_MONEY">Moov Money</option>
              <option value="VIREMENT">Virement</option>
            </select>
          </div>
        </div>
      </header>

      {/* ════ CONTENU ═══════════════════════════════════════════════════════ */}
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-8">
        {loading && depenses.length === 0 ? (
          <div className="py-28 text-center">
            <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 font-bold text-sm">Chargement du grand livre…</p>
          </div>
        ) : (<>
          {/* ── 1. VUE D'ENSEMBLE ─────────────────────────────────────────── */}
          <Section icon={Wallet} iconColor="#3b82f6" title="Vue d'ensemble" subtitle={periodeLabel}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={Wallet} iconColor="#3b82f6" label="Chiffre d'affaires" value={stats.totalVentes} sub="Opérations" subValue={`${stats.count}`} />
              <StatCard icon={PieChart} iconColor="#f43f5e" label="Coûts d'achats" value={stats.totalAchats} sub="Frais annexes" subValue={`${fmt(stats.totalFraisAnnexes)} F`} />
              <StatCard icon={AlertCircle} iconColor="#f59e0b" label="Créances clients" value={stats.totalCreances} highlight="amber" sub="Déjà encaissé" subValue={`${fmt(stats.totalMontantVerse)} F`} />
              <StatCard icon={TrendingUp} iconColor="#10b981" label="Bénéfice brut" value={stats.totalBenefice} highlight="emerald" sub="Taux de marge" subValue={stats.totalVentes>0?`${Math.round((stats.totalBenefice/stats.totalVentes)*100)}%`:'—'} />
              <StatCard icon={TrendingDown} iconColor="#ef4444" label="Dépenses fonct." value={totalDep} highlight="rose" sub="Taux de charges" subValue={`${tauxCharges.toFixed(1)}% du CA`} />
              
              <div className={`col-span-2 md:col-span-1 bg-white border-2 rounded-2xl p-4 shadow-sm flex flex-col gap-3 ${resultatNet>=0?'border-emerald-200':'border-red-200'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Résultat net</span>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${resultatNet>=0?'bg-emerald-50':'bg-red-50'}`}>
                    <ShieldCheck size={16} className={resultatNet>=0?'text-emerald-600':'text-red-500'} />
                  </div>
                </div>
                <div>
                  <span className={`text-2xl font-black ${resultatNet>=0?'text-emerald-600':'text-red-500'}`}>
                    {resultatNet>=0?'+':''}{fmt(resultatNet)}
                  </span>
                  <span className="text-xs font-bold text-slate-400 ml-1">CFA</span>
                </div>
                <div className={`text-[10px] font-black border-t pt-2 ${resultatNet>=0?'border-emerald-100 text-emerald-600':'border-red-100 text-red-500'}`}>
                  {resultatNet>=0?'✓ Excédentaire':'⚠ Déficitaire'} · Bénéfice − Dépenses
                </div>
              </div>
              <StatCard icon={CreditCard} iconColor="#8b5cf6" label="Trésorerie encaissée" value={stats.totalMontantVerse} highlight="violet" sub="Reste à recouvrer" subValue={`${fmt(stats.totalCreances)} F`} />
              <StatCard icon={FileText} iconColor="#64748b" label="Panier moyen" value={stats.count>0?fmt(Math.round(stats.totalVentes/stats.count)):'—'} unit="" sub="Total transactions" subValue={`${stats.count}`} />
            </div>
          </Section>

          {/* ── 2. PERFORMANCE PAR SERVICE ────────────────────────────────── */}
          <Section icon={BarChart2} iconColor="#6366f1" title="Performance par service" subtitle="Marge et rentabilité par segment">
            {Object.keys(stats.parType).length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center text-slate-400 font-bold text-sm">
                Aucune opération sur cette période.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(stats.parType).sort((a,b)=>b[1].benefice-a[1].benefice).map(([type,item],i)=>{
                  const ci=i%ACCENT_BORDER.length
                  const part=stats.totalBenefice>0?(item.benefice/stats.totalBenefice)*100:0
                  const marge=item.ventes>0?(item.benefice/item.ventes)*100:0
                  return (
                    <div key={type} className={`bg-white border border-slate-100 rounded-2xl p-4 shadow-sm border-l-4 ${ACCENT_BORDER[ci]} flex flex-col justify-between gap-4`}>
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-xs text-slate-800 uppercase tracking-wide truncate">{type.replace(/_/g,' ')}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${ACCENT_BG[ci]} ${ACCENT_TEXT[ci]}`}>{item.count} vnt</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Ventes</p>
                            <p className="text-sm font-black text-slate-700 mt-0.5">{fmt(item.ventes)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Bénéfice</p>
                            <p className={`text-sm font-black mt-0.5 ${ACCENT_TEXT[ci]}`}>{fmt(item.benefice)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-slate-50 pt-2.5 flex items-center justify-between text-[10px] font-bold text-slate-400">
                        <span>Marge : <strong className="text-slate-600 font-black">{Math.round(marge)}%</strong></span>
                        <span>Part om : <strong className="text-slate-600 font-black">{Math.round(part)}%</strong></span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* ── 3. CHARGES & DEPENSES ─────────────────────────────────────── */}
          <Section icon={TrendingDown} iconColor="#f43f5e" title="Dépenses d'exploitation" subtitle={`${depenses.length} charges enregistrées`}
            action={
              <div className="flex items-center gap-1.5">
                <button onClick={()=>setShowCorbeille(!showCorbeille)} className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${showCorbeille?'bg-slate-100 border-slate-300 text-slate-800':'bg-white border-slate-200 text-slate-400 hover:text-slate-600'}`}>
                  <Archive size={14} />
                </button>
                <button onClick={()=>setShowForm(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all">
                  <Plus size={14} /> <span className="hidden sm:inline">Ajouter</span>
                </button>
              </div>
            }
          >
            <div className="flex items-center gap-1.5 overflow-x-auto pb-3 scrollbar-none -mx-1 px-1 mb-1">
              <Pill active={catFiltre==='TOUTES'} onClick={()=>setCatFiltre('TOUTES')}>Toutes les charges</Pill>
              {CATS.map(c => (
                <Pill key={c.id} active={catFiltre===c.id} color={c.color} onClick={()=>setCatFiltre(c.id)}>
                  {c.label} {depByCat[c.id] ? `(${fmt(depByCat[c.id])} F)` : ''}
                </Pill>
              ))}
            </div>

            {loadDep && depenses.length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-6 text-center text-slate-400 font-medium text-xs">Mise à jour de la liste…</div>
            ) : depenses.length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-slate-400 font-bold text-sm">
                Aucune dépense enregistrée sur ce segment.
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden shadow-sm">
                {depenses.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-slate-50/50 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white" style={{ background: catColor(d.categorie) }}>
                        {d.categorie.slice(0,3)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-800 truncate leading-snug">{d.libelle}</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                          {catLabel(d.categorie)} · {new Date(d.date_depense).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})} · <span className="uppercase">{d.mode_paiement.replace(/_/g,' ')}</span>
                        </p>
                        {d.notes && <p className="text-[10px] text-slate-400 italic mt-0.5 truncate max-w-md">“ {d.notes} ”</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-black text-slate-900">{fmt(d.montant)} F</span>
                      <button onClick={()=>delDep(d)} className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 max-md:opacity-100">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── 4. CORBEILLE DES DEPENSES ──────────────────────────────────── */}
          {showCorbeille && (
            <Section icon={Archive} iconColor="#64748b" title="Corbeille (Dépenses archivées)" subtitle="Historique des suppressions récurrentes">
              {corbeille.length === 0 ? (
                <div className="bg-slate-50 rounded-2xl p-6 text-center text-slate-400 font-bold text-xs border border-dashed border-slate-200">
                  La corbeille est vide.
                </div>
              ) : (
                <div className="bg-white border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden shadow-sm">
                  {corbeille.map(dep => (
                    <div key={dep.id} className="flex items-center gap-3 px-4 py-3.5 opacity-60">
                      <div className="w-9 h-9 rounded-xl flex-shrink-0 bg-slate-100 text-slate-400 flex items-center justify-center text-[9px] font-black">
                        {dep.categorie.slice(0,3)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-500 truncate line-through">{dep.libelle}</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">{catLabel(dep.categorie)} · {new Date(dep.date_depense).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}</p>
                        <p className="text-[10px] text-red-400 font-bold">Supprimée le {new Date(dep.supprime_le).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}</p>
                      </div>
                      <span className="text-sm font-bold text-slate-400 line-through flex-shrink-0">{fmt(dep.montant)} F</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}
        </>)}
      </main>

      {showForm && agenceId && (
        <FormDepense agenceId={agenceId} onAdded={refreshAllData} onClose={()=>setShowForm(false)} />
      )}
    </div>
  )
}