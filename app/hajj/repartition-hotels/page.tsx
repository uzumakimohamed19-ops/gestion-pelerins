'use client'

import React, { useState, useMemo, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useQuery, usePowerSync } from '@powersync/react'
import { useYear } from '@/lib/YearContext'
import { supabase, getUser } from '@/lib/supabase'
import jsPDF from 'jspdf'
import {
  ArrowLeft,
  Building2,
  Users,
  Search,
  CheckCircle2,
  UserMinus,
  Plus,
  BedDouble,
  Filter,
  X,
  FileDown,
  Printer,
  Sparkles,
  Trash2,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  RotateCcw,
  CheckSquare,
  Square,
  UserCheck,
  AlertCircle,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { getPassportPublicUrl } from '@/lib/hajjPassport'

type Pelerin = {
  id: string
  agence_id?: string
  nom_complet: string
  prenom?: string
  num_passeport: string
  sexe: string
  telephone_pelerin?: string
  document_url?: string | null
  photo_url?: string | null
  date_naissance?: string | null
  date_inscription?: string | null
  date_depart?: string | null
  created_at?: string | null
  reference?: string | null
  agence_ou_personne_associee?: string | null
  campagne?: number | string | null
  visa_obtenu?: number | null
  total_paye: number
  prix_package: number
  chambre_mecque_id?: string | null
  chambre_medine_id?: string | null
}

type Chambre = {
  id: string
  hotel_id: string
  agence_id: string
  numero_chambre?: string | null
  etage?: string | null
  capacite: number
  genre_chambre: 'Hommes' | 'Femmes' | 'Mixte'
  hotel_nom: string
  ville: 'Mecque' | 'Médine'
}

type Hotel = {
  id: string
  agence_id: string
  nom: string
  ville: 'Mecque' | 'Médine'
  adresse?: string | null
  campagne?: number | string | null
}

const TYPES_CHAMBRES_HAJJ = [
  { label: 'Single (1 lit)', capacite: 1 },
  { label: 'Double (2 lits)', capacite: 2 },
  { label: 'Triple (3 lits)', capacite: 3 },
  { label: 'Quadruple (4 lits)', capacite: 4 },
  { label: 'Quintuple (5 lits)', capacite: 5 },
  { label: 'Sextuple (6 lits)', capacite: 6 },
  { label: 'Suite / Dortoir (8 lits)', capacite: 8 },
]

function getLabelTypeChambre(capacite: number): string {
  const match = TYPES_CHAMBRES_HAJJ.find((t) => t.capacite === capacite)
  return match ? match.label : `${capacite} lits`
}

function formatNomComplet(p: { prenom?: string | null; nom_complet?: string | null }): string {
  const prenom = (p.prenom || '').trim()
  const nom = (p.nom_complet || '').trim()
  return `${prenom} ${nom}`.trim()
}

function isPelerinFemme(sexeRaw?: string | null): boolean {
  if (!sexeRaw) return false
  const s = String(sexeRaw).trim().toLowerCase()
  return (
    s === 'f' ||
    s === 'femme' ||
    s === 'féminin' ||
    s === 'feminin' ||
    s === 'female' ||
    s.startsWith('f')
  )
}

function calculateAge(dateNaissance?: string | null): number | null {
  if (!dateNaissance) return null
  const dob = new Date(dateNaissance)
  if (isNaN(dob.getTime())) return null
  const diffMs = Date.now() - dob.getTime()
  const ageDt = new Date(diffMs)
  return Math.abs(ageDt.getUTCFullYear() - 1970)
}

async function getBase64ImageFromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function parseRoomNumbersStrict(input: string, count: number): string[] {
  const clean = input.trim()

  if (!clean) {
    return Array.from({ length: count }, () => '')
  }

  const rangeMatch = clean.match(/^(\d+)\s*(?:à|a|-|\.\.)\s*(\d+)$/i)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10)
    const end = parseInt(rangeMatch[2], 10)
    const total = Math.abs(end - start) + 1
    const step = start <= end ? 1 : -1
    const actualCount = Math.min(count, total)
    return Array.from({ length: actualCount }, (_, i) => String(start + i * step))
  }

  if (/^\d+$/.test(clean)) {
    const startNum = parseInt(clean, 10)
    if (count === 1) return [clean]
    return Array.from({ length: count }, (_, i) => String(startNum + i))
  }

  return Array.from({ length: count }, (_, i) => `${clean}${i + 1}`)
}

export default function RepartitionHotelsPage() {
  const db = usePowerSync()
  const { selectedYear } = useYear()

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentAgenceId, setCurrentAgenceId] = useState<string | null>(null)

  const [villeActive, setVilleActive] = useState<'Mecque' | 'Médine'>('Mecque')
  const [selectedHotelId, setSelectedHotelId] = useState<string>('all')
  const [isProcessing, setIsProcessing] = useState(false)
  const [mobileTab, setMobileTab] = useState<'pelerins' | 'chambres'>('chambres')

  const [selectedPelerinIds, setSelectedPelerinIds] = useState<Set<string>>(new Set())

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [searchPelerin, setSearchPelerin] = useState('')
  const [genreFiltre, setGenreFiltre] = useState<'tous' | 'H' | 'F'>('tous')
  const [filtreTrancheAge, setFiltreTrancheAge] = useState<'tous' | '-40' | '40-60' | '60+'>('tous')
  const [filtreAssocie, setFiltreAssocie] = useState<string>('tous')
  const [filtreDateDepart, setFiltreDateDepart] = useState<string>('tous')
  const [filtreTri, setFiltreTri] = useState<'inscription_asc' | 'inscription_desc' | 'nom_asc' | 'nom_desc' | 'age_desc'>('inscription_asc')

  const [pagePelerins, setPagePelerins] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(30)
  const [nomAgenceAffichee, setNomAgenceAffichee] = useState<string>('AGENCE DE VOYAGE')

  const [showAddHotelModal, setShowAddHotelModal] = useState(false)
  const [showAddChambreModal, setShowAddChambreModal] = useState(false)

  const [nouveauNomHotel, setNouveauNomHotel] = useState('')
  const [nouvelleAdresseHotel, setNouvelleAdresseHotel] = useState('')
  const [isCreatingHotel, startCreateHotelTransition] = useTransition()

  const [nombreChambresACreer, setNombreChambresACreer] = useState<number>(1)
  const [chambreNumeroPattern, setChambreNumeroPattern] = useState('')
  const [chambreEtage, setChambreEtage] = useState('')
  const [capaciteSelectionnee, setCapaciteSelectionnee] = useState<number>(4)
  const [chambreGenre, setChambreGenre] = useState<'Hommes' | 'Femmes' | 'Mixte'>('Hommes')
  const [chambreTargetHotelId, setChambreTargetHotelId] = useState<string>('')
  const [isCreatingChambre, startCreateChambreTransition] = useTransition()

  const [modalError, setModalError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    setSelectedPelerinIds(new Set())
    setSelectedHotelId('all')
    setPagePelerins(1)
  }, [selectedYear])

  useEffect(() => {
    async function chargerAgenceConnectee() {
      try {
        const { data: userData } = await getUser()
        const uid = userData?.user?.id
        if (!uid) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('agence_id, agences(nom_agence)')
          .eq('id', uid)
          .single()

        if (profile?.agence_id) {
          setCurrentAgenceId(profile.agence_id)
        }
        // @ts-expect-error join type
        const nom = profile?.agences?.nom_agence
        if (nom) setNomAgenceAffichee(nom)
      } catch (err) {
        console.error('Erreur chargement agence :', err)
      }
    }
    chargerAgenceConnectee()
  }, [])

  // 1. REQUÊTE PÈLERINS : INCLUT photo_url
  const { data: rawPelerins = [] } = useQuery<any>(
    `SELECT id, agence_id, nom_complet, prenom, num_passeport, sexe, telephone_pelerin, document_url, photo_url,
            date_naissance, date_inscription, date_depart, created_at, reference, agence_ou_personne_associee,
            campagne, visa_obtenu, total_paye, prix_package,
            chambre_mecque_id, chambre_medine_id 
     FROM pelerins 
     WHERE agence_id = ?
     ORDER BY created_at ASC`,
    [currentAgenceId ?? '']
  )

  const pelerins: Pelerin[] = useMemo(() => {
    if (!rawPelerins || rawPelerins.length === 0) return []

    const mapped = rawPelerins.map((p: any) => ({
      ...p,
      total_paye: Number(p.total_paye || 0),
      prix_package: Number(p.prix_package || 0),
      campagne: p.campagne !== undefined && p.campagne !== null ? Number(p.campagne) : undefined,
    }))

    if (selectedYear === 'all' || !selectedYear) return mapped

    const targetYearNum = Number(selectedYear)

    return mapped.filter((p: Pelerin) => {
      if (p.campagne !== undefined && p.campagne !== null) {
        return Number(p.campagne) === targetYearNum
      }
      if (p.date_inscription) {
        const y = new Date(p.date_inscription).getFullYear()
        if (!isNaN(y)) return y === targetYearNum
      }
      if (p.created_at) {
        const y = new Date(p.created_at).getFullYear()
        if (!isNaN(y)) return y === targetYearNum
      }
      return false
    })
  }, [rawPelerins, selectedYear])

  const { data: rawHotels = [] } = useQuery<Hotel>(
    `SELECT id, agence_id, nom, ville, adresse, campagne, created_at
     FROM hotels 
     WHERE agence_id = ? 
     ORDER BY nom ASC`,
    [currentAgenceId ?? '']
  )

  const hotels: Hotel[] = useMemo(() => {
    if (!rawHotels || rawHotels.length === 0) return []
    if (selectedYear === 'all' || !selectedYear) return rawHotels

    const targetYearNum = Number(selectedYear)

    return rawHotels.filter((h: any) => {
      if (h.campagne !== undefined && h.campagne !== null && String(h.campagne).trim() !== '') {
        return Number(h.campagne) === targetYearNum
      }
      if (h.created_at) {
        const y = new Date(h.created_at).getFullYear()
        if (!isNaN(y)) return y === targetYearNum
      }
      return false
    })
  }, [rawHotels, selectedYear])

  const { data: rawChambres = [] } = useQuery<Chambre>(
    `SELECT c.id, c.hotel_id, c.agence_id, c.numero_chambre, c.etage, c.capacite, c.genre_chambre,
            h.nom as hotel_nom, h.ville
     FROM chambres c
     JOIN hotels h ON c.hotel_id = h.id
     WHERE c.agence_id = ?
     ORDER BY CAST(c.numero_chambre AS INTEGER) ASC, c.created_at ASC`,
    [currentAgenceId ?? '']
  )

  const chambres: Chambre[] = useMemo(() => {
    const validHotelIds = new Set(hotels.map((h) => h.id))
    return rawChambres.filter((c) => validHotelIds.has(c.hotel_id))
  }, [rawChambres, hotels])

  const uniqueAssocies = useMemo(() => {
    const set = new Set<string>()
    pelerins.forEach((p) => {
      if (p.agence_ou_personne_associee?.trim()) {
        set.add(p.agence_ou_personne_associee.trim())
      }
    })
    return Array.from(set).sort()
  }, [pelerins])

  const uniqueDatesDepart = useMemo(() => {
    const set = new Set<string>()
    pelerins.forEach((p) => {
      if (p.date_depart?.trim()) set.add(p.date_depart.trim().slice(0, 10))
    })
    return Array.from(set).sort()
  }, [pelerins])

  const pelerinsEnAttenteFiltres = useMemo(() => {
    return pelerins.filter((p) => {
      const chambreId = villeActive === 'Mecque' ? p.chambre_mecque_id : p.chambre_medine_id
      if (chambreId) return false

      const isFemme = isPelerinFemme(p.sexe)
      if (genreFiltre === 'H' && isFemme) return false
      if (genreFiltre === 'F' && !isFemme) return false

      const age = calculateAge(p.date_naissance)
      if (filtreTrancheAge === '-40' && (age === null || age >= 40)) return false
      if (filtreTrancheAge === '40-60' && (age === null || age < 40 || age > 60)) return false
      if (filtreTrancheAge === '60+' && (age === null || age < 60)) return false

      if (filtreAssocie !== 'tous' && p.agence_ou_personne_associee?.trim() !== filtreAssocie) return false
      if (filtreDateDepart !== 'tous' && !p.date_depart?.startsWith(filtreDateDepart)) return false

      if (searchPelerin.trim()) {
        const query = searchPelerin.toLowerCase()
        const affichageNom = formatNomComplet(p).toLowerCase()
        const matchNom = affichageNom.includes(query)
        const matchPass = p.num_passeport?.toLowerCase().includes(query)
        const matchRef = p.reference?.toLowerCase().includes(query)
        const matchTel = p.telephone_pelerin?.includes(query)
        return matchNom || matchPass || matchRef || matchTel
      }

      return true
    }).sort((a, b) => {
      if (filtreTri === 'inscription_asc') {
        return (a.created_at || '').localeCompare(b.created_at || '')
      }
      if (filtreTri === 'inscription_desc') {
        return (b.created_at || '').localeCompare(a.created_at || '')
      }
      const nomA = formatNomComplet(a)
      const nomB = formatNomComplet(b)
      if (filtreTri === 'nom_desc') return nomB.localeCompare(nomA)
      if (filtreTri === 'nom_asc') return nomA.localeCompare(nomB)
      if (filtreTri === 'age_desc') {
        const ageA = calculateAge(a.date_naissance) || 0
        const ageB = calculateAge(b.date_naissance) || 0
        return ageB - ageA
      }
      return 0
    })
  }, [
    pelerins,
    villeActive,
    genreFiltre,
    filtreTrancheAge,
    filtreAssocie,
    filtreDateDepart,
    searchPelerin,
    filtreTri,
  ])

  const totalPagesPelerins = Math.ceil(pelerinsEnAttenteFiltres.length / itemsPerPage) || 1
  const pelerinsAffiches = useMemo(() => {
    const debut = (pagePelerins - 1) * itemsPerPage
    return pelerinsEnAttenteFiltres.slice(debut, debut + itemsPerPage)
  }, [pelerinsEnAttenteFiltres, pagePelerins, itemsPerPage])

  const chambresFiltrees = useMemo(() => {
    return chambres.filter((c) => {
      if (c.ville !== villeActive) return false
      if (selectedHotelId !== 'all' && c.hotel_id !== selectedHotelId) return false
      return true
    })
  }, [chambres, villeActive, selectedHotelId])

  const toggleSelectPelerin = (id: string) => {
    setSelectedPelerinIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllCurrentPage = () => {
    setSelectedPelerinIds((prev) => {
      const next = new Set(prev)
      pelerinsAffiches.forEach((p) => next.add(p.id))
      return next
    })
  }

  const deselectAll = () => {
    setSelectedPelerinIds(new Set())
  }

  const assignerGroupeDansChambre = async (chambre: Chambre, placesRestantes: number) => {
    const countToAssign = selectedPelerinIds.size
    if (countToAssign === 0 || isProcessing) return

    if (countToAssign > placesRestantes) {
      alert(
        `Impossible d'assigner ${countToAssign} pèlerin(s) dans cette chambre : il ne reste que ${placesRestantes} place(s) disponible(s).`
      )
      return
    }

    setIsProcessing(true)
    const champ = villeActive === 'Mecque' ? 'chambre_mecque_id' : 'chambre_medine_id'
    const idsArray = Array.from(selectedPelerinIds)

    try {
      const placeholders = idsArray.map(() => '?').join(',')
      await db.execute(
        `UPDATE pelerins SET ${champ} = ? WHERE id IN (${placeholders})`,
        [chambre.id, ...idsArray]
      )

      await supabase
        .from('pelerins')
        .update({ [champ]: chambre.id })
        .in('id', idsArray)

      setSelectedPelerinIds(new Set())
    } catch (e) {
      console.error('Erreur assignation groupée :', e)
      alert("Erreur lors de l'attribution groupée.")
    } finally {
      setIsProcessing(false)
    }
  }

  const retirerChambre = async (pelerinId: string) => {
    if (isProcessing) return
    setIsProcessing(true)

    const champ = villeActive === 'Mecque' ? 'chambre_mecque_id' : 'chambre_medine_id'

    try {
      await db.execute(`UPDATE pelerins SET ${champ} = NULL WHERE id = ?`, [pelerinId])
      await supabase.from('pelerins').update({ [champ]: null }).eq('id', pelerinId)
    } catch (e) {
      console.error('Erreur retrait :', e)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeleteChambre = async (chambre: Chambre) => {
    const identifiantChambre = chambre.numero_chambre ? `N° ${chambre.numero_chambre}` : getLabelTypeChambre(chambre.capacite)
    const confirmDelete = window.confirm(
      `Confirmez-vous la suppression de la chambre ${identifiantChambre} ?`
    )
    if (!confirmDelete) return

    const champ = chambre.ville === 'Mecque' ? 'chambre_mecque_id' : 'chambre_medine_id'

    try {
      await db.execute(`UPDATE pelerins SET ${champ} = NULL WHERE ${champ} = ? AND agence_id = ?`, [chambre.id, chambre.agence_id])
      await supabase.from('pelerins').update({ [champ]: null }).eq(champ, chambre.id).eq('agence_id', chambre.agence_id)
      await db.execute(`DELETE FROM chambres WHERE id = ? AND agence_id = ?`, [chambre.id, chambre.agence_id])
      await supabase.from('chambres').delete().eq('id', chambre.id).eq('agence_id', chambre.agence_id)
    } catch (err) {
      console.error('Erreur suppression chambre :', err)
      alert('Impossible de supprimer la chambre.')
    }
  }

  const handleDeleteHotel = async () => {
    if (selectedHotelId === 'all' || !currentAgenceId) return
    const targetHotel = hotels.find((h) => h.id === selectedHotelId)
    if (!targetHotel) return

    const confirmHotel = window.confirm(
      `Voulez-vous supprimer l'hôtel "${targetHotel.nom}" ainsi que toutes ses chambres ?`
    )
    if (!confirmHotel) return

    const champ = targetHotel.ville === 'Mecque' ? 'chambre_mecque_id' : 'chambre_medine_id'
    const hotelChambres = chambres.filter((c) => c.hotel_id === targetHotel.id)
    const chambreIds = hotelChambres.map((c) => c.id)

    try {
      for (const chId of chambreIds) {
        await db.execute(`UPDATE pelerins SET ${champ} = NULL WHERE ${champ} = ? AND agence_id = ?`, [chId, currentAgenceId])
      }
      if (chambreIds.length > 0) {
        await supabase.from('pelerins').update({ [champ]: null }).in(champ, chambreIds).eq('agence_id', currentAgenceId)
      }
      await db.execute(`DELETE FROM chambres WHERE hotel_id = ? AND agence_id = ?`, [targetHotel.id, currentAgenceId])
      await supabase.from('chambres').delete().eq('hotel_id', targetHotel.id).eq('agence_id', currentAgenceId)
      await db.execute(`DELETE FROM hotels WHERE id = ? AND agence_id = ?`, [targetHotel.id, currentAgenceId])
      await supabase.from('hotels').delete().eq('id', targetHotel.id).eq('agence_id', currentAgenceId)

      setSelectedHotelId('all')
    } catch (err) {
      console.error('Erreur suppression hôtel :', err)
    }
  }

  const handleCreateHotel = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nouveauNomHotel.trim() || !currentAgenceId) return

    setModalError(null)

    const anneeCampagne = selectedYear !== 'all' && selectedYear ? Number(selectedYear) : new Date().getFullYear()

    startCreateHotelTransition(async () => {
      try {
        const { data: createdHotel, error: hotelErr } = await supabase
          .from('hotels')
          .insert({
            agence_id: currentAgenceId,
            nom: nouveauNomHotel.trim(),
            ville: villeActive,
            adresse: nouvelleAdresseHotel.trim() || null,
            campagne: anneeCampagne,
          })
          .select('id, agence_id, nom, ville, campagne')
          .single()

        if (hotelErr || !createdHotel) throw new Error(hotelErr?.message || 'Erreur création hôtel.')

        await db.execute(
          `INSERT OR REPLACE INTO hotels (id, agence_id, nom, ville, adresse, campagne, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            createdHotel.id,
            createdHotel.agence_id,
            createdHotel.nom,
            createdHotel.ville,
            nouvelleAdresseHotel.trim() || null,
            anneeCampagne,
            new Date().toISOString(),
          ]
        ).catch(() => {})

        setNouveauNomHotel('')
        setNouvelleAdresseHotel('')
        setShowAddHotelModal(false)
        setSelectedHotelId(createdHotel.id)
      } catch (err: unknown) {
        setModalError(err instanceof Error ? err.message : 'Erreur lors de la création.')
      }
    })
  }

  const handleCreateChambre = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chambreTargetHotelId || nombreChambresACreer < 1 || !currentAgenceId) return

    setModalError(null)

    startCreateChambreTransition(async () => {
      try {
        const roomNumbers = parseRoomNumbersStrict(
          chambreNumeroPattern,
          nombreChambresACreer
        )

        const payloads = roomNumbers.map((num) => ({
          hotel_id: chambreTargetHotelId,
          agence_id: currentAgenceId,
          numero_chambre: num && num.trim() !== '' ? num.trim() : '',
          etage: chambreEtage.trim() || null,
          capacite: capaciteSelectionnee,
          genre_chambre: chambreGenre,
        }))

        const { data: createdChambres, error: chErr } = await supabase
          .from('chambres')
          .insert(payloads)
          .select()

        if (chErr || !createdChambres) throw new Error(chErr?.message || 'Erreur création chambres.')

        for (const ch of createdChambres) {
          await db.execute(
            `INSERT OR REPLACE INTO chambres (id, hotel_id, agence_id, numero_chambre, etage, capacite, genre_chambre, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              ch.id,
              ch.hotel_id,
              ch.agence_id,
              ch.numero_chambre ?? '',
              ch.etage,
              ch.capacite,
              ch.genre_chambre,
              new Date().toISOString(),
            ]
          ).catch(() => {})
        }

        setChambreNumeroPattern('')
        setChambreEtage('')
        setNombreChambresACreer(1)
        setShowAddChambreModal(false)
      } catch (err: unknown) {
        setModalError(err instanceof Error ? err.message : 'Erreur lors de la création.')
      }
    })
  }

  // 📄 EXPORT PDF 1 CHAMBRE AVEC PHOTO RÉELLE DU PÈLERIN
  const exportPdfChambreUnique = async (chambre: Chambre) => {
    try {
      setIsExporting(true)
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const occupants = pelerins.filter((p) =>
        villeActive === 'Mecque'
          ? p.chambre_mecque_id === chambre.id
          : p.chambre_medine_id === chambre.id
      )

      doc.setFillColor(30, 41, 59)
      doc.rect(0, 0, 210, 42, 'F')
      doc.setFillColor(217, 119, 6)
      doc.rect(0, 42, 210, 2.5, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(255, 255, 255)
      doc.text(nomAgenceAffichee.toUpperCase(), 105, 16, { align: 'center' })

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(253, 224, 71)
      doc.text('FICHE D’AFFECTATION DE CHAMBRE', 105, 24, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(203, 213, 225)
      doc.text(
        `HÔTEL ${chambre.hotel_nom.toUpperCase()} • ${villeActive.toUpperCase()} ${selectedYear !== 'all' ? `(Campagne ${selectedYear})` : ''}`,
        105,
        31,
        { align: 'center' }
      )
      doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, 105, 37, { align: 'center' })

      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(14, 50, 182, 30, 3, 3, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(37, 99, 235)
      const titreChambrePdf = chambre.numero_chambre && chambre.numero_chambre.trim() !== ''
        ? `CHAMBRE N° ${chambre.numero_chambre}`
        : `${getLabelTypeChambre(chambre.capacite).toUpperCase()}`
      doc.text(titreChambrePdf, 22, 65)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(71, 85, 105)
      doc.text(
        `Étage : ${chambre.etage ? chambre.etage : 'RDC'}  |  Type : ${getLabelTypeChambre(chambre.capacite)} [${chambre.genre_chambre}]`,
        22,
        73
      )

      const isComplete = occupants.length >= chambre.capacite
      doc.setFillColor(isComplete ? 254 : 236, isComplete ? 242 : 253, isComplete ? 242 : 245)
      doc.setDrawColor(isComplete ? 248 : 167, isComplete ? 113 : 243, isComplete ? 113 : 208)
      doc.roundedRect(138, 55, 50, 20, 2, 2, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(isComplete ? 185 : 21, isComplete ? 28 : 128, isComplete ? 28 : 61)
      doc.text(`${occupants.length} / ${chambre.capacite} LITS`, 163, 65, { align: 'center' })
      doc.setFontSize(8)
      doc.text(isComplete ? 'CHAMBRE COMPLÈTE' : 'PLACES DISPONIBLES', 163, 70, { align: 'center' })

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text('LISTE DES PÈLERINS ASSIGNÉS', 14, 91)

      let startY = 97
      const cardHeight = 26
      const cardWidth = 182

      if (occupants.length === 0) {
        doc.setFillColor(248, 250, 252)
        doc.setDrawColor(226, 232, 240)
        doc.roundedRect(14, startY, cardWidth, 40, 3, 3, 'FD')
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(11)
        doc.setTextColor(148, 163, 184)
        doc.text('Aucun pèlerin assigné.', 105, startY + 22, { align: 'center' })
      } else {
        for (const occ of occupants) {
          const isFemme = isPelerinFemme(occ.sexe)
          const age = calculateAge(occ.date_naissance)
          const nomAffichage = formatNomComplet(occ).toUpperCase()

          doc.setFillColor(250, 252, 255)
          doc.setDrawColor(226, 232, 240)
          doc.roundedRect(14, startY, cardWidth, cardHeight, 2.5, 2.5, 'FD')

          const photoX = 17.5
          const photoY = startY + 3
          const photoW = 16
          const photoH = 20

          // 📷 RÉCUPÉRATION ET INSERTION DE LA VRAIE PHOTO DU PÈLERIN
          let photoInseree = false
          if (occ.photo_url) {
            const realUrl = getPassportPublicUrl(occ.photo_url)
            if (realUrl) {
              const base64Data = await getBase64ImageFromUrl(realUrl)
              if (base64Data) {
                try {
                  const format = base64Data.includes('image/png') ? 'PNG' : 'JPEG'
                  doc.addImage(base64Data, format, photoX, photoY, photoW, photoH)
                  doc.setDrawColor(203, 213, 225)
                  doc.roundedRect(photoX, photoY, photoW, photoH, 1.5, 1.5, 'D')
                  photoInseree = true
                } catch {
                  photoInseree = false
                }
              }
            }
          }

          // Fallback sur l'avatar avec initiales si pas de photo
          if (!photoInseree) {
            doc.setFillColor(isFemme ? 253 : 238, isFemme ? 242 : 242, isFemme ? 248 : 255)
            doc.roundedRect(photoX, photoY, photoW, photoH, 1.5, 1.5, 'FD')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(10)
            doc.setTextColor(isFemme ? 190 : 37, isFemme ? 24 : 99, isFemme ? 93 : 235)
            const initiales = `${occ.prenom?.charAt(0) || ''}${occ.nom_complet?.charAt(0) || ''}`.toUpperCase() || 'P'
            doc.text(initiales, photoX + 8, photoY + 11.5, { align: 'center' })
          }

          const textX = photoX + 21
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.setTextColor(15, 23, 42)
          doc.text(nomAffichage, textX, startY + 6.5)

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7.5)
          doc.setTextColor(100, 116, 139)
          doc.text(`Genre : ${isFemme ? 'Femme' : 'Homme'} ${age ? `• ${age} ans` : ''}  |  Passeport : ${occ.num_passeport || '-'}`, textX, startY + 12)
          doc.text(`Téléphone : ${occ.telephone_pelerin || '-'} ${occ.reference ? `• Ref: ${occ.reference}` : ''}`, textX, startY + 17)

          startY += cardHeight + 4
        }
      }

      doc.setDrawColor(226, 232, 240)
      doc.line(14, 275, 196, 275)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(100, 116, 139)
      doc.text(`${nomAgenceAffichee.toUpperCase()} — LOGISTIQUE HAJJ & OMRA`, 105, 281, { align: 'center' })

      const filenameNum = chambre.numero_chambre && chambre.numero_chambre.trim() !== ''
        ? `Chambre_${chambre.numero_chambre}`
        : `Chambre_${chambre.capacite}lits`
      doc.save(`${filenameNum}_${chambre.hotel_nom}.pdf`)
    } catch (err) {
      console.error(err)
    } finally {
      setIsExporting(false)
    }
  }

  // 📄 EXPORT PDF HÔTEL COMPLET AVEC PHOTO RÉELLE
  const exportPdfHotelComplet = async () => {
    try {
      setIsExporting(true)
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const nomHotelLabel =
        selectedHotelId !== 'all'
          ? hotels.find((h) => h.id === selectedHotelId)?.nom || villeActive
          : `Tous les Hôtels (${villeActive})`

      const totalLits = chambresFiltrees.reduce((acc, c) => acc + c.capacite, 0)
      const totalPelerinsLoges = pelerins.filter((p) =>
        chambresFiltrees.some((c) =>
          villeActive === 'Mecque'
            ? p.chambre_mecque_id === c.id
            : p.chambre_medine_id === c.id
        )
      ).length

      let currentY = 14

      const printPageHeader = (pageNumber: number) => {
        doc.setFillColor(30, 41, 59)
        doc.rect(0, 0, 210, 28, 'F')
        doc.setFillColor(217, 119, 6)
        doc.rect(0, 28, 210, 1.5, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(16)
        doc.setTextColor(255, 255, 255)
        doc.text(nomAgenceAffichee.toUpperCase(), 14, 12)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9.5)
        doc.setTextColor(253, 224, 71)
        doc.text(`RÉPARTITION LOGEMENT — ${nomHotelLabel.toUpperCase()}`, 14, 19)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(203, 213, 225)
        doc.text(`Ville : ${villeActive}  |  Date : ${new Date().toLocaleDateString('fr-FR')}  |  Page ${pageNumber}`, 14, 25)
      }

      printPageHeader(1)

      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(14, 34, 182, 18, 2.5, 2.5, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(15, 23, 42)
      doc.text(`BILAN TOTAL : ${totalPelerinsLoges} logés sur ${totalLits} lits disponibles`, 20, 42)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(100, 116, 139)
      doc.text(`Chambres : ${chambresFiltrees.length}  |  En attente : ${pelerinsEnAttenteFiltres.length} pèlerins`, 20, 47)

      currentY = 57

      let pageCounter = 1
      for (const ch of chambresFiltrees) {
        const occupants = pelerins.filter((p) =>
          villeActive === 'Mecque'
            ? p.chambre_mecque_id === ch.id
            : p.chambre_medine_id === ch.id
        )

        const neededHeight = 12 + Math.max(occupants.length, 1) * 26 + 6

        if (currentY + neededHeight > 275) {
          doc.addPage()
          pageCounter++
          printPageHeader(pageCounter)
          currentY = 34
        }

        doc.setFillColor(241, 245, 249)
        doc.setDrawColor(203, 213, 225)
        doc.roundedRect(14, currentY, 182, 9, 1.5, 1.5, 'FD')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(15, 23, 42)
        const descTitre = ch.numero_chambre && ch.numero_chambre.trim() !== ''
          ? `CHAMBRE N° ${ch.numero_chambre}`
          : `${getLabelTypeChambre(ch.capacite).toUpperCase()}`
        doc.text(`${descTitre} ${ch.etage ? `(Étage ${ch.etage})` : ''} — ${ch.hotel_nom}`, 18, currentY + 6)

        doc.setFontSize(8)
        doc.setTextColor(37, 99, 235)
        doc.text(`[${ch.genre_chambre}]  ${occupants.length} / ${ch.capacite} lits`, 190, currentY + 6, { align: 'right' })

        currentY += 11

        if (occupants.length === 0) {
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(8)
          doc.setTextColor(148, 163, 184)
          doc.text('Chambre actuellement vacante', 20, currentY + 4)
          currentY += 8
        } else {
          for (const occ of occupants) {
            const isFemme = isPelerinFemme(occ.sexe)
            const age = calculateAge(occ.date_naissance)
            const nomAffichage = formatNomComplet(occ).toUpperCase()

            doc.setFillColor(250, 252, 255)
            doc.setDrawColor(226, 232, 240)
            doc.roundedRect(14, currentY, 182, 24, 2.5, 2.5, 'FD')

            const photoX = 17
            const photoY = currentY + 2.5
            const photoW = 14
            const photoH = 19

            // 📷 INSERTION PHOTO RÉELLE
            let photoInseree = false
            if (occ.photo_url) {
              const realUrl = getPassportPublicUrl(occ.photo_url)
              if (realUrl) {
                const base64Data = await getBase64ImageFromUrl(realUrl)
                if (base64Data) {
                  try {
                    const format = base64Data.includes('image/png') ? 'PNG' : 'JPEG'
                    doc.addImage(base64Data, format, photoX, photoY, photoW, photoH)
                    doc.setDrawColor(203, 213, 225)
                    doc.roundedRect(photoX, photoY, photoW, photoH, 1.5, 1.5, 'D')
                    photoInseree = true
                  } catch {
                    photoInseree = false
                  }
                }
              }
            }

            if (!photoInseree) {
              doc.setFillColor(isFemme ? 253 : 238, isFemme ? 242 : 242, isFemme ? 248 : 255)
              doc.roundedRect(photoX, photoY, photoW, photoH, 1.5, 1.5, 'FD')
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(9)
              doc.setTextColor(isFemme ? 190 : 37, isFemme ? 24 : 99, isFemme ? 93 : 235)
              const initiales = `${occ.prenom?.charAt(0) || ''}${occ.nom_complet?.charAt(0) || ''}`.toUpperCase() || 'P'
              doc.text(initiales, photoX + 7, photoY + 11, { align: 'center' })
            }

            const textX = photoX + 18
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8.5)
            doc.setTextColor(15, 23, 42)
            doc.text(nomAffichage, textX, currentY + 6.5)

            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7)
            doc.setTextColor(100, 116, 139)
            doc.text(`${isFemme ? 'Femme' : 'Homme'} ${age ? `• ${age} ans` : ''} | Pass: ${occ.num_passeport || '-'} | Tél: ${occ.telephone_pelerin || '-'}`, textX, currentY + 12)

            currentY += 26
          }
        }

        currentY += 4
      }

      doc.save(`Recapitulatif_${nomAgenceAffichee}_${villeActive}.pdf`)
    } catch (e) {
      console.error(e)
    } finally {
      setIsExporting(false)
    }
  }

  const resetFilters = () => {
    setSearchPelerin('')
    setGenreFiltre('tous')
    setFiltreTrancheAge('tous')
    setFiltreAssocie('tous')
    setFiltreDateDepart('tous')
    setFiltreTri('inscription_asc')
    setPagePelerins(1)
  }

  const countSelected = selectedPelerinIds.size

  return (
    <div
      className={`min-h-screen bg-slate-50 text-slate-800 transition-all duration-200 ${
        isFullscreen
          ? 'fixed inset-0 z-[100] overflow-y-auto pb-10'
          : 'pb-24'
      }`}
    >
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 px-3 sm:px-6 py-3 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {!isFullscreen && (
                <Link
                  href="/hajj"
                  className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
                >
                  <ArrowLeft size={18} />
                </Link>
              )}
              <div>
                <h1 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-1.5">
                  <BedDouble size={18} className="text-blue-600" />
                  Répartition des Hôtels & Chambres
                </h1>
                <p className="text-[10px] sm:text-[11px] text-slate-400">
                  {nomAgenceAffichee} {selectedYear !== 'all' ? `• Campagne ${selectedYear}` : '• Toutes les campagnes'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 md:hidden">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`p-1.5 rounded-lg border text-xs font-bold transition ${
                  isFullscreen ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
                title={isFullscreen ? 'Réduire' : 'Plein écran'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

              <button
                onClick={exportPdfHotelComplet}
                disabled={isExporting || chambresFiltrees.length === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shadow-xs active:scale-95"
              >
                <FileDown size={14} />
                <span>{isExporting ? '…' : 'PDF'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition shadow-xs cursor-pointer ${
                isFullscreen
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
              title={isFullscreen ? 'Quitter le mode plein écran' : 'Agrandir au maximum'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span>{isFullscreen ? 'Réduire' : 'Plein Écran'}</span>
            </button>

            <button
              onClick={exportPdfHotelComplet}
              disabled={isExporting || chambresFiltrees.length === 0}
              className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <FileDown size={14} />
              <span>{isExporting ? 'Génération…' : 'Exporter Tout l’Hôtel (A4)'}</span>
            </button>

            <button
              onClick={() => {
                if (hotels.filter((h) => h.ville === villeActive).length === 0) {
                  setShowAddHotelModal(true)
                } else {
                  setChambreTargetHotelId(hotels.find((h) => h.ville === villeActive)?.id || '')
                  setShowAddChambreModal(true)
                }
              }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              <span>+ Chambres</span>
            </button>

            <button
              onClick={() => setShowAddHotelModal(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Building2 size={14} />
              <span>+ Hôtel</span>
            </button>

            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 w-full sm:w-auto">
              <button
                onClick={() => {
                  setVilleActive('Mecque')
                  setSelectedHotelId('all')
                  setSelectedPelerinIds(new Set())
                }}
                className={`flex-1 sm:flex-initial px-3.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  villeActive === 'Mecque'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mecque
              </button>
              <button
                onClick={() => {
                  setVilleActive('Médine')
                  setSelectedHotelId('all')
                  setSelectedPelerinIds(new Set())
                }}
                className={`flex-1 sm:flex-initial px-3.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  villeActive === 'Médine'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Médine
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 mt-2.5 pt-2 border-t border-slate-100 lg:hidden">
          <button
            onClick={() => setMobileTab('chambres')}
            className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              mobileTab === 'chambres'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            <BedDouble size={14} />
            <span>Chambres ({chambresFiltrees.length})</span>
          </button>
          <button
            onClick={() => setMobileTab('pelerins')}
            className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              mobileTab === 'pelerins'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Users size={14} />
            <span>
              À loger ({pelerinsEnAttenteFiltres.length})
              {countSelected > 0 && ` [${countSelected}]`}
            </span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

          <div
            className={`lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-xs sticky top-20 ${
              mobileTab === 'pelerins' ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Users size={16} className="text-blue-600" />
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  En attente ({pelerinsEnAttenteFiltres.length})
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                    showAdvancedFilters
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="Filtres avancés"
                >
                  <SlidersHorizontal size={13} />
                  <span className="text-[10px]">Filtres</span>
                </button>

                {(genreFiltre !== 'tous' ||
                  filtreTrancheAge !== 'tous' ||
                  filtreAssocie !== 'tous' ||
                  filtreDateDepart !== 'tous' ||
                  filtreTri !== 'inscription_asc' ||
                  searchPelerin) && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition cursor-pointer"
                    title="Réinitialiser les filtres"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher pèlerin, passeport, ref..."
                value={searchPelerin}
                onChange={(e) => {
                  setSearchPelerin(e.target.value)
                  setPagePelerins(1)
                }}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex gap-1.5 text-[11px] font-bold mb-2">
              <button
                onClick={() => { setGenreFiltre('tous'); setPagePelerins(1) }}
                className={`flex-1 py-1 rounded-lg border transition cursor-pointer ${
                  genreFiltre === 'tous'
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => { setGenreFiltre('H'); setPagePelerins(1) }}
                className={`flex-1 py-1 rounded-lg border transition cursor-pointer ${
                  genreFiltre === 'H'
                    ? 'bg-sky-600 border-sky-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Hommes
              </button>
              <button
                onClick={() => { setGenreFiltre('F'); setPagePelerins(1) }}
                className={`flex-1 py-1 rounded-lg border transition cursor-pointer ${
                  genreFiltre === 'F'
                    ? 'bg-pink-600 border-pink-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                Femmes
              </button>
            </div>

            {showAdvancedFilters && (
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 mb-2.5 space-y-2 animate-in fade-in text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                    Tranche d'âge
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { id: 'tous', label: 'Tous' },
                      { id: '-40', label: '< 40 ans' },
                      { id: '40-60', label: '40-60 ans' },
                      { id: '60+', label: '> 60 ans' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setFiltreTrancheAge(t.id as any); setPagePelerins(1) }}
                        className={`py-1 rounded-lg text-[10px] font-bold border transition ${
                          filtreTrancheAge === t.id
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5 truncate">
                      Personne / Agence
                    </label>
                    <select
                      value={filtreAssocie}
                      onChange={(e) => { setFiltreAssocie(e.target.value); setPagePelerins(1) }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none"
                    >
                      <option value="tous">Tous les associés</option>
                      {uniqueAssocies.map((ass) => (
                        <option key={ass} value={ass}>
                          {ass}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-0.5 truncate">
                      Date Départ
                    </label>
                    <select
                      value={filtreDateDepart}
                      onChange={(e) => { setFiltreDateDepart(e.target.value); setPagePelerins(1) }}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none"
                    >
                      <option value="tous">Tous les départs</option>
                      {uniqueDatesDepart.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                    Trier les pèlerins par
                  </label>
                  <select
                    value={filtreTri}
                    onChange={(e) => setFiltreTri(e.target.value as any)}
                    className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none"
                  >
                    <option value="inscription_asc">1er inscrit en premier (Ordre d'inscription)</option>
                    <option value="inscription_desc">Dernier inscrit en premier</option>
                    <option value="nom_asc">Nom complet (A-Z)</option>
                    <option value="nom_desc">Nom complet (Z-A)</option>
                    <option value="age_desc">Âge (Plus âgés d'abord)</option>
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-2 mb-2 bg-blue-50/70 border border-blue-100 rounded-xl text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={selectAllCurrentPage}
                  className="flex items-center gap-1 px-2 py-1 bg-white border border-blue-200 rounded-lg text-[10px] font-bold text-blue-700 hover:bg-blue-50 transition cursor-pointer"
                >
                  <CheckSquare size={12} />
                  <span>Cocher page ({pelerinsAffiches.length})</span>
                </button>

                {countSelected > 0 && (
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  >
                    Désélectionner
                  </button>
                )}
              </div>

              <div className="text-[11px] font-black text-blue-700">
                {countSelected} sélectionné{countSelected > 1 ? 's' : ''}
              </div>
            </div>

            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
              {pelerinsAffiches.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-1.5" />
                  Aucun pèlerin en attente pour cette campagne.
                </div>
              ) : (
                pelerinsAffiches.map((p, indexOnPage) => {
                  const isSelected = selectedPelerinIds.has(p.id)
                  const isFemme = isPelerinFemme(p.sexe)
                  const age = calculateAge(p.date_naissance)
                  const nomCompletAffiche = formatNomComplet(p)
                  const numeroOrdre = (pagePelerins - 1) * itemsPerPage + indexOnPage + 1

                  return (
                    <div
                      key={p.id}
                      onClick={() => toggleSelectPelerin(p.id)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/90 shadow-xs ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="shrink-0 w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 font-mono font-bold text-[10px] flex items-center justify-center">
                          #{numeroOrdre}
                        </div>

                        <div className="shrink-0 text-blue-600">
                          {isSelected ? (
                            <CheckSquare size={16} className="text-blue-600 fill-blue-50" />
                          ) : (
                            <Square size={16} className="text-slate-300" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                            <span className="truncate">{nomCompletAffiche}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-black shrink-0 ${
                                isFemme ? 'bg-pink-100 text-pink-700' : 'bg-sky-100 text-sky-700'
                              }`}
                            >
                              {isFemme ? 'F' : 'H'} {age ? `• ${age} ans` : ''}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                            <span>Pass: {p.num_passeport}</span>
                            {p.reference && <span>• Ref: {p.reference}</span>}
                            {p.agence_ou_personne_associee && (
                              <span className="text-blue-600 font-bold truncate max-w-[100px]">
                                • {p.agence_ou_personne_associee}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isSelected ? 'Sélectionné' : 'Choisir'}
                      </span>
                    </div>
                  )
                })
              )}
            </div>

            {totalPagesPelerins > 1 && (
              <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-100 text-xs">
                <span className="text-[10px] text-slate-400 font-bold">
                  Page {pagePelerins} / {totalPagesPelerins} ({pelerinsEnAttenteFiltres.length})
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pagePelerins <= 1}
                    onClick={() => setPagePelerins((prev) => Math.max(1, prev - 1))}
                    className="p-1 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={pagePelerins >= totalPagesPelerins}
                    onClick={() => setPagePelerins((prev) => Math.min(totalPagesPelerins, prev + 1))}
                    className="p-1 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            className={`lg:col-span-7 space-y-3.5 ${
              mobileTab === 'chambres' ? 'block' : 'hidden lg:block'
            }`}
          >
            {countSelected > 0 && (
              <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2">
                  <UserCheck size={18} />
                  <span className="text-xs font-black">
                    {countSelected} pèlerin{countSelected > 1 ? 's' : ''} prêt{countSelected > 1 ? 's' : ''} à être placé{countSelected > 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-[10px] font-bold cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            )}

            <div className="flex items-center justify-between bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Filter size={14} className="text-slate-400 shrink-0" />
                <select
                  value={selectedHotelId}
                  onChange={(e) => setSelectedHotelId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-600 truncate cursor-pointer"
                >
                  <option value="all">Tous les hôtels de {villeActive}</option>
                  {hotels
                    .filter((h) => h.ville === villeActive)
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.nom}
                      </option>
                    ))}
                </select>

                {selectedHotelId !== 'all' && (
                  <button
                    type="button"
                    onClick={handleDeleteHotel}
                    title="Supprimer cet hôtel et ses chambres"
                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 shrink-0 ml-2">
                {chambresFiltrees.length} chambre{chambresFiltrees.length > 1 ? 's' : ''}
              </span>
            </div>

            {chambresFiltrees.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3">
                <BedDouble size={28} className="mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-700">Aucun hôtel ou chambre enregistré pour {villeActive} ({selectedYear !== 'all' ? selectedYear : 'cette campagne'})</p>
                <button
                  onClick={() => {
                    if (hotels.filter((h) => h.ville === villeActive).length === 0) {
                      setShowAddHotelModal(true)
                    } else {
                      setChambreTargetHotelId(hotels.find((h) => h.ville === villeActive)?.id || '')
                      setShowAddChambreModal(true)
                    }
                  }}
                  className="px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Ajouter un hôtel pour {selectedYear !== 'all' ? selectedYear : 'cette campagne'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {chambresFiltrees.map((chambre) => {
                  const occupants = pelerins.filter((p) =>
                    villeActive === 'Mecque'
                      ? p.chambre_mecque_id === chambre.id
                      : p.chambre_medine_id === chambre.id
                  )

                  const placesRestantes = Math.max(0, chambre.capacite - occupants.length)
                  const isPlein = placesRestantes === 0
                  const hasEnoughRoomForBatch = countSelected > 0 && placesRestantes >= countSelected

                  const titreAffiche = chambre.numero_chambre && chambre.numero_chambre.trim() !== ''
                    ? `Chambre N° ${chambre.numero_chambre}`
                    : `Chambre ${getLabelTypeChambre(chambre.capacite)}`

                  return (
                    <div
                      key={chambre.id}
                      className={`bg-white border rounded-2xl p-3.5 shadow-xs flex flex-col justify-between transition ${
                        hasEnoughRoomForBatch
                          ? 'border-emerald-400 ring-2 ring-emerald-500/20 bg-emerald-50/10'
                          : countSelected > 0 && placesRestantes < countSelected && !isPlein
                          ? 'border-amber-200 bg-amber-50/10 opacity-75'
                          : 'border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-black text-sm text-slate-900">
                            {titreAffiche}
                            {chambre.etage && (
                              <span className="text-[10px] text-slate-400 font-sans ml-1">
                                (Étage {chambre.etage})
                              </span>
                            )}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                                isPlein
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {occupants.length} / {chambre.capacite} lits
                            </span>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                exportPdfChambreUnique(chambre)
                              }}
                              title="Fiche PDF A4 de cette chambre"
                              className="p-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-500 transition cursor-pointer"
                            >
                              <Printer size={13} />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteChambre(chambre)
                              }}
                              title="Supprimer cette chambre"
                              className="p-1 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between mb-2.5">
                          <span className="truncate pr-1">{chambre.hotel_nom}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                              chambre.genre_chambre === 'Femmes'
                                ? 'bg-pink-50 text-pink-600'
                                : chambre.genre_chambre === 'Hommes'
                                ? 'bg-sky-50 text-sky-600'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {chambre.genre_chambre}
                          </span>
                        </div>

                        <div className="space-y-1.5 pt-2 border-t border-slate-100 min-h-[70px]">
                          {occupants.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic text-center py-2.5">
                              {getLabelTypeChambre(chambre.capacite)} libre ({placesRestantes} lits)
                            </p>
                          ) : (
                            occupants.map((occ) => {
                              const age = calculateAge(occ.date_naissance)
                              const nomOccAffichage = formatNomComplet(occ)
                              return (
                                <div
                                  key={occ.id}
                                  className="flex items-center justify-between bg-slate-50 px-2 py-1.5 rounded-lg text-xs"
                                >
                                  <div className="truncate pr-1">
                                    <span className="font-semibold text-slate-700">
                                      {nomOccAffichage}
                                    </span>
                                    {age && (
                                      <span className="text-[10px] text-slate-400 ml-1">
                                        ({age} ans)
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => retirerChambre(occ.id)}
                                    title="Retirer"
                                    className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer shrink-0"
                                  >
                                    <UserMinus size={13} />
                                  </button>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>

                      {countSelected > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100">
                          {hasEnoughRoomForBatch ? (
                            <button
                              type="button"
                              onClick={() => assignerGroupeDansChambre(chambre, placesRestantes)}
                              disabled={isProcessing}
                              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm active:scale-98 cursor-pointer disabled:opacity-50"
                            >
                              <UserCheck size={14} />
                              <span>Placer les {countSelected} ici ({placesRestantes} libres)</span>
                            </button>
                          ) : isPlein ? (
                            <div className="text-center py-1 text-[10px] text-rose-500 font-bold bg-rose-50 rounded-lg">
                              Chambre complète
                            </div>
                          ) : (
                            <div className="text-center py-1 text-[10px] text-amber-700 font-bold bg-amber-50 rounded-lg flex items-center justify-center gap-1">
                              <AlertCircle size={12} />
                              <span>Pas assez de place ({placesRestantes} dispo pour {countSelected})</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddHotelModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-sm w-full p-5 space-y-3.5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <Building2 size={16} className="text-blue-600" />
                <h3 className="text-xs font-black text-slate-900">
                  Ajouter un Hôtel ({villeActive} - {selectedYear !== 'all' ? selectedYear : 'Campagne courante'})
                </h3>
              </div>
              <button onClick={() => setShowAddHotelModal(false)} className="text-slate-400 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {modalError && (
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateHotel} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Nom officiel de l'hôtel *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nom de l'hôtel"
                  value={nouveauNomHotel}
                  onChange={(e) => setNouveauNomHotel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Adresse / Quartier
                </label>
                <input
                  type="text"
                  placeholder="Adresse ou quartier"
                  value={nouvelleAdresseHotel}
                  onChange={(e) => setNouvelleAdresseHotel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddHotelModal(false)}
                  className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isCreatingHotel}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingHotel ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddChambreModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-sm w-full p-5 space-y-3.5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <BedDouble size={16} className="text-blue-600" />
                <h3 className="text-xs font-black text-slate-900">
                  Ajouter des Chambres
                </h3>
              </div>
              <button onClick={() => setShowAddChambreModal(false)} className="text-slate-400 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {modalError && (
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateChambre} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Hôtel rattaché *
                </label>
                <select
                  required
                  value={chambreTargetHotelId}
                  onChange={(e) => setChambreTargetHotelId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-600 cursor-pointer"
                >
                  {hotels
                    .filter((h) => h.ville === villeActive)
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.nom} ({h.ville})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Type de Chambre / Capacité Lits *
                </label>
                <select
                  value={capaciteSelectionnee}
                  onChange={(e) => setCapaciteSelectionnee(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-600 cursor-pointer"
                >
                  {TYPES_CHAMBRES_HAJJ.map((type) => (
                    <option key={type.capacite} value={type.capacite}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-100 space-y-2.5">
                <div className="flex items-center gap-1.5 text-blue-700 text-xs font-bold">
                  <Sparkles size={14} />
                  <span>Quantité & Numéro</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 block mb-1">
                      Nombre de chambres
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={nombreChambresACreer}
                      onChange={(e) => setNombreChambresACreer(Math.max(1, Number(e.target.value)))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-500 block mb-1">
                      Numéro (Optionnel)
                    </label>
                    <input
                      type="text"
                      placeholder="Laisser vide si non numérotée"
                      value={chambreNumeroPattern}
                      onChange={(e) => setChambreNumeroPattern(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Étage (Optionnel)
                  </label>
                  <input
                    type="text"
                    placeholder="Étage"
                    value={chambreEtage}
                    onChange={(e) => setChambreEtage(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Genre
                  </label>
                  <select
                    value={chambreGenre}
                    onChange={(e) => setChambreGenre(e.target.value as any)}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="Hommes">Hommes</option>
                    <option value="Femmes">Femmes</option>
                    <option value="Mixte">Mixte</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddChambreModal(false)}
                  className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isCreatingChambre}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingChambre
                    ? 'Création…'
                    : nombreChambresACreer > 1
                    ? `Créer les ${nombreChambresACreer} chambres`
                    : 'Créer la chambre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}