'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { getPassportPublicUrl } from '@/lib/hajjPassport'
import {
  Loader2,
  ArrowLeft,
  User,
  Phone,
  Calendar,
  FileCheck,
  CheckCircle2,
  Shield,
  Globe,
  Stethoscope,
  BookOpen,
  Hotel,
  Plane,
  FileDown,
  ToggleLeft,
  ToggleRight
} from 'lucide-react'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
  const [updatingField, setUpdatingField] = useState<string | null>(null)

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

  // Modification optimiste et instantanée du statut (GOUV ou Nusuk)
  const toggleStatut = async (field: 'sur_plateforme_gouv' | 'sur_plateforme_nusuk') => {
    if (!pelerin) return

    const newValue = !pelerin[field]
    setUpdatingField(field)

    // 1. Mise à jour instantanée de l'UI
    setPelerin((prev) => (prev ? { ...prev, [field]: newValue } : null))

    try {
      const { data, error } = await supabase
        .from('pelerins')
        .update({ [field]: newValue })
        .eq('id', pelerin.id)
        .select('*, agences(nom_agence)')
        .single()

      if (error) {
        console.error('Erreur Supabase:', error)
        // Restauration en cas d'erreur
        setPelerin((prev) => (prev ? { ...prev, [field]: !newValue } : null))
      } else if (data) {
        setPelerin(data)
      }
    } catch (err) {
      console.error(err)
      setPelerin((prev) => (prev ? { ...prev, [field]: !newValue } : null))
    } finally {
      setUpdatingField(null)
    }
  }

  // Génération du PDF très soigné
  const generatePDF = () => {
    if (!pelerin) return

    const doc = new jsPDF('portrait', 'mm', 'a4')

    // Bandeau décoratif supérieur (Couleurs officielles Mali / Hajj)
    doc.setFillColor(20, 181, 58) // Vert
    doc.rect(0, 0, 70, 4, 'F')
    doc.setFillColor(252, 209, 22) // Jaune
    doc.rect(70, 0, 70, 4, 'F')
    doc.setFillColor(206, 17, 38) // Rouge
    doc.rect(140, 0, 70, 4, 'F')

    // En-tête du document
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(30, 41, 59)
    doc.text('FICHE PÈLERIN INDIVIDUELLE', 14, 18)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(`Agence : ${agence?.nom_agence || 'N/A'} | Réf: ${pelerin.reference || '—'}`, 14, 24)
    doc.text(`Généré le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, 14, 28)

    // Ligne de séparation
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.5)
    doc.line(14, 32, 196, 32)

    // Bloc Cartouche Identité
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(14, 36, 182, 22, 3, 3, 'F')

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(`${(pelerin.prenom || '').toUpperCase()} ${(pelerin.nom_complet || '').toUpperCase()}`, 18, 45)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(`Passeport : ${pelerin.num_passeport || 'N/A'} | Tél : ${pelerin.telephone_pelerin || 'N/A'}`, 18, 52)

    // Badges de statut
    const gouvStatut = pelerin.sur_plateforme_gouv ? 'GOUV: VALIDÉ' : 'GOUV: NON VALIDÉ'
    const nusukStatut = pelerin.sur_plateforme_nusuk ? 'NUSUK: INSCRIT' : 'NUSUK: NON INSCRIT'
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(pelerin.sur_plateforme_gouv ? 16 : 100, pelerin.sur_plateforme_gouv ? 185 : 116, pelerin.sur_plateforme_gouv ? 129 : 139)
    doc.text(gouvStatut, 140, 45)
    doc.setTextColor(pelerin.sur_plateforme_nusuk ? 126 : 100, pelerin.sur_plateforme_nusuk ? 34 : 116, pelerin.sur_plateforme_nusuk ? 206 : 139)
    doc.text(nusukStatut, 140, 52)

    // Helper pour générer un sous-tableau stylisé
    const createSectionTable = (startY: number, title: string, data: [string, string][]) => {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text(title.toUpperCase(), 14, startY)

      autoTable(doc, {
        startY: startY + 3,
        body: data,
        theme: 'plain',
        styles: {
          fontSize: 8.5,
          cellPadding: 2.5,
          textColor: [51, 65, 85],
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50, textColor: [100, 116, 139] },
          1: { fontStyle: 'normal', cellWidth: 'auto' },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      })

      return (doc as any).lastAutoTable.finalY + 6
    }

    let currentY = 66

    // Section 1 : Identité Civile
    currentY = createSectionTable(currentY, '1. Identité Civile & Contact', [
      ['Prénom', pelerin.prenom || '—'],
      ['Nom Complet', pelerin.nom_complet || '—'],
      ['Sexe / Genre', pelerin.sexe || pelerin.genre || '—'],
      ['Date de Naissance', pelerin.date_naissance ? new Date(pelerin.date_naissance).toLocaleDateString('fr-FR') : '—'],
      ['Lieu de Naissance', pelerin.lieu_naissance || '—'],
      ['Nationalité', pelerin.nationalite || '—'],
      ['Téléphone', pelerin.telephone_pelerin || '—'],
      ['Email', pelerin.email || '—'],
      ['Adresse', pelerin.adresse_pelerin || '—'],
    ])

    // Section 2 : Passeport & Visa
    currentY = createSectionTable(currentY, '2. Passeport & Voyage', [
      ['N° Passeport', pelerin.num_passeport || '—'],
      ['Date Expiration', pelerin.date_expiration ? new Date(pelerin.date_expiration).toLocaleDateString('fr-FR') : '—'],
      ['Date de Départ', pelerin.date_depart ? new Date(pelerin.date_depart).toLocaleDateString('fr-FR') : '—'],
      ['Date de Retour', pelerin.date_retour ? new Date(pelerin.date_retour).toLocaleDateString('fr-FR') : '—'],
      ['Visa Obtenu', pelerin.visa_obtenu ? 'Oui' : 'Non'],
    ])

    // Section 3 : Santé & Formation
    currentY = createSectionTable(currentY, '3. Santé & Formation', [
      ['Visite Médicale', pelerin.visite_medicale ? 'Effectuée' : 'Non effectuée'],
      ['Statut Vaccinal', pelerin.vacciné ? 'Vacciné' : 'Non vacciné'],
      ['Fièvre Jaune', pelerin.vaccination_fievre_jaune ? 'Vacciné' : 'Non vacciné'],
      ['Formation Suivie', pelerin.formation_suivie ? 'Oui' : 'Non'],
      ['Date Formation', pelerin.date_formation ? new Date(pelerin.date_formation).toLocaleDateString('fr-FR') : '—'],
      ['Groupe Formation', pelerin.groupe_formation || '—'],
    ])

    // Section 4 : Hébergement
    currentY = createSectionTable(currentY, '4. Hébergement & Encadrement', [
      ['Hôtel à La Mecque', pelerin.hotel_mecque || '—'],
      ['Statut Hôtel', pelerin.hotel_statut || '—'],
      ['Groupe Encadrement', pelerin.groupe_encadrement || '—'],
    ])

    // Pied de page
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(148, 163, 184)
      doc.text(`Fiche Pèlerin — Document Officiel — Page ${i} / ${pageCount}`, 14, 287)
      doc.text(agence?.nom_agence || 'Hajj Management', 196, 287, { align: 'right' })
    }

    doc.save(`Fiche_Pelerin_${pelerin.nom_complet || 'Export'}.pdf`)
  }

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
        <Link
          href={`/hajj/admin/agences2/${agenceId}/pelerins-gouv`}
          className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500 hover:text-gray-900 transition-colors mb-6"
        >
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
      
      {/* Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-500 flex-wrap">
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

        {/* Bouton Export PDF */}
        <button
          onClick={generatePDF}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-2xl shadow-sm transition-all active:scale-95 shrink-0"
        >
          <FileDown size={16} /> Exporter PDF
        </button>
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
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-black text-gray-900 uppercase">
                {pelerin.prenom} {pelerin.nom_complet}
              </h1>
              {pelerin.sur_plateforme_gouv && (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black">
                  ✓ GOUV Validé
                </span>
              )}
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

      {/* Statuts Plateforme (Interactifs) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Toggle GOUV */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${pelerin.sur_plateforme_gouv ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
          <div>
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
          <button
            onClick={() => toggleStatut('sur_plateforme_gouv')}
            disabled={updatingField === 'sur_plateforme_gouv'}
            className="p-1 text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
            title={pelerin.sur_plateforme_gouv ? 'Retirer du GOUV' : 'Ajouter au GOUV'}
          >
            {updatingField === 'sur_plateforme_gouv' ? (
              <Loader2 size={24} className="animate-spin text-emerald-600" />
            ) : pelerin.sur_plateforme_gouv ? (
              <ToggleRight size={32} className="text-emerald-600" />
            ) : (
              <ToggleLeft size={32} className="text-gray-400" />
            )}
          </button>
        </div>

        {/* Toggle Nusuk */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${pelerin.sur_plateforme_nusuk ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
          <div>
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
          <button
            onClick={() => toggleStatut('sur_plateforme_nusuk')}
            disabled={updatingField === 'sur_plateforme_nusuk'}
            className="p-1 text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
            title={pelerin.sur_plateforme_nusuk ? 'Retirer de Nusuk' : 'Ajouter à Nusuk'}
          >
            {updatingField === 'sur_plateforme_nusuk' ? (
              <Loader2 size={24} className="animate-spin text-purple-600" />
            ) : pelerin.sur_plateforme_nusuk ? (
              <ToggleRight size={32} className="text-purple-600" />
            ) : (
              <ToggleLeft size={32} className="text-gray-400" />
            )}
          </button>
        </div>

        {/* Dossier */}
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
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Visite Médicale</p>
              <div
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                style={{ backgroundColor: pelerin.visite_medicale ? '#ecfdf5' : '#f3f4f6', color: pelerin.visite_medicale ? '#059669' : '#6b7280' }}
              >
                {pelerin.visite_medicale ? '✓ Oui' : '✗ Non'}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Vacciné</p>
              <div
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                style={{ backgroundColor: pelerin.vacciné ? '#ecfdf5' : '#f3f4f6', color: pelerin.vacciné ? '#059669' : '#6b7280' }}
              >
                {pelerin.vacciné ? '✓ Oui' : '✗ Non'}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Fièvre Jaune</p>
              <div
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                style={{ backgroundColor: pelerin.vaccination_fievre_jaune ? '#ecfdf5' : '#f3f4f6', color: pelerin.vaccination_fievre_jaune ? '#059669' : '#6b7280' }}
              >
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
              <div
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                style={{ backgroundColor: pelerin.formation_suivie ? '#ecfdf5' : '#f3f4f6', color: pelerin.formation_suivie ? '#059669' : '#6b7280' }}
              >
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
              <div
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                style={{ backgroundColor: pelerin.visa_obtenu ? '#ecfdf5' : '#f3f4f6', color: pelerin.visa_obtenu ? '#059669' : '#6b7280' }}
              >
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
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}