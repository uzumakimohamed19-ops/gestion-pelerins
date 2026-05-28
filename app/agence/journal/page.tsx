'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import Link from 'next/link'
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  TrendingUp, 
  Plane, 
  Globe, 
  Coins, 
  Receipt,
  CheckCircle2,
  Clock,
  XCircle,
  Phone,
  Briefcase,
  Download
} from 'lucide-react'

interface Operation {
  id: string
  created_at: string
  type_activite: string
  client_nom: string
  client_telephone?: string
  description: string
  compagnie_fournisseur?: string
  reference_document?: string
  prix_achat: number
  prix_vente: number
  frais_annexes: number
  montant_verse: number
  statut_paiement: 'PAYE' | 'AVANCE' | 'NON_PAYE'
  mode_paiement: string
  benefice: number
}

export default function JournalOperations() {
  const [operations, setOperations] = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchOperations()
  }, [])

  async function fetchOperations() {
    setLoading(true)
    const { data, error } = await supabase
      .from('operations_agence')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setOperations(data || [])
    loading === true && setLoading(false)
  }

  const operationsFiltrees = operations.filter(op =>
    op.client_nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    op.type_activite.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (op.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (op.client_telephone || '').includes(searchTerm)
  )

  const totalBenefice = operationsFiltrees.reduce((acc, curr) => acc + curr.benefice, 0)

  // Rendu de l'icône de l'activité
  const renderIcon = (type: string) => {
    switch (type) {
      case 'BILLET': return <Plane className="text-blue-600" size={18} />
      case 'VISA': return <Globe className="text-purple-600" size={18} />
      case 'TRANSFERT': return <Coins className="text-amber-600" size={18} />
      default: return <Receipt className="text-teal-600" size={18} />
    }
  }

  // Rendu du badge de règlement
  const renderStatusBadge = (status: string, op: Operation) => {
    const reste = op.prix_vente - (op.montant_verse || 0)
    switch (status) {
      case 'PAYE':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-200">
            <CheckCircle2 size={12} /> Réglé
          </span>
        )
      case 'AVANCE':
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-orange-200">
              <Clock size={12} /> Avance
            </span>
            <span className="text-[9px] font-bold text-orange-600">Reste: {reste.toLocaleString()} F</span>
          </div>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-red-200">
            <XCircle size={12} /> Dette
          </span>
        )
    }
  }

  // Fonction d'exportation PDF via la fenêtre d'impression native avec styles journalistiques financiers (Format A4 Paysage)
  const exportToPdf = () => {
    if (operationsFiltrees.length === 0) {
      alert('Aucune donnée à exporter')
      return
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const htmlContent = `
      <html>
      <head>
        <title>JOURNAL DES OPÉRATIONS FINANCIÈRES</title>
        <style>
          @page { size: A4 landscape; margin: 15mm 10mm 15mm 10mm; }
          body { font-family: "Georgia", "Times New Roman", serif; color: #1f2937; margin: 0; padding: 0; background-color: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .container { width: 100%; margin: 0 auto; }
          
          /* En-tête style grand quotidien / revue financière */
          .journal-header { border-bottom: 3px double #111827; text-align: center; padding-bottom: 12px; margin-bottom: 25px; }
          .journal-meta { display: flex; justify-content: space-between; font-family: "Arial", sans-serif; font-size: 9pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #4b5563; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px; }
          .journal-title { font-family: "Times New Roman", serif; font-size: 28pt; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; color: #111827; margin: 0; }
          .journal-subtitle { font-family: "Arial", sans-serif; font-size: 10pt; font-weight: 500; color: #6b7280; margin-top: 5px; letter-spacing: 2px; text-transform: uppercase; }
          
          /* Structure du tableau financier */
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-family: "Arial", sans-serif; margin-top: 10px; }
          th { font-family: "Arial", sans-serif; font-weight: 700; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.5px; color: #111827; background-color: #f8fafc; border-top: 1.5px solid #111827; border-bottom: 1.5px solid #111827; padding: 10px 6px; text-align: left; }
          td { font-size: 9pt; padding: 10px 6px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; word-wrap: break-word; }
          
          /* Alignements et colonnes strictes pour format Paysage */
          .col-date { width: 9%; }
          .col-type { width: 10%; text-transform: uppercase; font-weight: bold; font-size: 8pt; color: #1e3a8a; }
          .col-client { width: 22%; }
          .col-desc { width: 25%; font-size: 8.5pt; color: #475569; line-height: 1.3; }
          .col-statut { width: 11%; text-align: center; }
          .col-montant { width: 11%; text-align: right; font-weight: 700; color: #0f172a; }
          .col-marge { width: 12%; text-align: right; font-weight: 700; }
          
          /* Typographies spécifiques du tableau */
          .client-title { font-weight: 700; color: #111827; font-size: 9.5pt; }
          .client-sub { font-size: 8pt; color: #64748b; margin-top: 2px; }
          .desc-meta { font-size: 8pt; font-style: italic; color: #2563eb; margin-top: 3px; font-weight: 500; }
          
          /* Signaux financiers discrets et pros */
          .badge-status { display: inline-block; padding: 3px 6px; border-radius: 4px; font-size: 7.5pt; font-weight: bold; text-align: center; letter-spacing: 0.5px; }
          .status-paye { background-color: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
          .status-avance { background-color: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; }
          .status-dette { background-color: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
          
          .marge-positive { color: #15803d; }
          .marge-negative { color: #b91c1c; }
          
          /* Ligne des totaux comptables */
          .total-row td { border-top: 1.5px solid #111827; border-bottom: 3px double #111827; font-family: "Arial", sans-serif; font-weight: bold; background-color: #f8fafc; padding: 14px 6px; }
          .total-label { text-align: right; font-size: 10pt; color: #111827; letter-spacing: 0.5px; }
          .total-value { text-align: right; font-size: 11pt; color: #15803d; }
          
          .journal-footer { margin-top: 35px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-family: "Arial", sans-serif; font-size: 7.5pt; color: #94a3b8; text-align: center; letter-spacing: 1px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="journal-header">
            <div class="journal-meta">
              <div>SECTION : OPÉRATIONS ET RENTABILITÉ</div>
              <div>ÉDITION DU : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
            <h1 class="journal-title">Journal de l'Agence</h1>
            <div class="journal-subtitle">Rapport Périodique des Flux Financiers & Marges Nettes</div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th class="col-date">Date</th>
                <th class="col-type">Activité</th>
                <th class="col-client">Client / Contact</th>
                <th class="col-desc">Désignation & Références</th>
                <th class="col-statut">Règlement</th>
                <th class="col-montant">C.A. (CFA)</th>
                <th class="col-marge">Marge (CFA)</th>
              </tr>
            </thead>
            <tbody>
              ${operationsFiltrees.map((op) => {
                const reste = op.prix_vente - (op.montant_verse || 0);
                const statusClass = op.statut_paiement === 'PAYE' ? 'status-paye' : op.statut_paiement === 'AVANCE' ? 'status-avance' : 'status-dette';
                const statusLabel = op.statut_paiement === 'PAYE' ? 'RÉGLÉ' : op.statut_paiement === 'AVANCE' ? 'AVANCE' : 'DETTE';
                const margeClass = op.benefice >= 0 ? 'marge-positive' : 'marge-negative';
                
                return `
                <tr>
                  <td>${new Date(op.created_at).toLocaleDateString('fr-FR')}</td>
                  <td class="col-type">${op.type_activite}</td>
                  <td>
                    <div class="client-title">${op.client_nom}</div>
                    ${op.client_telephone ? `<div class="client-sub">${op.client_telephone}</div>` : ''}
                  </td>
                  <td>
                    <div>${op.description || '-'}</div>
                    ${op.compagnie_fournisseur ? `<div class="desc-meta">${op.compagnie_fournisseur} ${op.reference_document ? `[${op.reference_document}]` : ''}</div>` : ''}
                  </td>
                  <td class="col-statut">
                    <span class="badge-status ${statusClass}">${statusLabel}</span>
                    ${op.statut_paiement === 'AVANCE' ? `<div style="font-size: 7.5pt; color: #c2410c; font-weight: bold; margin-top: 3px;">Solde : ${reste.toLocaleString('fr-FR')}</div>` : ''}
                  </td>
                  <td class="col-montant">${op.prix_vente.toLocaleString('fr-FR')}</td>
                  <td class="col-marge ${margeClass}">
                    ${op.benefice >= 0 ? '+' : ''}${op.benefice.toLocaleString('fr-FR')}
                  </td>
                </tr>
                `
              }).join('')}
              <tr class="total-row">
                <td colspan="5" class="total-label">BÉNÉFICE COMPTABLE NET GLOBAL</td>
                <td colspan="2" class="total-value">${totalBenefice.toLocaleString('fr-FR')} CFA</td>
              </tr>
            </tbody>
          </table>
          <div class="journal-footer">
            DOCUMENT FINANCIER CERTIFIÉ • SMART VISION MANAGEMENT ERP • CONFIDENTIEL
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `

    printWindow.document.write(htmlContent)
    printWindow.document.close()
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:py-8 px-4">
      <div className="max-w-6xl mx-auto">
        
        {/* EN-TÊTE ET GRILLE DE RÉSUMÉ */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 pt-4 md:pt-0">
          <div>
            <Link href="/selection" className="inline-flex items-center text-gray-500 hover:text-gray-900 font-bold mb-1 text-sm transition-colors">
              <ArrowLeft className="mr-1" size={16} />
              Menu Principal
            </Link>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight uppercase">Journal Financier</h1>
          </div>
          
          <div className="bg-white border border-gray-100 p-4 md:p-6 rounded-3xl shadow-sm flex items-center justify-between md:justify-start gap-4 w-full md:w-auto">
            <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Bénéfice Net Filtre</p>
              <p className="text-xl md:text-2xl font-black text-emerald-600">{totalBenefice.toLocaleString()} CFA</p>
            </div>
          </div>
        </div>

        {/* RECHERCHE ET ACTIONS */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <input 
              type="text"
              placeholder="Rechercher un client, téléphone, vol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-transparent bg-white font-bold text-sm focus:border-gray-950 outline-none shadow-sm transition-all"
            />
            <Search className="absolute left-4 top-4 text-gray-300" size={18} />
          </div>
          
          {/* Boutons visibles uniquement sur PC/Tablette */}
          <div className="hidden sm:flex gap-3">
            <button 
              onClick={exportToPdf}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-2 transition-all shadow-md"
            >
              <Download size={18} /> Imprimer Journal PDF
            </button>
            <Link href="/agence/nouvelle-operation" className="bg-gray-900 hover:bg-black text-white px-6 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-2 transition-all shadow-md">
              <Plus size={18} /> Nouvelle Vente
            </Link>
          </div>
        </div>

        {/* AFFICHAGE CONSOLE/MOBILE : CARTES NATIVES INDIVIDUELLES */}
        <div className="grid grid-cols-1 gap-3 sm:hidden">
          {loading ? (
            <div className="text-center py-12 text-sm font-bold text-gray-400 animate-pulse">Chargement en cours...</div>
          ) : operationsFiltrees.map((op) => (
            <div key={op.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                    {renderIcon(op.type_activite)}
                  </div>
                  <div>
                    <span className="text-xs font-black text-gray-900 uppercase tracking-tight block">{op.type_activite}</span>
                    <span className="text-[10px] font-bold text-gray-400">{new Date(op.created_at).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>
                {renderStatusBadge(op.statut_paiement, op)}
              </div>

              <div className="border-t border-b border-gray-50 py-2 space-y-1">
                <div className="font-black text-gray-900 text-sm">{op.client_nom}</div>
                {op.client_telephone && (
                  <a href={`tel:${op.client_telephone}`} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 active:text-blue-800">
                    <Phone size={12} /> {op.client_telephone}
                  </a>
                )}
                <div className="text-xs text-gray-500 line-clamp-2 font-medium">{op.description || 'Aucune description'}</div>
                {op.compagnie_fournisseur && (
                  <div className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                    <Briefcase size={10} /> {op.compagnie_fournisseur} {op.reference_document ? `(${op.reference_document})` : ''}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <div>
                  <span className="text-[9px] font-black text-gray-400 uppercase block tracking-wider">Prix Client</span>
                  <span className="text-sm font-black text-gray-900">{op.prix_vente.toLocaleString()} F</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black text-gray-400 uppercase block tracking-wider">Bénéfice</span>
                  <span className={`text-sm font-black ${op.benefice >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {op.benefice >= 0 ? '+' : ''}{op.benefice.toLocaleString()} F
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* AFFICHAGE GRAND ÉCRAN / TABLETTE : TABLEAU MODERNISÉ */}
        <div className="hidden sm:block bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-gray-50/70 border-b border-gray-200">
                <th className="w-[18%] px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Service / Date</th>
                <th className="w-[28%] px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client & Document</th>
                <th className="w-[22%] px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Règlement</th>
                <th className="w-[16%] px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Vente (CFA)</th>
                <th className="w-[16%] px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Marge (CFA)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-sm font-semibold text-gray-400 italic">Chargement des transactions...</td>
                </tr>
              ) : operationsFiltrees.map((op) => (
                <tr key={op.id} className="hover:bg-gray-50/50 transition-colors">
                  {/* SERVICE / DATE */}
                  <td className="px-6 py-4 vertical-align-middle">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-xl flex-shrink-0">
                        {renderIcon(op.type_activite)}
                      </div>
                      <div className="overflow-hidden">
                        <span className="block font-bold text-gray-900 text-xs tracking-wide uppercase truncate">{op.type_activite}</span>
                        <span className="block text-[11px] font-medium text-gray-400 mt-0.5">{new Date(op.created_at).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>
                  </td>

                  {/* CLIENT & DETAILS */}
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900 text-sm truncate">{op.client_nom}</div>
                    <div className="flex flex-col gap-0.5 mt-1 text-[11px]">
                      {op.client_telephone && (
                        <span className="font-medium text-gray-500 flex items-center gap-1">
                          <Phone size={10} className="text-gray-400" /> {op.client_telephone}
                        </span>
                      )}
                      {(op.compagnie_fournisseur || op.description) && (
                        <span className="text-gray-400 italic truncate max-w-full">
                          {op.compagnie_fournisseur ? `${op.compagnie_fournisseur} ` : ''}
                          {op.reference_document ? `(${op.reference_document}) ` : ''}
                          {op.description ? `• ${op.description}` : ''}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* REGLEMENT */}
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex-shrink-0">
                        {renderStatusBadge(op.statut_paiement, op)}
                      </div>
                      <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        {op.mode_paiement.replace('_', ' ')}
                      </span>
                    </div>
                  </td>

                  {/* VENTE */}
                  <td className="px-6 py-4 text-right font-bold text-gray-900 text-sm">
                    {op.prix_vente.toLocaleString()}
                  </td>

                  {/* MARGE / BENEFICE */}
                  <td className="px-6 py-4 text-right">
                    <span className={`font-bold text-sm ${op.benefice >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {op.benefice >= 0 ? '+' : ''}{op.benefice.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CAS DE LISTE VIDE */}
        {!loading && operationsFiltrees.length === 0 && (
          <div className="py-16 text-center text-xs font-black text-gray-400 uppercase tracking-widest bg-white rounded-3xl border border-gray-100 shadow-sm mt-4">
            Aucune transaction trouvée
          </div>
        )}

        {/* FLOATING ACTION BUTTON (FAB) MOBILE — Style App Native Optimisé */}
        <div className="sm:hidden fixed bottom-20 right-4 flex flex-col gap-3 z-50">
          <button 
            onClick={exportToPdf}
            className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform"
            title="Imprimer Journal PDF"
          >
            <Download size={16} />
          </button>
          <Link 
            href="/agence/nouvelle-operation" 
            className="w-12 h-12 bg-gray-955 bg-gray-950 text-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform"
          >
            <Plus size={16} />
          </Link>
        </div>

      </div>
    </div>
  )
}