'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  FileText, Upload, Trash2, FolderPlus, Loader2, 
  CheckCircle, ExternalLink, Building2, X, Search, 
  ShieldCheck, FolderLock, Plus, HardDrive, Calendar, Tag
} from 'lucide-react'

export default function PageDocuments() {
  // États Globaux
  const [activeTab, setActiveTab] = useState<'admin_req' | 'internal_vault'>('admin_req')
  const [sections, setSections] = useState<any[]>([])
  const [userProfile, setUserProfile] = useState<any>(null)
  const [agences, setAgences] = useState<any[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // États Admin Général
  const [newSectionName, setNewSectionName] = useState('')
  const [viewingSection, setViewingSection] = useState<any>(null)
  const [allAgenciesDocs, setAllAgenciesDocs] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  // NOUVEAUX ÉTATS : Coffre-fort Interne Agence
  const [internalDocs, setInternalDocs] = useState<any[]>([])
  const [searchInternal, setSearchInternal] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Tous')
  const [uploadingInternal, setUploadingInternal] = useState(false)
  const [customCategory, setCustomCategory] = useState('Passeports')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, agences(nom_agence)')
      .eq('id', user.id)
      .single()
    
    setUserProfile(profile)

    // Charger les types de documents demandés par l'admin global
    const { data: secs } = await supabase
      .from('types_documents')
      .select('*')
      .order('created_at', { ascending: true })
    setSections(secs || [])

    if (profile?.role === 'admin') {
      const { data: ags } = await supabase.from('agences').select('*').order('nom_agence', { ascending: true })
      setAgences(ags || [])
      const { data: allFiles } = await supabase.from('documents_agence_files').select('*, agences(nom_agence)')
      setAllAgenciesDocs(allFiles || [])
    } else if (profile?.agence_id) {
      // Documents officiels envoyés à l'admin
      const { data: files } = await supabase
        .from('documents_agence_files')
        .select('*')
        .eq('agence_id', profile.agence_id)
      setUploadedFiles(files || [])

      // NOUVEAU: Charger les documents du coffre-fort interne de l'agence
      const { data: intFiles } = await supabase
        .from('documents_internes_agence')
        .select('*')
        .eq('agence_id', profile.agence_id)
        .order('created_at', { ascending: false })
      setInternalDocs(intFiles || [])
    }
    setLoading(false)
  }

  // Fonctions Admin Global
  async function createSection() {
    if (!newSectionName) return
    const { error } = await supabase.from('types_documents').insert([{ nom_section: newSectionName }])
    if (error) alert("Erreur lors de la création")
    else {
      setNewSectionName('')
      fetchData()
    }
  }

  // Upload Document Officiel (Pour l'admin général)
  async function handleUpload(e: any, sectionId: string) {
    const file = e.target.files[0]
    if (!file || !userProfile?.agence_id) return
    setUploadingId(sectionId)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const filePath = `officiels/${userProfile.agence_id}/${sectionId}/${fileName}`
      
      const { error: storageError } = await supabase.storage.from('documents_agences').upload(filePath, file)
      if (storageError) throw storageError
      
      const { error: dbError } = await supabase.from('documents_agence_files').insert([{
        agence_id: userProfile.agence_id,
        type_doc_id: sectionId,
        file_url: filePath,
        file_name: file.name
      }])
      if (dbError) throw dbError
      fetchData()
    } catch (error: any) {
      alert("Erreur : " + error.message)
    } finally {
      setUploadingId(null)
    }
  }

  // NOUVEAU : Upload dans le Coffre-fort Interne de l'Agence
  async function handleUploadInternal(e: any) {
    const file = e.target.files[0]
    if (!file || !userProfile?.agence_id) return
    setUploadingInternal(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const filePath = `internes/${userProfile.agence_id}/${customCategory}/${fileName}`

      const { error: storageError } = await supabase.storage.from('documents_agences').upload(filePath, file)
      if (storageError) throw storageError

      const { error: dbError } = await supabase.from('documents_internes_agence').insert([{
        agence_id: userProfile.agence_id,
        nom_fichier: file.name,
        url_stockage: filePath,
        categorie: customCategory
      }])
      if (dbError) throw dbError
      fetchData()
    } catch (error: any) {
      alert("Erreur coffre-fort : " + error.message)
    } finally {
      setUploadingInternal(false)
    }
  }

  // NOUVEAU : Suppression d'un document interne de son coffre-fort
  async function deleteInternalDoc(docId: string, filePath: string) {
    if (!confirm("Voulez-vous vraiment supprimer ce document de vos archives ?")) return
    try {
      await supabase.storage.from('documents_agences').remove([filePath])
      await supabase.from('documents_internes_agence').delete().eq('id', docId)
      fetchData()
    } catch (error: any) {
      alert("Erreur suppression : " + error.message)
    }
  }

  // Filtres de recherche
  const filteredAgences = agences.filter(agence => 
    agence.nom_agence.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredInternalDocs = internalDocs.filter(doc => {
    const matchesSearch = doc.nom_fichier.toLowerCase().includes(searchInternal.toLowerCase())
    const matchesCategory = selectedCategory === 'Tous' || doc.categorie === selectedCategory
    return matchesSearch && matchesCategory
  })

  if (loading) return <div className="p-20 text-center font-black text-slate-400 animate-pulse text-xs uppercase tracking-widest">Chargement sécurisé...</div>

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 bg-slate-50/40 min-h-screen">
      
      {/* EN-TÊTE PREMIUM DYNAMIQUE */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-100/50 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight uppercase">Classement Numérique</h1>
          <p className="text-blue-600 font-black tracking-widest text-[10px] uppercase mt-1 flex items-center gap-1.5">
            {userProfile?.role === 'admin' ? (
              <><ShieldCheck size={14} /> Direction Générale Centrale</>
            ) : (
              <><Building2 size={14} /> {userProfile?.agences?.nom_agence || "Espace Agence Partenaire"}</>
            )}
          </p>
        </div>

        {/* CONTRE-BOUTON RETOUR POUR ADMIN */}
        {viewingSection && (
          <button 
            onClick={() => { setViewingSection(null); setSearchTerm(''); }} 
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-rose-50 text-rose-600 px-5 py-3 rounded-xl font-black text-xs hover:bg-rose-600 hover:text-white transition-all uppercase shadow-2xs"
          >
            <X size={16} /> Quitter le suivi
          </button>
        )}

        {/* SÉLECTEUR D'ONGLETS TYPE MOBILE (Invisible si Admin Général regarde les dépôts) */}
        {!viewingSection && userProfile?.role !== 'admin' && (
          <div className="flex p-1 bg-slate-100 rounded-xl w-full sm:w-auto shadow-inner">
            <button 
              onClick={() => setActiveTab('admin_req')}
              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'admin_req' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400'}`}
            >
              <ShieldCheck size={14} /> Requis Admin
            </button>
            <button 
              onClick={() => setActiveTab('internal_vault')}
              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'internal_vault' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-400'}`}
            >
              <FolderLock size={14} /> Mon Coffre-fort
            </button>
          </div>
        )}
      </div>

      {/* VUE TECHNIQUE : SUIVI DES DEPOTS DES AGENCES (ADMIN GENERAL) */}
      {viewingSection ? (
        <div className="bg-white rounded-[2.2rem] p-5 md:p-8 border border-slate-100 shadow-2xl shadow-slate-200/40 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                <Building2 size={18} />
              </div>
              <div>
                <h2 className="text-base font-black uppercase text-slate-800">{viewingSection.nom_section}</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">État des réceptions agences</p>
              </div>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" placeholder="Rechercher une agence..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {filteredAgences.map(agence => {
              const file = allAgenciesDocs.find(f => f.agence_id === agence.id && f.type_doc_id === viewingSection.id)
              return (
                <div key={agence.id} className="flex flex-row justify-between items-center p-4 bg-white rounded-2xl border border-slate-100 shadow-2xs hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${file ? 'bg-emerald-500 shadow-sm' : 'bg-rose-400 animate-pulse'}`} />
                    <span className="font-black text-slate-800 uppercase text-xs tracking-tight">{agence.nom_agence}</span>
                  </div>
                  {file ? (
                    <button 
                      onClick={() => window.open(supabase.storage.from('documents_agences').getPublicUrl(file.file_url).data.publicUrl, '_blank')}
                      className="bg-slate-900 text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-wider flex items-center gap-1.5 hover:bg-blue-600 transition-colors"
                    >
                      <ExternalLink size={12} /> Voir
                    </button>
                  ) : (
                    <span className="text-[9px] font-black text-rose-500 uppercase bg-rose-50 px-2.5 py-1 rounded-md">Manquant</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          {/* ONGLET 1 : EXIGENCES DE L'ADMINISTRATION */}
          {activeTab === 'admin_req' && (
            <div className="space-y-6">
              {/* ZONE SUPÉRIEURE POUR ADMIN : ACTIONS AJOUT CRITÈRE */}
              {userProfile?.role === 'admin' && (
                <div className="bg-white p-4 md:p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-1.5 block tracking-widest">Exiger un nouveau document officiel aux agences</label>
                    <input 
                      value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)}
                      placeholder="Ex: Agrément IATA, Statuts d'entreprise..." 
                      className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 text-xs text-slate-800"
                    />
                  </div>
                  <button onClick={createSection} className="w-full sm:w-auto bg-slate-950 text-white px-6 h-[52px] rounded-2xl hover:bg-blue-600 transition shadow-lg font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2">
                    <FolderPlus size={18} /> Ajouter l'exigence
                  </button>
                </div>
              )}

              {/* GRILLE DÉPÔTS OBLIGATOIRES */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sections.map((section) => {
                  const existingFile = uploadedFiles.find(f => f.type_doc_id === section.id)
                  return (
                    <div key={section.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-2xs flex flex-col justify-between hover:border-blue-300 transition-all">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-50 text-slate-700 rounded-xl flex items-center justify-center border border-slate-100">
                            <FileText size={20} />
                          </div>
                          <div>
                            <h3 className="font-black text-slate-800 uppercase text-xs tracking-tight leading-tight">{section.nom_section}</h3>
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Dossier Obligatoire</p>
                          </div>
                        </div>
                        {existingFile && <CheckCircle className="text-emerald-500" size={22} />}
                      </div>

                      {userProfile?.role !== 'admin' ? (
                        <div className="space-y-3">
                          {existingFile && (
                            <div className="bg-emerald-50/50 p-3 rounded-xl flex justify-between items-center border border-emerald-100/50">
                              <span className="text-[10px] font-bold text-emerald-800 truncate max-w-[160px] italic">{existingFile.file_name}</span>
                              <button onClick={() => window.open(supabase.storage.from('documents_agences').getPublicUrl(existingFile.file_url).data.publicUrl, '_blank')} className="text-blue-600 p-1 hover:scale-110 transition">
                                <ExternalLink size={14} />
                              </button>
                            </div>
                          )}
                          <label className={`block w-full border-2 border-dashed p-4 rounded-xl text-center cursor-pointer transition-all ${uploadingId === section.id ? 'bg-blue-50 border-blue-400' : 'border-slate-100 bg-slate-50/30 hover:bg-blue-50/40 hover:border-blue-300'}`}>
                            {uploadingId === section.id ? <Loader2 className="animate-spin mx-auto text-blue-600 w-4 h-4" /> : (
                              <div className="flex items-center justify-center gap-2">
                                <Upload size={14} className="text-slate-400" />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Téléverser</span>
                              </div>
                            )}
                            <input type="file" className="hidden" onChange={(e) => handleUpload(e, section.id)} disabled={uploadingId !== null} />
                          </label>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setViewingSection(section)}
                          className="w-full bg-blue-50 text-blue-600 py-3 rounded-xl font-black text-[10px] hover:bg-blue-600 hover:text-white transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
                        >
                          <Building2 size={14} /> Consulter les envois
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ONGLET 2 : LE COFFRE-FORT INTERNE PERSO DE L'AGENCE */}
          {activeTab === 'internal_vault' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* PANNEAU DE CRÉATION ET RECHERCHE INTERNE */}
              <div className="bg-white p-5 md:p-6 rounded-[2.2rem] border border-slate-100 shadow-xl shadow-slate-100/40 grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* BLOC MULTI-FONCTION NOUVEAU STRATÉGIQUE */}
                <div className="lg:col-span-5 space-y-3 bg-slate-50/60 p-4 rounded-2xl border border-slate-100">
                  <span className="text-[9px] font-black uppercase text-blue-600 tracking-widest bg-blue-50 px-2 py-0.5 rounded-md inline-block">Archivage Automatique</span>
                  <h4 className="text-xs font-black uppercase text-slate-800">Ajouter un document au coffre</h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Catégorie cible</label>
                      <select 
                        value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 outline-none"
                      >
                        <option value="Passeports">Passeports Clients</option>
                        <option value="Billets">Billets d'avion</option>
                        <option value="Factures">Factures & Reçus</option>
                        <option value="Visas">Dossiers Visas</option>
                        <option value="Autres">Autres pièces</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <label className={`w-full flex items-center justify-center gap-2 border border-blue-200 bg-white text-blue-600 p-2 rounded-lg cursor-pointer text-[11px] font-black uppercase transition-all hover:bg-blue-50 ${uploadingInternal ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingInternal ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} 
                        Sélectionner
                        <input type="file" className="hidden" onChange={handleUploadInternal} disabled={uploadingInternal} />
                      </label>
                    </div>
                  </div>
                </div>

                {/* FILTRES ET SYNCHRONISATION */}
                <div className="lg:col-span-7 flex flex-col justify-between gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input 
                        type="text" placeholder="Rechercher dans mes archives..." value={searchInternal} onChange={(e) => setSearchInternal(e.target.value)}
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Tag size={14} className="text-slate-400 flex-shrink-0" />
                      <select 
                        value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full p-3 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 outline-none"
                      >
                        <option value="Tous">Filtrer par Catégorie (Toutes)</option>
                        <option value="Passeports">Passeports Clients</option>
                        <option value="Billets">Billets d'avion</option>
                        <option value="Factures">Factures & Reçus</option>
                        <option value="Visas">Dossiers Visas</option>
                        <option value="Autres">Autres pièces</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-blue-50/40 border border-blue-100 p-3 rounded-xl flex items-center gap-3">
                    <HardDrive size={20} className="text-blue-600 flex-shrink-0" />
                    <p className="text-[10px] font-bold text-slate-500 leading-tight">
                      Cet espace vous est propre. Les documents téléversés ici ne sont pas visibles par l'administration générale, sauf si vous décidez de les partager.
                    </p>
                  </div>
                </div>

              </div>

              {/* TABLEAU / COMPOSANT DES ARCHIVES DYNAMIQUE */}
              <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-2xs">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fichier archivé ({filteredInternalDocs.length})</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider hidden sm:block">Date d'ajout</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {filteredInternalDocs.length > 0 ? (
                    filteredInternalDocs.map((doc) => (
                      <div key={doc.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                        
                        {/* INFOS NOM ET CATEGORIE */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black text-[10px] uppercase flex-shrink-0">
                            {doc.categorie.substring(0,2)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate">{doc.nom_fichier}</p>
                            <span className="text-[9px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded mt-1 inline-block uppercase tracking-wider">
                              📁 {doc.categorie}
                            </span>
                          </div>
                        </div>

                        {/* DATE ET BOUTONS ACTIONS */}
                        <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-none pt-2 sm:pt-0">
                          <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1 sm:mr-4">
                            <Calendar size={12} />
                            {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => window.open(supabase.storage.from('documents_agences').getPublicUrl(doc.url_stockage).data.publicUrl, '_blank')}
                              className="p-2 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 rounded-lg transition-colors"
                              title="Ouvrir le fichier"
                            >
                              <ExternalLink size={14} />
                            </button>
                            <button 
                              onClick={() => deleteInternalDoc(doc.id, doc.url_stockage)}
                              className="p-2 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 rounded-lg transition-colors"
                              title="Supprimer définitivement"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center text-slate-400 font-bold uppercase text-xs tracking-wider italic">
                      Aucun document trouvé dans vos archives internes.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </>
      )}

    </div>
  )
}