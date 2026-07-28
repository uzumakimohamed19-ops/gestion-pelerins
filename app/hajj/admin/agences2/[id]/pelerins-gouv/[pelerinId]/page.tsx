'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { getPassportPublicUrl } from '@/lib/hajjPassport'
import { Loader2, ArrowLeft, User, Mail, Phone, MapPin, Calendar, FileCheck, CheckCircle2, XCircle, Shield, Globe, Image, Syringe, Stethoscope, BookOpen, Hotel, Plane } from 'lucide-react'
import Link from 'next/link'

interface Pelerin {
  id: string
  prenom?: string
  nom_complet?: string
  num_passeport?: string
  date_naissance?: string
  date_expiration?: string
  genre?: string
  sexe?: string
  telephone_pelerin?: string
  email?: string
  nationalite?: string
  adresse_pelerin?: string
  lieu_naissance?: string
  document_url?: string
  sur_plateforme_gouv?: boolean
  sur_plateforme_nusuk?: boolean
  reference?: string
  created_at?: string
  agences?: { nom_agence?: string }
  visite_medicale?: boolean
  vacciné?: boolean
  vaccination_fievre_jaune?: boolean
  formation_suivie?: boolean
  date_formation?: string
  groupe_formation?: string
  hotel_mecque?: string
  hotel_statut?: string
  groupe_encadrement?: string
  date_depart?: string
  date_retour?: string
  visa_obtenu?: boolean
}

export default function PelerinProfilPage({ params }: { params: Promise<{ id: string; pelerinId: string }> }) {
  const resolvedParams = use(params)
  const agenceId = resolvedParams.id
  const pelerinId = resolvedParams.pelerinId

  const [pelerin, setPelerin] = useState<Pelerin | null>(null)
  const [agence, setAgence] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPelerinProfil = async () => {
      setLoading(true)

      // Récupérer les informations du pèlerin
      const { data: pelerinData } = await supabase
        .from('pelerins')
        .select('*, agences(nom_agence)')
        .eq('id', pelerinId)
        .single()

      // Récupérer les informations de l'agence
      const { data: agenceData } = await supabase
        .from('agences')
        .select('*')
        .eq('id', agenceId)
        .single()

      setPelerin(pelerinData)
      setAgence(agenceData)
      setLoading(false)
    }

    if (pelerinId && agenceId) {
      fetchPelerinProfil()
    }
  }, [pelerinId, agenceId])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    )
  }

  const passportUrl = getPassportPublicUrl(pelerin?.document_url)

  if (!pelerin) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Link href={`/hajj/admin/agences2/${agenceId}/pelerins-gouv`} className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500 hover:text-gray-900 transition-colors mb-6">
          <ArrowLeft size={16} /> Retour à la liste
        </Link>
        <div className="bg-white p-10 rounded-3xl border border-gray-100 shadow-sm text-center">
          <p className="text-gray-400 font-bold text-sm uppercase">Pèlerin non trouvé</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-500">
        <Link href={`/hajj/admin/agences2`} className="hover:text-gray-900 transition-colors">
          Agences
        </Link>
        <span>/</span>
        <Link href={`/hajj/admin/agences2/${agenceId}`} className="hover:text-gray-900 transition-colors">
          {agence?.nom_agence || 'Agence'}
        </Link>
        <span>/</span>
        <Link href={`/hajj/admin/agences2/${agenceId}/pelerins-gouv`} className="hover:text-gray-900 transition-colors">
          Pèlerins GOUV
        </Link>
        <span>/</span>
        <span className="text-gray-900">{pelerin.prenom} {pelerin.nom_complet}</span>
      </div>

      {/* Bouton Retour */}
      <Link
        href={`/hajj/admin/agences2/${agenceId}/pelerins-gouv`}
        className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={16} /> Retour à la liste des pèlerins GOUV
      </Link>

      {/* En-tête du Profil */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center text-2xl font-black text-blue-600 shrink-0">
            {(pelerin.prenom?.[0] || '?').toUpperCase()}
          </div>

          {/* Infos Principale */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-black text-gray-900 uppercase">
                {pelerin.prenom} {pelerin.nom_complet}
              </h1>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black">
                ✓ GOUV Validé
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 font-semibold flex-wrap">
              <span className="flex items-center gap-1">
                <Building2Icon size={14} /> {agence?.nom_agence || 'Agence'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={14} /> Inscrit le {pelerin.created_at ? new Date(pelerin.created_at).toLocaleDateString('fr-FR') : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Statuts Plateforme */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`p-4 rounded-2xl border ${pelerin.sur_plateforme_gouv ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={16} className={pelerin.sur_plateforme_gouv ? 'text-emerald-600' : 'text-gray-400'} />
            <p className={`text-xs font-black uppercase tracking-wider ${pelerin.sur_plateforme_gouv ? 'text-emerald-700' : 'text-gray-500'}`}>
              Plateforme GOUV
            </p>
          </div>
          <p className={`text-sm font-black ${pelerin.sur_plateforme_gouv ? 'text-emerald-900' : 'text-gray-700'}`}>
            {pelerin.sur_plateforme_gouv ? 'Validé' : 'Non validé'}
          </p>
        </div>

        <div className={`p-4 rounded-2xl border ${pelerin.sur_plateforme_nusuk ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Globe size={16} className={pelerin.sur_plateforme_nusuk ? 'text-purple-600' : 'text-gray-400'} />
            <p className={`text-xs font-black uppercase tracking-wider ${pelerin.sur_plateforme_nusuk ? 'text-purple-700' : 'text-gray-500'}`}>
              Portail Nusuk
            </p>
          </div>
          <p className={`text-sm font-black ${pelerin.sur_plateforme_nusuk ? 'text-purple-900' : 'text-gray-700'}`}>
            {pelerin.sur_plateforme_nusuk ? 'Inscrit' : 'Non inscrit'}
          </p>
        </div>

        <div className={`p-4 rounded-2xl border ${pelerin.document_url ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <FileCheck size={16} className={pelerin.document_url ? 'text-blue-600' : 'text-gray-400'} />
            <p className={`text-xs font-black uppercase tracking-wider ${pelerin.document_url ? 'text-blue-700' : 'text-gray-500'}`}>
              Dossier Complet
            </p>
          </div>
          <p className={`text-sm font-black ${pelerin.document_url ? 'text-blue-900' : 'text-gray-700'}`}>
            {pelerin.document_url ? 'Uploadé' : 'Manquant'}
          </p>
        </div>
      </div>

      {/* Section Identité */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-900 uppercase mb-4 flex items-center gap-2">
            <User size={18} /> Identité Civile
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Prénom</p>
              <p className="text-sm font-black text-gray-900">{pelerin.prenom || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Nom Complet</p>
              <p className="text-sm font-black text-gray-900">{pelerin.nom_complet || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Sexe</p>
              <p className="text-sm font-black text-gray-900">{pelerin.sexe || pelerin.genre || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Date de Naissance</p>
              <p className="text-sm font-black text-gray-900">
                {pelerin.date_naissance ? new Date(pelerin.date_naissance).toLocaleDateString('fr-FR') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Lieu de Naissance</p>
              <p className="text-sm font-black text-gray-900">{pelerin.lieu_naissance || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Nationalité</p>
              <p className="text-sm font-black text-gray-900">{pelerin.nationalite || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Section Passeport */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-900 uppercase mb-4 flex items-center gap-2">
            <Shield size={18} /> Passeport
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">N° Passeport</p>
              <p className="text-sm font-mono font-black text-gray-900">{pelerin.num_passeport || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Date d'Expiration</p>
              <p className="text-sm font-black text-gray-900">
                {pelerin.date_expiration ? new Date(pelerin.date_expiration).toLocaleDateString('fr-FR') : '—'}
              </p>
            </div>
          </div>
          
          {/* Photo du Passeport */}
          {pelerin.document_url && (
            <div className="mt-6 p-4 bg-gray-50 rounded-2xl border border-gray-200">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Scan du Passeport</p>
              <div className="relative w-full max-w-md mx-auto">
                <img
                  src={passportUrl || ''}
                  alt="Passeport"
                  className="w-full rounded-lg border border-gray-300 shadow-sm"
                  onError={(e) => {
                    e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNFNUU3RUIiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzk0QTNCOCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vbiB0cm91dsOpZTwvdGV4dD48L3N2Zz4='
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section Contact */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-900 uppercase mb-4 flex items-center gap-2">
            <Phone size={18} /> Coordonnées
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Téléphone</p>
              <p className="text-sm font-black text-gray-900">{pelerin.telephone_pelerin || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Email</p>
              <p className="text-sm font-black text-gray-900">{pelerin.email || '—'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Adresse</p>
              <p className="text-sm font-black text-gray-900">{pelerin.adresse_pelerin || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Section Santé et Vaccinations */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-900 uppercase mb-4 flex items-center gap-2">
            <Stethoscope size={18} /> Santé et Vaccinations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Visité Médical</p>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                   style={{ backgroundColor: pelerin.visite_medicale ? '#ecfdf5' : '#f3f4f6', color: pelerin.visite_medicale ? '#059669' : '#6b7280' }}>
                {pelerin.visite_medicale ? '✓ Oui' : '✗ Non'}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Vacciné</p>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                   style={{ backgroundColor: pelerin.vacciné ? '#ecfdf5' : '#f3f4f6', color: pelerin.vacciné ? '#059669' : '#6b7280' }}>
                {pelerin.vacciné ? '✓ Oui' : '✗ Non'}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Fièvre Jaune</p>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                   style={{ backgroundColor: pelerin.vaccination_fievre_jaune ? '#ecfdf5' : '#f3f4f6', color: pelerin.vaccination_fievre_jaune ? '#059669' : '#6b7280' }}>
                {pelerin.vaccination_fievre_jaune ? '✓ Oui' : '✗ Non'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Formation */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-900 uppercase mb-4 flex items-center gap-2">
            <BookOpen size={18} /> Formation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Formation Suivie</p>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                   style={{ backgroundColor: pelerin.formation_suivie ? '#ecfdf5' : '#f3f4f6', color: pelerin.formation_suivie ? '#059669' : '#6b7280' }}>
                {pelerin.formation_suivie ? '✓ Oui' : '✗ Non'}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Date Formation</p>
              <p className="text-sm font-black text-gray-900">
                {pelerin.date_formation ? new Date(pelerin.date_formation).toLocaleDateString('fr-FR') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Groupe Formation</p>
              <p className="text-sm font-black text-gray-900">{pelerin.groupe_formation || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Section Hébergement */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-900 uppercase mb-4 flex items-center gap-2">
            <Hotel size={18} /> Hébergement
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Hôtel à la Mecque</p>
              <p className="text-sm font-black text-gray-900">{pelerin.hotel_mecque || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Statut Hôtel</p>
              <p className="text-sm font-black text-gray-900">{pelerin.hotel_statut || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Groupe Encadrement</p>
              <p className="text-sm font-black text-gray-900">{pelerin.groupe_encadrement || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Section Voyage et Visa */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-900 uppercase mb-4 flex items-center gap-2">
            <Plane size={18} /> Voyage et Visa
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Date de Départ</p>
              <p className="text-sm font-black text-gray-900">
                {pelerin.date_depart ? new Date(pelerin.date_depart).toLocaleDateString('fr-FR') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Date de Retour</p>
              <p className="text-sm font-black text-gray-900">
                {pelerin.date_retour ? new Date(pelerin.date_retour).toLocaleDateString('fr-FR') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Visa Obtenu</p>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                   style={{ backgroundColor: pelerin.visa_obtenu ? '#ecfdf5' : '#f3f4f6', color: pelerin.visa_obtenu ? '#059669' : '#6b7280' }}>
                {pelerin.visa_obtenu ? '✓ Oui' : '✗ Non'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Référence */}

      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <h2 className="text-lg font-black text-gray-900 uppercase mb-4">Référence</h2>
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">N° Référence</p>
          <p className="text-sm font-mono font-black text-gray-900">{pelerin.reference || '—'}</p>
        </div>
      </div>

      {/* Badge Mode Lecture Seule */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">
          ℹ️ Profil en mode lecture seule — Aucune donnée financière affichée
        </p>
      </div>

    </div>
  )
}

function Building2Icon(props: any) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
