'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Search, Phone, MessageSquare, Filter, 
  UserCheck, Send, Layers, Copy, Check,
  X, CheckCircle, AlertCircle, Award, Users, TrendingUp
} from 'lucide-react'

// Structure exacte de votre table operations_agence
type OperationAgence = {
  id: string
  created_at: string
  type_activite: string
  client_nom: string
  description: string | null
  prix_achat: number | null
  prix_vente: number | null
  mode_paiement: string | null
  statut_paiement: string | null
  user_id: string | null
  client_telephone: string | null
  compagnie_fournisseur: string | null
  reference_document: string | null
  frais_annexes: number | null
  montant_verse: number | null
  benefice: number | null
}

type ClientContact = {
  id: string
  nom_complet: string
  telephone: string
  dernier_service: string
  total_transactions: number
  montant_total: number
  derniere_interaction: string
  statut_segment: 'VIP' | 'Fidèle' | 'Nouveau'
  user_id?: string | null
}

type WhatsAppState = {
  isOpen: boolean
  message: string
  isSending: boolean
  error: string | null
  success: boolean
}

export default function ContactClientPage() {
  const [contacts, setContacts] = useState<ClientContact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedService, setSelectedService] = useState<string>('Tous')
  const [selectedSegment, setSelectedSegment] = useState<string>('Tous')
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
  const [whatsAppState, setWhatsAppState] = useState<WhatsAppState>({
    isOpen: false,
    message: "Bonjour {nom}, l'agence Al-Bouraq vous remercie pour votre confiance ! Nous avons de nouvelles opportunités pour votre prochain voyage.",
    isSending: false,
    error: null,
    success: false
  })

  // Récupération des données réelles depuis la table operations_agence
  useEffect(() => {
    async function fetchOperations() {
      try {
        setLoading(true)
        
        const { data: operations, error } = await supabase
          .from('operations_agence')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error

        if (!operations || operations.length === 0) {
          setContacts([])
          return
        }

        // Agrégation intelligente par téléphone (identifiant unique de contact)
        const clientMap = new Map<string, {
          operations: OperationAgence[]
          total_transactions: number
          dernier_service: string
          derniere_interaction: string
          montant_total: number
        }>()

        operations.forEach((op: OperationAgence) => {
          const key = op.client_telephone?.trim() || op.client_nom?.trim()
          if (!key) return

          if (!clientMap.has(key)) {
            clientMap.set(key, {
              operations: [],
              total_transactions: 0,
              dernier_service: op.type_activite,
              derniere_interaction: op.created_at,
              montant_total: 0
            })
          }

          const clientData = clientMap.get(key)!
          clientData.operations.push(op)
          clientData.total_transactions++
          
          if (new Date(op.created_at) > new Date(clientData.derniere_interaction)) {
            clientData.derniere_interaction = op.created_at
            clientData.dernier_service = op.type_activite
          }
          
          if (op.prix_vente) {
            clientData.montant_total += Number(op.prix_vente)
          }
        })

        // Conversion et segmentation automatique basée sur la valeur client
        const clients: ClientContact[] = Array.from(clientMap.entries()).map(([key, data]) => {
          const firstOp = data.operations[0]
          
          let statut_segment: 'VIP' | 'Fidèle' | 'Nouveau' = 'Nouveau'
          if (data.total_transactions >= 3 || data.montant_total >= 1500000) {
            statut_segment = 'VIP'
          } else if (data.total_transactions >= 2) {
            statut_segment = 'Fidèle'
          }

          return {
            id: key,
            nom_complet: firstOp.client_nom || 'Client Anonyme',
            telephone: firstOp.client_telephone || '',
            dernier_service: data.dernier_service,
            total_transactions: data.total_transactions,
            montant_total: data.montant_total,
            derniere_interaction: new Date(data.derniere_interaction).toLocaleDateString('fr-FR'),
            statut_segment,
            user_id: firstOp.user_id
          }
        })

        // On ne garde que les fiches disposant d'un numéro de téléphone valide
        setContacts(clients.filter(c => c.telephone && c.telephone.trim().length > 3))
      } catch (err) {
        console.error('Erreur de chargement des données réelles:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchOperations()
  }, [])

  // Filtrage combiné (Recherche + Service + Segment de fidélité)
  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      const matchesSearch = contact.nom_complet.toLowerCase().includes(search.toLowerCase()) || 
                            contact.telephone.includes(search)
      const matchesService = selectedService === 'Tous' || contact.dernier_service === selectedService
      const matchesSegment = selectedSegment === 'Tous' || contact.statut_segment === selectedSegment
      return matchesSearch && matchesService && matchesSegment
    })
  }, [contacts, search, selectedService, selectedSegment])

  // Statistiques calculées en temps réel
  const stats = useMemo(() => {
    const totalClients = filteredContacts.length
    const vipCount = filteredContacts.filter(c => c.statut_segment === 'VIP').length
    const chiffreAffaire = filteredContacts.reduce((sum, c) => sum + c.montant_total, 0)
    const panierMoyen = totalClients > 0 ? Math.round(chiffreAffaire / totalClients) : 0
    
    return { totalClients, vipCount, panierMoyen }
  }, [filteredContacts])

  const toggleSelectAll = () => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([])
    } else {
      setSelectedContacts(filteredContacts.map(c => c.id))
    }
  }

  const toggleSelectContact = (id: string) => {
    setSelectedContacts(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const handleCopyPhone = (id: string, phone: string) => {
    navigator.clipboard.writeText(phone)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Envoi WhatsApp groupé fluide avec remplacement dynamique du prénom/nom
  const sendWhatsAppMessages = async () => {
    const selectedClients = filteredContacts.filter(c => selectedContacts.includes(c.id))
    if (selectedClients.length === 0) return

    setWhatsAppState(prev => ({ ...prev, isSending: true, error: null, success: false }))
    let failCount = 0

    for (const client of selectedClients) {
      try {
        const cleanPhone = client.telephone.replace(/\s+/g, '').replace('+', '')
        // Remplacement dynamique de la variable {nom} par le vrai nom du client
        const customizedMessage = whatsAppState.message.replace(/{nom}/g, client.nom_complet)
        const encodedMessage = encodeURIComponent(customizedMessage)
        
        window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank')
        await new Promise(resolve => setTimeout(resolve, 400))
      } catch (err) {
        failCount++
      }
    }

    setWhatsAppState(prev => ({ 
      ...prev, 
      isSending: false, 
      success: true,
      error: failCount > 0 ? `${failCount} envoi(s) incomplets` : null
    }))

    setTimeout(() => {
      setWhatsAppState(prev => ({ ...prev, isOpen: false, success: false }))
      setSelectedContacts([])
    }, 2500)
  }

  const getIndividualWhatsAppLink = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/\s+/g, '').replace('+', '')
    const msg = encodeURIComponent(`Bonjour ${name}, l'agence Al-Bouraq reste à votre entière disposition. Avez-vous de nouveaux projets de voyage ?`)
    return `https://wa.me/${cleanPhone}?text=${msg}`
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-32 md:pb-12">
      
      {/* Header collant optimisé desktop et mobile */}
      <div className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-xs backdrop-blur-md bg-white/95 px-4 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <UserCheck size={20} />
              </span>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">Base Contacts Clients</h1>
            </div>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5">
              {contacts.length} fiches qualifiées extraites de vos factures et flux d'opérations.
            </p>
          </div>

          {selectedContacts.length > 0 && (
            <button 
              onClick={() => setWhatsAppState(prev => ({ ...prev, isOpen: true }))}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-100"
            >
              <Send size={14} />
              Campagne WhatsApp ({selectedContacts.length})
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6">
        
        {/* Cartes de statistiques globales (KPIs) */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><Users size={18} /></div>
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase">Clients filtrés</p>
              <p className="text-lg font-bold text-slate-800">{stats.totalClients}</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0"><Award size={18} /></div>
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase">Comptes VIP</p>
              <p className="text-lg font-bold text-slate-800">{stats.vipCount}</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs col-span-2 md:col-span-1 flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0"><TrendingUp size={18} /></div>
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase">Panier Moyen Estimé</p>
              <p className="text-lg font-bold text-slate-800">{stats.panierMoyen.toLocaleString('fr-FR')} FCFA</p>
            </div>
          </div>
        </div>

        {/* Barre d'outils et de filtres avancés */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col gap-4 mb-6">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Rechercher par nom complet ou numéro de téléphone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-900"
            />
          </div>

          {/* Filtres multi-critères horizontaux réponsifs */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium mr-2 flex items-center gap-1"><Filter size={12}/> Services:</span>
              {['Tous', 'Billet d\'avion', 'Visa', 'Hajj', 'Umrah', 'Location'].map((service) => (
                <button
                  key={service}
                  onClick={() => setSelectedService(service)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all border ${
                    selectedService === service ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {service}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium mr-2 flex items-center gap-1"><Layers size={12}/> Segments:</span>
              {['Tous', 'VIP', 'Fidèle', 'Nouveau'].map((seg) => (
                <button
                  key={seg}
                  onClick={() => setSelectedSegment(seg)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all border ${
                    selectedSegment === seg ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {seg}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section d'affichage des listes */}
        {loading ? (
          <div className="text-center py-16 text-slate-400">
            <div className="w-9 h-9 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium">Analyse et regroupement des données réelles...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 px-4">
            <AlertCircle size={32} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">Aucun profil client trouvé</p>
            <p className="text-xs text-slate-400 mt-0.5">Modifiez vos filtres de recherche ou vérifiez vos transactions Supabase.</p>
          </div>
        ) : (
          <>
            {/* Vue d'affichage Desktop (Tableau Pro) */}
            <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                    <th className="py-4 px-6 w-12">
                      <input 
                        type="checkbox" 
                        checked={selectedContacts.length === filteredContacts.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 h-4 w-4 accent-indigo-600 cursor-pointer"
                      />
                    </th>
                    <th className="py-4 px-6">Identité Client</th>
                    <th className="py-4 px-6">Téléphone</th>
                    <th className="py-4 px-6">Catégorie</th>
                    <th className="py-4 px-6">Volume d'Achat</th>
                    <th className="py-4 px-6">Dernière Activité</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {filteredContacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-4 px-6">
                        <input 
                          type="checkbox" 
                          checked={selectedContacts.includes(contact.id)}
                          onChange={() => toggleSelectContact(contact.id)}
                          className="rounded border-slate-300 text-indigo-600 h-4 w-4 accent-indigo-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-6 font-bold text-slate-900">{contact.nom_complet}</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2 font-mono text-slate-600">
                          {contact.telephone}
                          <button onClick={() => handleCopyPhone(contact.id, contact.telephone)} className="text-slate-400 hover:text-slate-600 transition-colors">
                            {copiedId === contact.id ? <Check size={14} className="text-green-600"/> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                          contact.statut_segment === 'VIP' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                          contact.statut_segment === 'Fidèle' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                          'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {contact.statut_segment}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-medium">
                        <div>{contact.total_transactions} transaction(s)</div>
                        <div className="text-xs text-slate-400">{contact.montant_total.toLocaleString('fr-FR')} FCFA</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                          {contact.dernier_service}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <a href={`tel:${contact.telephone}`} className="p-2 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 border border-slate-200 rounded-xl transition-all" title="Appeler">
                            <Phone size={14} />
                          </a>
                          <a href={getIndividualWhatsAppLink(contact.telephone, contact.nom_complet)} target="_blank" rel="noopener noreferrer" className="p-2 bg-slate-50 hover:bg-green-50 text-slate-600 hover:text-green-600 border border-slate-200 rounded-xl transition-all" title="WhatsApp">
                            <MessageSquare size={14} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Vue Mobile native tactile et ultra-fluide */}
            <div className="grid grid-cols-1 gap-3 lg:hidden">
              {filteredContacts.map((contact) => (
                <div 
                  key={contact.id} 
                  className={`bg-white p-4 rounded-2xl border transition-all active:scale-[0.99] ${
                    selectedContacts.includes(contact.id) ? 'border-indigo-500 bg-indigo-50/10 shadow-xs' : 'border-slate-200/60 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div onClick={() => toggleSelectContact(contact.id)} className="flex items-start gap-3 cursor-pointer flex-1">
                      <input 
                        type="checkbox" 
                        checked={selectedContacts.includes(contact.id)}
                        onChange={() => {}} 
                        className="rounded border-slate-300 text-indigo-600 h-4 w-4 mt-1 accent-indigo-600 shrink-0"
                      />
                      <div>
                        <h3 className="font-bold text-slate-900 leading-snug">{contact.nom_complet}</h3>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">{contact.telephone}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase shrink-0 ${
                      contact.statut_segment === 'VIP' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                      contact.statut_segment === 'Fidèle' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                      'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {contact.statut_segment}
                    </span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div>
                      <span>Activité : </span>
                      <span className="font-bold text-slate-800">{contact.dernier_service}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-800">{contact.total_transactions} op.</span>
                      <span className="text-[10px] text-slate-400 block">{contact.montant_total.toLocaleString('fr-FR')} F</span>
                    </div>
                  </div>

                  {/* Boutons d'action mobiles natifs de grande taille */}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <a href={`tel:${contact.telephone}`} className="flex items-center justify-center gap-2 py-3 bg-slate-50 active:bg-slate-100 border border-slate-200/80 text-slate-700 rounded-xl text-xs font-bold transition-all text-center">
                      <Phone size={14} className="text-emerald-600" />
                      Appeler
                    </a>
                    <a href={getIndividualWhatsAppLink(contact.telephone, contact.nom_complet)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-3 bg-slate-50 active:bg-slate-100 border border-slate-200/80 text-slate-700 rounded-xl text-xs font-bold transition-all text-center">
                      <MessageSquare size={14} className="text-green-600" />
                      WhatsApp
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Fenêtre Modale d'envoi WhatsApp Marketing */}
      {whatsAppState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare size={20} className="text-emerald-600" />
                <h3 className="font-bold text-slate-900">Envoi Groupé Assisté</h3>
              </div>
              <button onClick={() => setWhatsAppState(prev => ({ ...prev, isOpen: false }))} className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Destinataires sélectionnés ({selectedContacts.length}) :
                </p>
                <div className="max-h-24 overflow-y-auto bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs space-y-1">
                  {filteredContacts.filter(c => selectedContacts.includes(c.id)).map(client => (
                    <div key={client.id} className="text-slate-600 flex justify-between">
                      <span className="font-medium">• {client.nom_complet}</span>
                      <span className="font-mono text-slate-400">{client.telephone}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Modèle de Message :
                </label>
                <textarea
                  value={whatsAppState.message}
                  onChange={(e) => setWhatsAppState(prev => ({ ...prev, message: e.target.value }))}
                  rows={4}
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none text-slate-800"
                  placeholder="Votre texte promotionnel..."
                />
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-indigo-600 bg-indigo-50/50 px-2.5 py-1.5 rounded-lg font-medium">
                  <span className="font-bold bg-white px-1 py-0.5 rounded border text-[10px]">{`{nom}`}</span>
                  <span>Sera remplacé automatiquement par le nom complet du client.</span>
                </div>
              </div>

              {whatsAppState.error && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-medium">
                  <AlertCircle size={14} />
                  {whatsAppState.error}
                </div>
              )}

              {whatsAppState.success && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2 text-emerald-700 text-xs font-bold">
                  <CheckCircle size={14} />
                  Files d'attente WhatsApp prêtes !
                </div>
              )}
            </div>

            <div className="flex gap-3 p-4 border-t border-slate-100 shrink-0 bg-slate-50/50 rounded-b-2xl">
              <button onClick={() => setWhatsAppState(prev => ({ ...prev, isOpen: false }))} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors">
                Fermer
              </button>
              <button
                onClick={sendWhatsAppMessages}
                disabled={whatsAppState.isSending}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {whatsAppState.isSending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Traitement...
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    Lancer les fenêtres
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}