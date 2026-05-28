'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Save, 
  Wallet, 
  Plane, 
  Globe, 
  Receipt, 
  FileText, 
  User, 
  Layers, 
  CheckCircle, 
  Clock, 
  XCircle,
  Coins
} from 'lucide-react'
import Link from 'next/link'

export default function NouvelleOperation() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  
  // Formulaire enrichi avec plus d'options et détails
  const [formData, setFormData] = useState({
    type_activite: 'BILLET',
    client_nom: '',
    client_telephone: '',
    description: '',
    
    // Détails métiers ajoutés
    compagnie_fournisseur: '', 
    reference_document: '', // N° Billet, N° Passeport, ou Réf Transfert
    
    // Finances détaillées
    prix_achat: 0,
    prix_vente: 0,
    frais_annexes: 0, // Taxes ou frais sup agence
    
    // Règlement
    mode_paiement: 'ESPECES',
    statut_paiement: 'PAYE',
    montant_verse: 0
  })

  // Calcul automatique du bénéfice incluant les frais annexes
  const beneficePrevu = formData.prix_vente - formData.prix_achat - formData.frais_annexes
  // Calcul du reste à payer si paiement partiel
  const resteAPayer = formData.prix_vente - formData.montant_verse

  // Synchronisation automatique du montant versé si le statut est "PAYE"
  useEffect(() => {
    if (formData.statut_paiement === 'PAYE') {
      setFormData(prev => ({ ...prev, montant_verse: prev.prix_vente }))
    } else if (formData.statut_paiement === 'NON_PAYE') {
      setFormData(prev => ({ ...prev, montant_verse: 0 }))
    }
  }, [formData.statut_paiement, formData.prix_vente])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Calcul final du bénéfice injecté avant l'envoi à Supabase
    const payload = {
      ...formData,
      benefice: beneficePrevu
    }

    const { error } = await supabase
      .from('operations_agence')
      .insert([payload])

    if (!error) {
      router.push('/agence/dashboard')
    } else {
      alert("Erreur lors de l'enregistrement : " + error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32 sm:pb-12">
      
      {/* STICKY TOP BAR (Style App Native) */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-4 sm:py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/agence/dashboard" className="flex items-center text-gray-500 hover:text-gray-900 font-bold transition-colors p-1">
            <ArrowLeft className="mr-1.5 sm:mr-2" size={20} />
            <span className="text-sm sm:text-base">Retour</span>
          </Link>
          <h1 className="text-base sm:text-2xl font-black text-gray-900 uppercase tracking-tight">
            Nouvelle Opération
          </h1>
          <div className="w-16 sm:w-20"></div> {/* Équilibreur visuel */}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 sm:mt-6">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          
          {/* OPTION 1 : SÉLECTEUR TACTILE DE SERVICE (UX SMARTPHONE) */}
          <div className="bg-white p-4 sm:p-8 rounded-3xl border border-gray-100 shadow-sm">
            <label className="block text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
              Type de Service
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {[
                { id: 'BILLET', label: 'Billet Avion', icon: Plane, color: 'bg-blue-600' },
                { id: 'VISA', label: 'Visa / Séjour', icon: Globe, color: 'bg-purple-600' },
                { id: 'TRANSFERT', label: 'Transfert', icon: Coins, color: 'bg-amber-600' },
                { id: 'ASSURANCE', label: 'Assurance', icon: Receipt, color: 'bg-teal-600' },
              ].map((item) => {
                const Icon = item.icon
                const isSelected = formData.type_activite === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFormData({...formData, type_activite: item.id})}
                    className={`flex flex-col items-center justify-center p-3 sm:p-5 rounded-2xl font-black text-xs transition-all border-2 ${
                      isSelected 
                        ? `${item.color} text-white border-transparent shadow-md scale-[1.02]` 
                        : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100 active:scale-95'
                    }`}
                  >
                    <Icon size={22} className={`mb-1.5 ${isSelected ? 'text-white' : 'text-gray-400'}`} />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* OPTION 2 : INFORMATIONS DU CLIENT & RÉFÉRENCES */}
          <div className="bg-white p-5 sm:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
              <User size={16} className="text-gray-400" />
              <h2 className="text-xs font-black text-gray-900 uppercase tracking-wider">Informations Client & Dossier</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Nom complet du client</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Moussa Diarra"
                  className="w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-gray-900 focus:bg-white rounded-xl outline-none font-bold text-sm transition-all"
                  value={formData.client_nom}
                  onChange={(e) => setFormData({...formData, client_nom: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">N° de Téléphone</label>
                <input
                  type="tel"
                  placeholder="Ex: +223 70 00 00 00"
                  className="w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-gray-900 focus:bg-white rounded-xl outline-none font-bold text-sm transition-all"
                  value={formData.client_telephone}
                  onChange={(e) => setFormData({...formData, client_telephone: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Compagnie / Fournisseur</label>
                <input
                  type="text"
                  placeholder="Ex: Air France, Turkish Airlines..."
                  className="w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-gray-900 focus:bg-white rounded-xl outline-none font-bold text-sm transition-all"
                  value={formData.compagnie_fournisseur}
                  onChange={(e) => setFormData({...formData, compagnie_fournisseur: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">N° de Billet / Réf. Dossier</label>
                <input
                  type="text"
                  placeholder="Ex: TK-23948203"
                  className="w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-gray-900 focus:bg-white rounded-xl outline-none font-bold text-sm transition-all"
                  value={formData.reference_document}
                  onChange={(e) => setFormData({...formData, reference_document: e.target.value})}
                />
              </div>

              <div className="sm:col-span-full">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Description libre / Itinéraire</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Vol Aller-Retour Bamako-Paris (Classe Éco)"
                  className="w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-gray-900 focus:bg-white rounded-xl outline-none font-bold text-sm transition-all resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* OPTION 3 : COMPTABILITÉ FINANCIÈRE (LIQUIDITÉ) */}
          <div className="bg-white p-5 sm:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
              <Layers size={16} className="text-gray-400" />
              <h2 className="text-xs font-black text-gray-900 uppercase tracking-wider">Données Financières (CFA)</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black text-red-500 uppercase tracking-widest mb-1.5">Coût Achat Agence</label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    className="w-full p-3.5 pl-10 bg-gray-50 border-2 border-transparent focus:border-red-500 focus:bg-white rounded-xl outline-none font-black text-base transition-all"
                    onChange={(e) => setFormData({...formData, prix_achat: Number(e.target.value.replace(/\D/g, ''))})}
                  />
                  <Wallet className="absolute left-3.5 top-4 text-gray-300" size={18} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1.5">Frais Annexes / Visa</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    className="w-full p-3.5 pl-10 bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-xl outline-none font-black text-base transition-all"
                    onChange={(e) => setFormData({...formData, frais_annexes: Number(e.target.value.replace(/\D/g, ''))})}
                  />
                  <FileText className="absolute left-3.5 top-4 text-gray-300" size={18} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1.5">Prix de Vente Client</label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    className="w-full p-3.5 pl-10 bg-gray-50 border-2 border-transparent focus:border-emerald-500 focus:bg-white rounded-xl outline-none font-black text-base transition-all"
                    onChange={(e) => setFormData({...formData, prix_vente: Number(e.target.value.replace(/\D/g, ''))})}
                  />
                  <Coins className="absolute left-3.5 top-4 text-gray-300" size={18} />
                </div>
              </div>
            </div>

            {/* WIDGET : BÉNÉFICE COMPTABLE */}
            <div className={`p-4 rounded-2xl flex items-center justify-between transition-colors ${beneficePrevu >= 0 ? 'bg-emerald-50/70 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Marge bénéficiaire nette</span>
                <span className="text-xs text-gray-400 font-medium">Calculé en temps réel</span>
              </div>
              <span className={`text-xl sm:text-2xl font-black ${beneficePrevu >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {beneficePrevu.toLocaleString()} CFA
              </span>
            </div>
          </div>

          {/* OPTION 4 : REGLEMENT ET MODES DE PAIEMENT */}
          <div className="bg-white p-5 sm:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
              <Receipt size={16} className="text-gray-400" />
              <h2 className="text-xs font-black text-gray-900 uppercase tracking-wider">Règlement & Encaissement</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Statut du Paiement</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'PAYE', label: 'Payé', icon: CheckCircle, color: 'text-emerald-600 border-emerald-200 bg-emerald-50' },
                    { id: 'AVANCE', label: 'Avance', icon: Clock, color: 'text-orange-600 border-orange-200 bg-orange-50' },
                    { id: 'NON_PAYE', label: 'Dette', icon: XCircle, color: 'text-red-600 border-red-200 bg-red-50' },
                  ].map((status) => {
                    const StatusIcon = status.icon
                    const isSelected = formData.statut_paiement === status.id
                    return (
                      <button
                        key={status.id}
                        type="button"
                        onClick={() => setFormData({...formData, statut_paiement: status.id})}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl font-bold text-xs border transition-all ${
                          isSelected ? status.color + ' border-current scale-[1.02]' : 'bg-gray-50 text-gray-500 border-transparent'
                        }`}
                      >
                        <StatusIcon size={16} className="mb-1" />
                        {status.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Mode de Versement</label>
                <select
                  className="w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-gray-900 focus:bg-white rounded-xl outline-none font-bold text-sm transition-all appearance-none"
                  value={formData.mode_paiement}
                  onChange={(e) => setFormData({...formData, mode_paiement: e.target.value})}
                >
                  <option value="ESPECES">Espèces (Caisse)</option>
                  <option value="ORANGE_MONEY">Orange Money</option>
                  <option value="MOOV_MONEY">Moov Money</option>
                  <option value="VIREMENT">Virement / Chèque</option>
                </select>
              </div>

              {formData.statut_paiement === 'AVANCE' && (
                <div className="sm:col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 animate-fadeIn">
                  <div>
                    <label className="block text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1.5">Montant perçu ce jour</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Indiquez l'acompte"
                      className="w-full p-3.5 bg-gray-50 border-2 border-orange-300 focus:border-orange-500 focus:bg-white rounded-xl outline-none font-black text-sm transition-all"
                      onChange={(e) => setFormData({...formData, montant_verse: Number(e.target.value.replace(/\D/g, ''))})}
                    />
                  </div>
                  <div className="p-4 bg-orange-50/60 rounded-xl flex items-center justify-between text-orange-800 text-xs font-bold">
                    <span>Reste dû par le client :</span>
                    <span className="text-base font-black">{resteAPayer.toLocaleString()} CFA</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BOUTON ENREGISTRER - Version Bureau */}
          <button
            type="submit"
            disabled={loading}
            className="hidden sm:flex w-full bg-gray-900 hover:bg-black text-white p-5 rounded-2xl font-black uppercase tracking-widest items-center justify-center gap-3 transition-all shadow-xl disabled:opacity-50 active:scale-98"
          >
            {loading ? "Traitement de l'opération..." : (
              <>
                <Save size={20} />
                Enregistrer l'opération
              </>
            )}
          </button>

          {/* BARRE DE VALIDATION FLOTTANTE MOBILE (UX Type Application Bancaire) */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-[0_-8px_24px_rgba(0,0,0,0.04)] z-40 sm:hidden">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 active:bg-black text-white py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? "Enregistrement..." : (
                <>
                  <Save size={18} />
                  Valider l'opération
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}