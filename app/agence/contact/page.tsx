'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { 
  Search, Phone, MessageSquare, Filter, 
  UserCheck, Send, Layers, Copy, Check,
  X, CheckCircle, AlertCircle, Award, Users, TrendingUp,
  Moon, Sun
} from 'lucide-react'

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
  
  // 🌓 GESTION DU THÈME SOMBRE
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

  const [whatsAppState, setWhatsAppState] = useState<WhatsAppState>({
    isOpen: false,
    message: "Bonjour {nom}, l'agence vous remercie pour votre confiance ! Nous avons de nouvelles opportunités pour votre prochain voyage.",
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

        // Agrégation par téléphone
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

        setContacts(clients.filter(c => c.telephone && c.telephone.trim().length > 3))
      } catch (err) {
        console.error('Erreur de chargement des données réelles:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchOperations()
  }, [])

  // Filtrage combiné
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

  // Envoi WhatsApp groupé
  const sendWhatsAppMessages = async () => {
    const selectedClients = filteredContacts.filter(c => selectedContacts.includes(c.id))
    if (selectedClients.length === 0) return

    setWhatsAppState(prev => ({ ...prev, isSending: true, error: null, success: false }))
    let failCount = 0

    for (const client of selectedClients) {
      try {
        const cleanPhone = client.telephone.replace(/\s+/g, '').replace('+', '')
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
    const msg = encodeURIComponent(`Bonjour ${name}, l'agence reste à votre entière disposition. Avez-vous de nouveaux projets de voyage ?`)
    return `https://wa.me/${cleanPhone}?text=${msg}`
  }

  return (
    <div className={`min-h-screen pb-32 md:pb-12 transition-colors duration-150 ${
      isDark ? 'bg-[#000000] text-[#F5F5F7]' : 'bg-slate-50 text-slate-900'
    }`}>
      
      {/* ─── HEADER FIXE ─── */}
      <div className={`border-b sticky top-0 z-30 backdrop-blur-md px-4 py-4 md:px-8 transition-colors ${
        isDark ? 'bg-[#161618]/90 border-[#2C2C2E]' : 'bg-white/95 border-slate-200/80 shadow-xs'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`p-2 rounded-xl ${
                isDark ? 'bg-[#2C2C2E] text-[#BF5AF2]' : 'bg-indigo-50 text-indigo-600'
              }`}>
                <UserCheck size={20} />
              </span>
              <h1 className={`text-xl md:text-2xl font-black tracking-tight ${
                isDark ? 'text-[#F5F5F7]' : 'text-slate-900'
              }`}>Base Contacts Clients</h1>
            </div>
            <p className={`text-xs md:text-sm mt-0.5 ${isDark ? 'text-[#8E8E93]' : 'text-slate-500'}`}>
              {contacts.length} fiches qualifiées extraites de vos factures et flux d'opérations.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* 🌓 Bouton Thème Sombre */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                isDark 
                  ? 'bg-[#2C2C2E] border-[#38383A] text-[#FFD60A] hover:bg-[#3A3A3C]' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-xs'
              }`}
              title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
            >
              {isDark ? <Sun size={15} className="text-[#FFD60A]" /> : <Moon size={15} className="text-slate-600" />}
              <span className="hidden sm:inline">{isDark ? 'Mode clair' : 'Mode sombre'}</span>
            </button>

            {selectedContacts.length > 0 && (
              <button 
                onClick={() => setWhatsAppState(prev => ({ ...prev, isOpen: true }))}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-[#34C759] hover:bg-[#30B750] text-black rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <Send size={14} />
                Campagne WhatsApp ({selectedContacts.length})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 space-y-6">
        
        {/* Cartes de statistiques globales (KPIs) */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <div className={`p-4 rounded-2xl border flex items-center gap-3 transition-colors ${
            isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-100 shadow-xs'
          }`}>
            <div className={`p-2.5 rounded-xl shrink-0 ${isDark ? 'bg-[#2C2C2E] text-[#0A84FF]' : 'bg-indigo-50 text-indigo-600'}`}><Users size={18} /></div>
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>Clients filtrés</p>
              <p className={`text-lg font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{stats.totalClients}</p>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border flex items-center gap-3 transition-colors ${
            isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-100 shadow-xs'
          }`}>
            <div className={`p-2.5 rounded-xl shrink-0 ${isDark ? 'bg-[#2C2C2E] text-[#FF9F0A]' : 'bg-amber-50 text-amber-600'}`}><Award size={18} /></div>
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>Comptes VIP</p>
              <p className={`text-lg font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{stats.vipCount}</p>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border col-span-2 md:col-span-1 flex items-center gap-3 transition-colors ${
            isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-100 shadow-xs'
          }`}>
            <div className={`p-2.5 rounded-xl shrink-0 ${isDark ? 'bg-[#2C2C2E] text-[#34C759]' : 'bg-emerald-50 text-emerald-600'}`}><TrendingUp size={18} /></div>
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>Panier Moyen Estimé</p>
              <p className={`text-lg font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{stats.panierMoyen.toLocaleString('fr-FR')} FCFA</p>
            </div>
          </div>
        </div>

        {/* Barre d'outils et de filtres avancés */}
        <div className={`p-4 rounded-2xl border space-y-4 transition-colors ${
          isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-100 shadow-xs'
        }`}>
          <div className="relative w-full">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`} size={16} />
            <input
              type="text"
              placeholder="Rechercher par nom complet ou numéro de téléphone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none border transition-colors ${
                isDark
                  ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7] placeholder:text-[#636366] focus:border-[#545458]'
                  : 'bg-slate-50 border-slate-200 focus:border-indigo-500 focus:bg-white text-slate-900'
              }`}
            />
          </div>

          {/* Filtres multi-critères horizontaux réponsifs */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`font-semibold mr-2 flex items-center gap-1 ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>
                <Filter size={12}/> Services:
              </span>
              {['Tous', 'Billet d\'avion', 'Visa', 'Hajj', 'Umrah', 'Location', 'Transfert'].map((service) => (
                <button
                  key={service}
                  onClick={() => setSelectedService(service)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all border cursor-pointer ${
                    selectedService === service 
                      ? (isDark ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF]' : 'bg-slate-900 text-white border-slate-900') 
                      : (isDark ? 'bg-[#2C2C2E] text-[#8E8E93] border-[#38383A] hover:text-[#F5F5F7]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
                  }`}
                >
                  {service}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`font-semibold mr-2 flex items-center gap-1 ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>
                <Layers size={12}/> Segments:
              </span>
              {['Tous', 'VIP', 'Fidèle', 'Nouveau'].map((seg) => (
                <button
                  key={seg}
                  onClick={() => setSelectedSegment(seg)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all border cursor-pointer ${
                    selectedSegment === seg 
                      ? (isDark ? 'bg-[#0A84FF] text-white border-[#0A84FF]' : 'bg-indigo-600 text-white border-indigo-600') 
                      : (isDark ? 'bg-[#2C2C2E] text-[#8E8E93] border-[#38383A] hover:text-[#F5F5F7]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
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
            <div className={`w-9 h-9 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4 ${
              isDark ? 'border-[#34C759]' : 'border-indigo-600'
            }`} />
            <p className="text-sm font-medium">Analyse et regroupement des données réelles...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className={`text-center py-16 rounded-2xl border border-dashed px-4 ${
            isDark ? 'bg-[#121214] border-[#2C2C2E]' : 'bg-white border-slate-200'
          }`}>
            <AlertCircle size={32} className={`mx-auto mb-2 ${isDark ? 'text-[#38383A]' : 'text-slate-300'}`} />
            <p className={`text-sm font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-600'}`}>Aucun profil client trouvé</p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>Modifiez vos filtres de recherche ou vérifiez vos transactions.</p>
          </div>
        ) : (
          <>
            {/* Vue d'affichage Desktop (Tableau Pro) */}
            <div className={`hidden lg:block rounded-2xl border overflow-hidden transition-colors ${
              isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-100 shadow-xs'
            }`}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b text-[11px] font-bold tracking-wider uppercase ${
                    isDark ? 'bg-[#121214] border-[#2C2C2E] text-[#8E8E93]' : 'bg-slate-50/80 border-slate-100 text-slate-400'
                  }`}>
                    <th className="py-4 px-6 w-12">
                      <input 
                        type="checkbox" 
                        checked={selectedContacts.length === filteredContacts.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 h-4 w-4 accent-indigo-600 cursor-pointer"
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
                <tbody className={`divide-y text-sm ${
                  isDark ? 'divide-[#2C2C2E] text-[#F5F5F7]' : 'divide-slate-100 text-slate-700'
                }`}>
                  {filteredContacts.map((contact) => (
                    <tr key={contact.id} className={`transition-colors ${
                      isDark ? 'hover:bg-[#2C2C2E]/40' : 'hover:bg-slate-50/40'
                    }`}>
                      <td className="py-4 px-6">
                        <input 
                          type="checkbox" 
                          checked={selectedContacts.includes(contact.id)}
                          onChange={() => toggleSelectContact(contact.id)}
                          className="rounded border-slate-300 h-4 w-4 accent-indigo-600 cursor-pointer"
                        />
                      </td>
                      <td className={`py-4 px-6 font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>{contact.nom_complet}</td>
                      <td className="py-4 px-6">
                        <div className={`flex items-center gap-2 font-mono ${isDark ? 'text-[#8E8E93]' : 'text-slate-600'}`}>
                          {contact.telephone}
                          <button onClick={() => handleCopyPhone(contact.id, contact.telephone)} className={`transition-colors cursor-pointer ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}>
                            {copiedId === contact.id ? <Check size={14} className="text-[#34C759]"/> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                          contact.statut_segment === 'VIP' 
                            ? (isDark ? 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30' : 'bg-amber-50 text-amber-700 border-amber-100')
                            : contact.statut_segment === 'Fidèle' 
                            ? (isDark ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30' : 'bg-indigo-50 text-indigo-700 border-indigo-100')
                            : (isDark ? 'bg-[#2C2C2E] text-[#8E8E93] border-[#38383A]' : 'bg-slate-50 text-slate-600 border-slate-200')
                        }`}>
                          {contact.statut_segment}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-medium">
                        <div>{contact.total_transactions} transaction(s)</div>
                        <div className={`text-xs ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>{contact.montant_total.toLocaleString('fr-FR')} FCFA</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                          isDark ? 'bg-[#2C2C2E] text-[#D1D1D6]' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {contact.dernier_service}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <a 
                            href={`tel:${contact.telephone}`} 
                            className={`p-2 border rounded-xl transition-all ${
                              isDark 
                                ? 'bg-[#2C2C2E] border-[#38383A] text-[#8E8E93] hover:text-[#34C759] hover:border-[#34C759]/30' 
                                : 'bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 border-slate-200'
                            }`} 
                            title="Appeler"
                          >
                            <Phone size={14} />
                          </a>
                          <a 
                            href={getIndividualWhatsAppLink(contact.telephone, contact.nom_complet)} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className={`p-2 border rounded-xl transition-all ${
                              isDark 
                                ? 'bg-[#2C2C2E] border-[#38383A] text-[#8E8E93] hover:text-[#34C759] hover:border-[#34C759]/30' 
                                : 'bg-slate-50 hover:bg-green-50 text-slate-600 hover:text-green-600 border-slate-200'
                            }`} 
                            title="WhatsApp"
                          >
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
                  className={`p-4 rounded-2xl border transition-all active:scale-[0.99] ${
                    selectedContacts.includes(contact.id) 
                      ? (isDark ? 'border-[#34C759] bg-[#34C759]/10' : 'border-indigo-500 bg-indigo-50/10')
                      : (isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-200/60 shadow-xs')
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div onClick={() => toggleSelectContact(contact.id)} className="flex items-start gap-3 cursor-pointer flex-1">
                      <input 
                        type="checkbox" 
                        checked={selectedContacts.includes(contact.id)}
                        onChange={() => {}} 
                        className="rounded border-slate-300 h-4 w-4 mt-1 accent-indigo-600 shrink-0"
                      />
                      <div>
                        <h3 className={`font-bold leading-snug ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>{contact.nom_complet}</h3>
                        <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>{contact.telephone}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase shrink-0 ${
                      contact.statut_segment === 'VIP' 
                        ? (isDark ? 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30' : 'bg-amber-50 text-amber-700 border-amber-100')
                        : contact.statut_segment === 'Fidèle' 
                        ? (isDark ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30' : 'bg-indigo-50 text-indigo-700 border-indigo-100')
                        : (isDark ? 'bg-[#2C2C2E] text-[#8E8E93] border-[#38383A]' : 'bg-slate-50 text-slate-600 border-slate-200')
                    }`}>
                      {contact.statut_segment}
                    </span>
                  </div>

                  <div className={`mt-3 pt-3 border-t flex items-center justify-between text-xs ${
                    isDark ? 'border-[#2C2C2E] text-[#8E8E93]' : 'border-slate-100 text-slate-500'
                  }`}>
                    <div>
                      <span>Activité : </span>
                      <span className={`font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{contact.dernier_service}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-800'}`}>{contact.total_transactions} op.</span>
                      <span className={`text-[10px] block ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>{contact.montant_total.toLocaleString('fr-FR')} F</span>
                    </div>
                  </div>

                  {/* Boutons d'action mobiles */}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <a 
                      href={`tel:${contact.telephone}`} 
                      className={`flex items-center justify-center gap-2 py-3 border rounded-xl text-xs font-bold transition-all text-center ${
                        isDark 
                          ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' 
                          : 'bg-slate-50 active:bg-slate-100 border-slate-200/80 text-slate-700'
                      }`}
                    >
                      <Phone size={14} className={isDark ? 'text-[#34C759]' : 'text-emerald-600'} />
                      Appeler
                    </a>
                    <a 
                      href={getIndividualWhatsAppLink(contact.telephone, contact.nom_complet)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className={`flex items-center justify-center gap-2 py-3 border rounded-xl text-xs font-bold transition-all text-center ${
                        isDark 
                          ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7]' 
                          : 'bg-slate-50 active:bg-slate-100 border-slate-200/80 text-slate-700'
                      }`}
                    >
                      <MessageSquare size={14} className="text-[#34C759]" />
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
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className={`rounded-t-3xl sm:rounded-2xl max-w-lg w-full shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[90vh] mb-[calc(5rem+env(safe-area-inset-bottom))] sm:mb-0 flex flex-col border ${
            isDark ? 'bg-[#1C1C1E] border-[#2C2C2E]' : 'bg-white border-slate-100'
          }`}>
            <div className={`flex items-center justify-between p-4 border-b shrink-0 ${
              isDark ? 'border-[#2C2C2E]' : 'border-slate-100'
            }`}>
              <div className="flex items-center gap-2">
                <MessageSquare size={20} className="text-[#34C759]" />
                <h3 className={`font-bold ${isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}`}>Envoi Groupé Assisté</h3>
              </div>
              <button 
                onClick={() => setWhatsAppState(prev => ({ ...prev, isOpen: false }))} 
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isDark ? 'bg-[#2C2C2E] text-[#8E8E93] hover:text-[#F5F5F7]' : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                  isDark ? 'text-[#8E8E93]' : 'text-slate-400'
                }`}>
                  Destinataires sélectionnés ({selectedContacts.length}) :
                </p>
                <div className={`max-h-24 overflow-y-auto border rounded-xl p-2.5 text-xs space-y-1 ${
                  isDark ? 'bg-[#121214] border-[#2C2C2E]' : 'bg-slate-50 border-slate-100'
                }`}>
                  {filteredContacts.filter(c => selectedContacts.includes(c.id)).map(client => (
                    <div key={client.id} className="flex justify-between">
                      <span className={`font-medium ${isDark ? 'text-[#D1D1D6]' : 'text-slate-600'}`}>• {client.nom_complet}</span>
                      <span className={`font-mono ${isDark ? 'text-[#8E8E93]' : 'text-slate-400'}`}>{client.telephone}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                  isDark ? 'text-[#8E8E93]' : 'text-slate-400'
                }`}>
                  Modèle de Message :
                </label>
                <textarea
                  value={whatsAppState.message}
                  onChange={(e) => setWhatsAppState(prev => ({ ...prev, message: e.target.value }))}
                  rows={4}
                  className={`w-full p-3 border rounded-xl text-sm outline-none resize-none transition-colors ${
                    isDark 
                      ? 'bg-[#2C2C2E] border-[#38383A] text-[#F5F5F7] placeholder:text-[#636366] focus:border-[#545458]' 
                      : 'border-slate-200 text-slate-800 focus:border-indigo-500'
                  }`}
                  placeholder="Votre texte promotionnel..."
                />
                <div className={`flex items-center gap-1.5 mt-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium ${
                  isDark ? 'bg-[#0A84FF]/15 text-[#0A84FF]' : 'bg-indigo-50/50 text-indigo-600'
                }`}>
                  <span className={`font-bold px-1 py-0.5 rounded border text-[10px] ${
                    isDark ? 'bg-[#2C2C2E] border-[#38383A] text-white' : 'bg-white border-slate-200'
                  }`}>{`{nom}`}</span>
                  <span>Sera remplacé automatiquement par le nom complet du client.</span>
                </div>
              </div>

              {whatsAppState.error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-500 text-xs font-medium">
                  <AlertCircle size={14} />
                  {whatsAppState.error}
                </div>
              )}

              {whatsAppState.success && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-500 text-xs font-bold">
                  <CheckCircle size={14} />
                  Files d'attente WhatsApp prêtes !
                </div>
              )}
            </div>

            <div className={`flex gap-3 p-4 border-t shrink-0 rounded-b-2xl ${
              isDark ? 'border-[#2C2C2E] bg-[#161618]' : 'border-slate-100 bg-slate-50/50'
            }`}>
              <button 
                onClick={() => setWhatsAppState(prev => ({ ...prev, isOpen: false }))} 
                className={`flex-1 py-3 border rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  isDark ? 'border-[#38383A] text-[#8E8E93] bg-[#2C2C2E] hover:bg-[#38383A]' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                }`}
              >
                Fermer
              </button>
              <button
                onClick={sendWhatsAppMessages}
                disabled={whatsAppState.isSending}
                className="flex-1 py-3 bg-[#34C759] hover:bg-[#30B750] disabled:opacity-40 text-black rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                {whatsAppState.isSending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
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