/* eslint-disable @next/next/no-img-element */
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@powersync/react'
import { supabase, getUser } from '@/lib/supabase'
import {
  ScanLine,
  Loader2,
  Save,
  Upload,
  RotateCcw,
  Smartphone,
  CalendarDays,
  UserRound,
  FileText,
  Camera,
  Image as ImageIcon,
  Crop,
  Check,
  X,
  Keyboard,
  Radio,
  FileCheck,
  Printer,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  UserPlus,
  Undo2,
  CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'
import { uploadPassportFile } from '@/lib/hajjPassport'
import {
  HAJJ_CURRENCIES,
  formatHajjMoney,
  getHajjCurrencySymbol,
  normalizeHajjCurrency,
  type HajjCurrency,
} from '@/lib/hajjCurrency'
import { useWorkProfile } from '@/lib/ProfileContext'
import { useUI } from '@/lib/UIContext'
import { useYear } from '@/lib/YearContext'
import {
  parseMrzSmart,
  type MrzFieldKey,
  type MrzParseResult,
} from '@/lib/mrzEngine'
import {
  applyPureWhiteBackgroundNusuk,
  autoDetectAndCropNusuk,
  compressAndFormatPassportNusuk,
  ensureFaceModelsLoaded,
  formatNusukSquare,
  loadHtmlImage,
  readFileAsCleanDataUrl,
  renderNusukPhoto,
  rotateImageDataUrl,
  type NusukPhotoQuality,
} from '@/lib/passportFaceNusuk'
import {
  detectMrzRegionAuto,
  readMrzHybrid,
  scanPassportComplete,
  type MrzBoxRegion,
} from '@/lib/passportScanner'
import { PassportCameraModal } from '@/components/hajj/PassportCameraModal'
import {
  FreeRectCropModal,
  NusukPhotoCropModal,
} from '@/components/hajj/PassportCropModals'

const DRAFT_STORAGE_KEY = 'hajj_add_pelerin_draft_v2'

function isRunningInTauri(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    '__TAURI_INTERNALS__' in window ||
      '__TAURI__' in window ||
      window.location.protocol.startsWith('tauri') ||
      window.location.origin.includes('tauri.localhost')
  )
}

function humanizeError(
  err: unknown,
  fallback = "Une erreur inattendue s'est produite. Veuillez réessayer."
): string {
  if (!err) return fallback
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err)

  const lower = raw.toLowerCase()

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('err_internet_disconnected') ||
    lower.includes('offline')
  ) {
    return 'Impossible de se connecter à Internet. Vérifiez votre connexion et réessayez.'
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return "L'opération a pris trop de temps. Vérifiez votre connexion Internet et réessayez."
  }
  if (
    lower.includes('duplicate key') ||
    lower.includes('unique constraint') ||
    lower.includes('already exists')
  ) {
    return 'Ce pèlerin ou ce numéro de passeport est déjà enregistré.'
  }
  if (
    lower.includes('jwt') ||
    lower.includes('unauthorized') ||
    lower.includes('not authenticated') ||
    lower.includes('session')
  ) {
    return 'Votre session a expiré. Veuillez vous reconnecter à votre compte.'
  }
  if (
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('rls')
  ) {
    return "Vous n'avez pas l'autorisation d'effectuer cette action."
  }
  if (
    lower.includes('payload too large') ||
    lower.includes('entity too large') ||
    lower.includes('file size')
  ) {
    return 'Le fichier choisi est trop volumineux. Veuillez essayer avec une image plus légère.'
  }
  if (lower.includes('canvas') || lower.includes('blob') || lower.includes('image')) {
    return 'Impossible de préparer cette image. Essayez avec une autre photo plus nette.'
  }
  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('internal server error')
  ) {
    return 'Le service est momentanément indisponible. Veuillez réessayer dans quelques instants.'
  }
  if (
    /[éèêàùçîôû]/i.test(raw) &&
    !lower.includes('supabase') &&
    !lower.includes('error') &&
    !lower.includes('exception')
  ) {
    return raw
  }
  return fallback
}

function base64ToFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

interface ExistingPelerinRow {
  id: string
  nom_complet: string | null
  prenom: string | null
  num_passeport: string | null
  campagne: number | null
  nom_package: string | null
  prix_package: number | null
  devise: string | null
  reference: string | null
  agence_ou_personne_associee: string | null
}

interface SavedDossierSummary {
  id: string
  nomComplet: string
  numPasseport: string
  reste: number
  devise: HajjCurrency
}

export default function AjouterPelerin() {
  const { profile: workProfile } = useWorkProfile()
  const { setHideNavbar } = useUI()
  const { selectedYear } = useYear()

  // Modales & Caméra
  const [cameraModalOpen, setCameraModalOpen] = useState(false)
  const [mobileScannerSheetOpen, setMobileScannerSheetOpen] = useState(false)
  const [savedSummary, setSavedSummary] = useState<SavedDossierSummary | null>(null)

  // Champs du formulaire
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [reference, setReference] = useState('')
  const [passeport, setPasseport] = useState('')
  const [phone, setPhone] = useState('')
  const [sexe, setSexe] = useState('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [dateExpiration, setDateExpiration] = useState('')
  const [dateInscription, setDateInscription] = useState(
    () => new Date().toISOString().split('T')[0]
  )
  const [campagne, setCampagne] = useState<number | null>(() =>
    selectedYear === 'all' ? new Date().getFullYear() : Number(selectedYear)
  )
  const [associe, setAssocie] = useState('')
  const [total, setTotal] = useState(0)
  const [totalInput, setTotalInput] = useState('')
  const [paye, setPaye] = useState(0)
  const [payeInput, setPayeInput] = useState('')
  const [devise, setDevise] = useState<HajjCurrency>('FCFA')
  const [nomPackage, setNomPackage] = useState('')
  const [notes, setNotes] = useState('')

  // Audit de vérification MRZ & contrôle qualité
  const [mrzAudit, setMrzAudit] = useState<MrzParseResult | null>(null)
  const [confirmedFields, setConfirmedFields] = useState<Record<string, boolean>>({})
  const [confirmDuplicateOverride, setConfirmDuplicateOverride] = useState(false)

  // Sources d'images SÉPARÉES (évite tout écrasement entre photo séparée et page passeport)
  const [passportSourceSrc, setPassportSourceSrc] = useState<string | null>(null)
  const [photoSourceSrc, setPhotoSourceSrc] = useState<string | null>(null)

  // Fichiers finaux prêts à envoyer
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoQuality, setPhotoQuality] = useState<NusukPhotoQuality | null>(null)
  const [originalPhotoBackup, setOriginalPhotoBackup] = useState<{
    file: File
    dataUrl: string
  } | null>(null)
  const [isRemovingBg, setIsRemovingBg] = useState(false)
  const [whiteBgApplied, setWhiteBgApplied] = useState(false)

  const [fileToUpload, setFileToUpload] = useState<File | null>(null)

  // Scanners matériels (USB / TWAIN / Pleine page / Douchette)
  const [showPhysicalScannerInput, setShowPhysicalScannerInput] = useState(false)
  const [mrzBuffer, setMrzBuffer] = useState('')
  const physicalInputRef = useRef<HTMLInputElement>(null)
  const mrzTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [isTwainScanning, setIsTwainScanning] = useState(false)
  const [isFullPageListening, setIsFullPageListening] = useState(false)
  const fullPageWsRef = useRef<WebSocket | null>(null)

  // États des 3 modales de recadrage précis
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; size: number }>({
    x: 0,
    y: 0,
    size: 200,
  })
  const [cropImgDims, setCropImgDims] = useState<{ width: number; height: number }>({
    width: 1,
    height: 1,
  })

  const [passportCropModalOpen, setPassportCropModalOpen] = useState(false)
  const [passportCropBox, setPassportCropBox] = useState<{
    x: number
    y: number
    width: number
    height: number
  }>({ x: 0, y: 0, width: 400, height: 300 })
  const [passportImgDims, setPassportImgDims] = useState<{ width: number; height: number }>({
    width: 1,
    height: 1,
  })

  const [mrzModalOpen, setMrzModalOpen] = useState(false)
  const [mrzCropBox, setMrzCropBox] = useState<MrzBoxRegion>({
    x: 0,
    y: 0,
    width: 300,
    height: 80,
  })
  const [mrzImgDims, setMrzImgDims] = useState<{ width: number; height: number }>({
    width: 1,
    height: 1,
  })

  const [loading, setLoading] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scanStageText, setScanStageText] = useState('')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' | '' }>({
    text: '',
    type: '',
  })

  const [agenceId, setAgenceId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [profileReady, setProfileReady] = useState(false)

  const { data: localProfiles } = useQuery<{ agence_id: string | null }>(
    'SELECT agence_id FROM profiles WHERE id = ?',
    [userId ?? '']
  )

  // Lecture locale instantanée des pèlerins de l'agence (pour anti-doublon passeport + suggestions forfaits/groupes)
  const { data: agencyPelerins } = useQuery<ExistingPelerinRow>(
    `SELECT id, nom_complet, prenom, num_passeport, campagne, nom_package, prix_package, devise, reference, agence_ou_personne_associee
     FROM pelerins
     WHERE agence_id = ?
     ORDER BY created_at DESC
     LIMIT 400`,
    [agenceId ?? '__none__']
  )

  useEffect(() => {
    async function fetchUserAgence() {
      try {
        const {
          data: { user },
        } = await getUser()
        if (user) {
          setUserId(user.id)
          setProfileReady(true)
          const { data: profile } = await supabase
            .from('profiles')
            .select('agence_id')
            .eq('id', user.id)
            .single()

          if (profile?.agence_id) setAgenceId(profile.agence_id)
        }
      } catch (error) {
        console.error('[AjouterPelerin] getUser error', error)
      } finally {
        setProfileReady(true)
      }
    }
    fetchUserAgence()
  }, [])

  // Préchargement silencieux en arrière-plan (idle) des modèles visage
  useEffect(() => {
    const idleTimer = setTimeout(() => {
      ensureFaceModelsLoaded().catch(() => {})
    }, 900)
    return () => {
      clearTimeout(idleTimer)
      if (fullPageWsRef.current) {
        fullPageWsRef.current.close()
        fullPageWsRef.current = null
      }
      if (mrzTimeoutRef.current) clearTimeout(mrzTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const localAgenceId = localProfiles?.[0]?.agence_id
    if (localAgenceId) setAgenceId(localAgenceId)
  }, [localProfiles])

  useEffect(() => {
    setCampagne(selectedYear === 'all' ? new Date().getFullYear() : Number(selectedYear))
  }, [selectedYear])

  // Restauration du brouillon de session (anti-perte sur appel téléphonique / mise en veille)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.nom) setNom(d.nom)
      if (d.prenom) setPrenom(d.prenom)
      if (d.reference) setReference(d.reference)
      if (d.passeport) setPasseport(d.passeport)
      if (d.phone) setPhone(d.phone)
      if (d.sexe) setSexe(d.sexe)
      if (d.dateNaissance) setDateNaissance(d.dateNaissance)
      if (d.dateExpiration) setDateExpiration(d.dateExpiration)
      if (d.associe) setAssocie(d.associe)
      if (d.nomPackage) setNomPackage(d.nomPackage)
      if (d.notes) setNotes(d.notes)
      if (d.devise) setDevise(normalizeHajjCurrency(d.devise))
      if (typeof d.total === 'number' && d.total > 0) {
        setTotal(d.total)
        setTotalInput(d.total.toLocaleString('fr-FR'))
      }
      if (typeof d.paye === 'number' && d.paye > 0) {
        setPaye(d.paye)
        setPayeInput(d.paye.toLocaleString('fr-FR'))
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      if (!nom && !prenom && !passeport && !phone && !notes && !total) return
      sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          nom,
          prenom,
          reference,
          passeport,
          phone,
          sexe,
          dateNaissance,
          dateExpiration,
          associe,
          nomPackage,
          notes,
          devise,
          total,
          paye,
        })
      )
    } catch {}
  }, [
    nom,
    prenom,
    reference,
    passeport,
    phone,
    sexe,
    dateNaissance,
    dateExpiration,
    associe,
    nomPackage,
    notes,
    devise,
    total,
    paye,
  ])

  useEffect(() => {
    setHideNavbar(
      Boolean(
        cameraModalOpen ||
          mrzModalOpen ||
          cropModalOpen ||
          passportCropModalOpen ||
          mobileScannerSheetOpen ||
          savedSummary
      )
    )
    return () => setHideNavbar(false)
  }, [
    cameraModalOpen,
    mrzModalOpen,
    cropModalOpen,
    passportCropModalOpen,
    mobileScannerSheetOpen,
    savedSummary,
    setHideNavbar,
  ])

  // ── Contrôles métier automatiques (Expiration, Âge, Doublon, Suggestions) ──
  const passportValidityInfo = useMemo(() => {
    if (!dateExpiration) return { status: 'empty' as const, monthsLeft: 0 }
    const exp = new Date(dateExpiration)
    if (isNaN(exp.getTime())) return { status: 'empty' as const, monthsLeft: 0 }
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    if (exp < now) {
      return { status: 'expired' as const, monthsLeft: 0 }
    }
    const sixMonths = new Date(now)
    sixMonths.setMonth(sixMonths.getMonth() + 6)
    const monthsLeft = Math.max(
      0,
      Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    )
    if (exp < sixMonths) {
      return { status: 'soon' as const, monthsLeft }
    }
    return { status: 'valid' as const, monthsLeft }
  }, [dateExpiration])

  const pilgrimAgeInfo = useMemo(() => {
    if (!dateNaissance) return null
    const dob = new Date(dateNaissance)
    if (isNaN(dob.getTime())) return null
    const now = new Date()
    let age = now.getFullYear() - dob.getFullYear()
    const m = now.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
    if (age < 0 || age > 118) return { age, invalid: true }
    return { age, invalid: false }
  }, [dateNaissance])

  const duplicatePassportMatch = useMemo(() => {
    const cleanNum = passeport.replace(/\s+/g, '').toUpperCase()
    if (cleanNum.length < 5 || !agencyPelerins?.length) return null
    const matches = agencyPelerins.filter(
      (p) => (p.num_passeport || '').replace(/\s+/g, '').toUpperCase() === cleanNum
    )
    if (!matches.length) return null
    const sameCampagne = matches.find((m) => Number(m.campagne) === Number(campagne))
    return {
      record: sameCampagne || matches[0],
      isSameCampagne: Boolean(sameCampagne),
    }
  }, [passeport, agencyPelerins, campagne])

  useEffect(() => {
    setConfirmDuplicateOverride(false)
  }, [passeport, campagne])

  const smartSuggestions = useMemo(() => {
    const packagesMap = new Map<
      string,
      { name: string; price: number; devise: HajjCurrency; count: number }
    >()
    const refsCount = new Map<string, number>()
    const associesCount = new Map<string, number>()

    for (const p of agencyPelerins || []) {
      const pkg = (p.nom_package || '').trim().toUpperCase()
      if (pkg) {
        const prev = packagesMap.get(pkg)
        const curDev = normalizeHajjCurrency(p.devise)
        packagesMap.set(pkg, {
          name: pkg,
          price: p.prix_package && p.prix_package > 0 ? p.prix_package : prev?.price || 0,
          devise: curDev,
          count: (prev?.count || 0) + 1,
        })
      }
      const ref = (p.reference || '').trim().toUpperCase()
      if (ref) refsCount.set(ref, (refsCount.get(ref) || 0) + 1)

      const assoc = (p.agence_ou_personne_associee || '').trim().toUpperCase()
      if (assoc) associesCount.set(assoc, (associesCount.get(assoc) || 0) + 1)
    }

    return {
      packages: Array.from(packagesMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      references: Array.from(refsCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k]) => k),
      associes: Array.from(associesCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k]) => k),
    }
  }, [agencyPelerins])

  const campaignOptions = useMemo(() => {
    const currentY = new Date().getFullYear()
    const end = currentY + 6
    const years: number[] = []
    for (let y = 2024; y <= end; y++) years.push(y)
    if (campagne && !years.includes(campagne)) years.push(campagne)
    return years.sort((a, b) => a - b)
  }, [campagne])

  const isOverpaid = total > 0 && paye > total

  const isFieldFlagged = (field: MrzFieldKey): boolean => {
    if (!mrzAudit) return false
    if (confirmedFields[field]) return false
    return mrzAudit.unverifiedFields.includes(field)
  }

  const markFieldEdited = (field: MrzFieldKey) => {
    setConfirmedFields((prev) => (prev[field] ? prev : { ...prev, [field]: true }))
  }

  // ── Application centralisée d'un résultat MRZ ──
  const applyMrzFields = (mrz: MrzParseResult) => {
    setMrzAudit(mrz)
    setConfirmedFields({})
    if (mrz.nom) setNom(mrz.nom)
    if (mrz.prenom) setPrenom(mrz.prenom)
    if (mrz.numPasseport) setPasseport(mrz.numPasseport)
    if (mrz.sexe) setSexe(mrz.sexe)
    if (mrz.dateNaissance) setDateNaissance(mrz.dateNaissance)
    if (mrz.dateExpiration) setDateExpiration(mrz.dateExpiration)
  }

  // ── Exécution complète du scan rapide passeport + photo ──
  const executeFullPassportScan = async (input: File | string) => {
    setIsScanning(true)
    setScanStageText('Lecture rapide du passeport…')
    setMessage({
      text: '⏳ Lecture rapide du passeport en cours…',
      type: 'info',
    })

    try {
      const outcome = await scanPassportComplete(input, {
        onMrzReady: (mrz, ms) => {
          applyMrzFields(mrz)
          setScanStageText(`Informations remplies (${(ms / 1000).toFixed(1)}s) • Photo en cours…`)
        },
      })

      setPassportSourceSrc(outcome.masterPassportDataUrl)
      setPhotoSourceSrc(outcome.masterPassportDataUrl)
      setMrzCropBox(outcome.mrzBox)

      if (outcome.passportFile) {
        setFileToUpload(outcome.passportFile)
      }

      if (outcome.photoResult) {
        setPhotoFile(outcome.photoResult.file)
        setPhotoPreview(outcome.photoResult.dataUrl)
        setPhotoQuality(outcome.photoResult.quality)
        setOriginalPhotoBackup({
          file: outcome.photoResult.file,
          dataUrl: outcome.photoResult.dataUrl,
        })
        setWhiteBgApplied(false)
        setCropBox(outcome.photoResult.cropBox)
        setCropImgDims(outcome.photoResult.dims)
        setMrzImgDims(outcome.photoResult.dims)
      }

      if (outcome.mrzResult) {
        applyMrzFields(outcome.mrzResult)
        const unv = outcome.mrzResult.unverifiedFields
        const sec = (outcome.elapsedMs / 1000).toFixed(1)

        if (unv.length === 0) {
          setMessage({
            text: `✅ Passeport lu en ${sec}s et photo d'identité prête !`,
            type: 'success',
          })
        } else {
          setMessage({
            text: `✅ Passeport lu en ${sec}s. Vérifiez les champs signalés en orange.`,
            type: 'info',
          })
        }
      } else {
        setMessage({
          text: "⚠️ Photo d'identité et copie du passeport prêtes, mais les écritures sont floues. Cliquez sur « Relire le code » ou complétez les champs.",
          type: 'info',
        })
      }
    } catch (err: unknown) {
      console.error(err)
      setMessage({
        text: `⚠️ ${humanizeError(err, 'Impossible de traiter cette image de passeport.')}`,
        type: 'error',
      })
    } finally {
      setIsScanning(false)
      setScanStageText('')
    }
  }

  const handleGalleryScanInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    await executeFullPassportScan(f)
  }

  // Ouverture manuelle de la zone MRZ si l'utilisateur veut recibler précisément les 2 lignes
  const openManualMrzModal = async () => {
    if (!passportSourceSrc) return
    try {
      const auto = await detectMrzRegionAuto(passportSourceSrc)
      setMrzImgDims(auto.dims)
      if (!mrzCropBox.width || mrzCropBox.width === 300) {
        setMrzCropBox(auto.region)
      }
      setMrzModalOpen(true)
    } catch {
      setMrzModalOpen(true)
    }
  }

  const handleConfirmManualMrzRescan = async () => {
    if (!passportSourceSrc) return
    setMrzModalOpen(false)
    setIsScanning(true)
    setScanStageText('Lecture rapide en cours…')
    setMessage({ text: '⏳ Nouvelle lecture de la zone sélectionnée…', type: 'info' })

    try {
      const mrz = await readMrzHybrid(passportSourceSrc, mrzCropBox)
      applyMrzFields(mrz)
      if (mrz.unverifiedFields.length === 0) {
        setMessage({
          text: '✅ Informations du passeport lues avec succès !',
          type: 'success',
        })
      } else {
        setMessage({
          text: '✅ Lecture terminée. Vérifiez les champs surlignés en orange.',
          type: 'info',
        })
      }
    } catch (err: unknown) {
      setMessage({
        text: `⚠️ ${humanizeError(err, 'Impossible de lire cette zone MRZ.')}`,
        type: 'error',
      })
    } finally {
      setIsScanning(false)
      setScanStageText('')
    }
  }

  // Rotation 90° dans les modales de recadrage
  const handleRotatePhotoSource = async (deg: 90 | 270) => {
    if (!photoSourceSrc) return
    const rotated = await rotateImageDataUrl(photoSourceSrc, deg)
    setPhotoSourceSrc(rotated)
    const auto = await autoDetectAndCropNusuk(rotated)
    setCropImgDims(auto.dims)
    setCropBox(auto.cropBox)
  }

  const handleRotatePassportSource = async (deg: 90 | 270) => {
    if (!passportSourceSrc) return
    const rotated = await rotateImageDataUrl(passportSourceSrc, deg)
    setPassportSourceSrc(rotated)
    const auto = await detectMrzRegionAuto(rotated)
    setPassportImgDims(auto.dims)
    setPassportCropBox({ x: 0, y: 0, width: auto.dims.width, height: auto.dims.height })
    setMrzImgDims(auto.dims)
    setMrzCropBox(auto.region)
  }

  // Option 1-clic "Fond blanc pur IA (Nusuk)"
  const handleToggleWhiteBackground = async () => {
    if (whiteBgApplied && originalPhotoBackup) {
      setPhotoFile(originalPhotoBackup.file)
      setPhotoPreview(originalPhotoBackup.dataUrl)
      setWhiteBgApplied(false)
      setMessage({ text: "Photo rétablie avec son fond d'origine.", type: 'info' })
      return
    }

    if (!photoPreview || isRemovingBg) return
    setIsRemovingBg(true)
    setMessage({
      text: '⏳ Nettoyage du fond en blanc pur (norme Nusuk)…',
      type: 'info',
    })

    try {
      if (!originalPhotoBackup && photoFile) {
        setOriginalPhotoBackup({ file: photoFile, dataUrl: photoPreview })
      }
      const cleaned = await applyPureWhiteBackgroundNusuk(photoPreview)
      setPhotoFile(cleaned.file)
      setPhotoPreview(cleaned.dataUrl)
      setPhotoQuality((prev) =>
        prev
          ? { ...prev, sizeBytes: cleaned.sizeBytes, sizeOk: cleaned.sizeBytes <= 100 * 1024 }
          : null
      )
      setWhiteBgApplied(true)
      setMessage({
        text: '✅ Fond blanc pur appliqué avec succès (480×680 < 100 Ko) !',
        type: 'success',
      })
    } catch (err) {
      console.warn('Erreur détourage IA:', err)
      setMessage({
        text: "⚠️ Impossible d'isoler le fond automatiquement sur cette image. La photo recadrée reste conservée.",
        type: 'error',
      })
    } finally {
      setIsRemovingBg(false)
    }
  }

  // Scanners matériels TWAIN & Pleine Page
  const triggerTwainScan = async () => {
    setIsTwainScanning(true)
    setMessage({ text: '⏳ Numérisation en cours sur le scanner…', type: 'info' })

    if (isRunningInTauri()) {
      try {
        // @ts-expect-error Tauri API globale
        const tauriInvoke = window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke
        if (typeof tauriInvoke === 'function') {
          const rawResult: string = await tauriInvoke('scan_passport')
          if (rawResult) {
            const dataUrl = rawResult.startsWith('data:')
              ? rawResult
              : `data:image/jpeg;base64,${rawResult}`
            await executeFullPassportScan(dataUrl)
            setIsTwainScanning(false)
            return
          }
        }
      } catch (tauriErr) {
        console.warn('Bascule vers le scanner local :', tauriErr)
      }
    }

    try {
      const res = await fetch('http://127.0.0.1:18622/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'jpg', quality: 92, resolution: 300 }),
      }).catch(async () => {
        return await fetch('http://127.0.0.1:9090/scan', { method: 'POST' })
      })

      if (!res || !res.ok) {
        throw new Error(
          'Aucun scanner détecté. Vérifiez que votre scanner est bien branché et allumé.'
        )
      }

      const data = await res.json()
      const rawImageBase64 = data.imageBase64 || data.image || data.data
      if (!rawImageBase64) {
        throw new Error(
          "Le scanner n'a renvoyé aucune image. Vérifiez que le passeport est bien posé sur la vitre."
        )
      }

      const fullDataUrl = rawImageBase64.startsWith('data:')
        ? rawImageBase64
        : `data:image/jpeg;base64,${rawImageBase64}`

      await executeFullPassportScan(fullDataUrl)
    } catch (err: unknown) {
      console.error(err)
      setMessage({
        text: `⚠️ ${humanizeError(err, 'Impossible de communiquer avec le scanner.')}`,
        type: 'error',
      })
    } finally {
      setIsTwainScanning(false)
    }
  }

  const applyFullPageScanResult = async (res: Record<string, unknown>) => {
    if (typeof res.nom === 'string' && res.nom) setNom(res.nom)
    if (typeof res.prenom === 'string' && res.prenom) setPrenom(res.prenom)
    if (typeof res.numPasseport === 'string' && res.numPasseport) setPasseport(res.numPasseport)
    if (typeof res.sexe === 'string' && res.sexe) setSexe(res.sexe)
    if (typeof res.dateNaissance === 'string' && res.dateNaissance)
      setDateNaissance(res.dateNaissance)
    if (typeof res.dateExpiration === 'string' && res.dateExpiration)
      setDateExpiration(res.dateExpiration)

    if (typeof res.photoBase64 === 'string' && res.photoBase64) {
      const rawDataUrl = res.photoBase64.startsWith('data:')
        ? res.photoBase64
        : `data:image/jpeg;base64,${res.photoBase64}`
      setPhotoSourceSrc(rawDataUrl)
      const nusuk = await formatNusukSquare(rawDataUrl)
      setPhotoFile(nusuk.file)
      setPhotoPreview(nusuk.dataUrl)
      setOriginalPhotoBackup({ file: nusuk.file, dataUrl: nusuk.dataUrl })
      setWhiteBgApplied(false)
    }

    if (typeof res.pageFullBase64 === 'string' && res.pageFullBase64) {
      const fullDataUrl = res.pageFullBase64.startsWith('data:')
        ? res.pageFullBase64
        : `data:image/jpeg;base64,${res.pageFullBase64}`
      setPassportSourceSrc(fullDataUrl)
      try {
        const formatted = await compressAndFormatPassportNusuk(fullDataUrl)
        setFileToUpload(formatted.file)
      } catch {
        const fullFile = base64ToFile(
          fullDataUrl,
          `scan_complet_${String(res.numPasseport || Date.now())}.jpg`
        )
        setFileToUpload(fullFile)
      }
      if (!res.photoBase64) {
        try {
          setPhotoSourceSrc(fullDataUrl)
          const autoCrop = await autoDetectAndCropNusuk(fullDataUrl)
          setPhotoFile(autoCrop.file)
          setPhotoPreview(autoCrop.dataUrl)
          setPhotoQuality(autoCrop.quality)
          setOriginalPhotoBackup({ file: autoCrop.file, dataUrl: autoCrop.dataUrl })
          setCropBox(autoCrop.cropBox)
          setCropImgDims(autoCrop.dims)
        } catch {}
      }
    }
  }

  const toggleFullPageScanner = async () => {
    if (isFullPageListening) {
      if (fullPageWsRef.current) fullPageWsRef.current.close()
      setIsFullPageListening(false)
      setMessage({ text: 'Le scanner automatique est désactivé.', type: 'info' })
      return
    }

    if (isRunningInTauri()) {
      try {
        // @ts-expect-error Tauri API globale
        const tauriInvoke = window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke
        if (typeof tauriInvoke === 'function') {
          setMessage({ text: '⏳ Posez le passeport sur le scanner…', type: 'info' })
          const res = await tauriInvoke('scan_full_page')
          if (res) {
            await applyFullPageScanResult(res as Record<string, unknown>)
            setMessage({
              text: '✅ Passeport et photo récupérés avec succès !',
              type: 'success',
            })
            return
          }
        }
      } catch (e) {
        console.warn('Bascule vers le mode standard :', e)
      }
    }

    setMessage({ text: 'Connexion au scanner en cours…', type: 'info' })
    try {
      const ws = new WebSocket('ws://127.0.0.1:9090')
      fullPageWsRef.current = ws

      ws.onopen = () => {
        setIsFullPageListening(true)
        setMessage({
          text: '🟢 Scanner prêt : posez le passeport sur la vitre.',
          type: 'success',
        })
      }
      ws.onmessage = async (event) => {
        try {
          const res = JSON.parse(event.data)
          await applyFullPageScanResult(res)
          setMessage({
            text: '✅ Passeport et photo récupérés avec succès !',
            type: 'success',
          })
        } catch (e) {
          console.error(e)
        }
      }
      ws.onerror = () => {
        setIsFullPageListening(false)
        setMessage({
          text: "⚠️ Le scanner automatique ne répond pas. Vérifiez qu'il est bien branché et allumé.",
          type: 'error',
        })
      }
      ws.onclose = () => {
        setIsFullPageListening(false)
      }
    } catch {
      setIsFullPageListening(false)
    }
  }

  // Douchette physique USB HID (avec support AZERTY automatique + checksums ICAO)
  const evaluateMrzBuffer = (buffer: string) => {
    const parsed = parseMrzSmart(buffer, 'douchette')
    if (parsed && (parsed.nom || parsed.numPasseport || parsed.prenom)) {
      applyMrzFields(parsed)
      if (parsed.unverifiedFields.length === 0) {
        setMessage({
          text: '✅ Passeport lu avec succès !',
          type: 'success',
        })
      } else {
        setMessage({
          text: '⚠️ Lecture partielle par douchette : vérifiez les champs en orange.',
          type: 'info',
        })
      }
      setShowPhysicalScannerInput(false)
      setMrzBuffer('')
    }
  }

  const handlePhysicalScanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value
    setMrzBuffer(newVal)
    if (mrzTimeoutRef.current) clearTimeout(mrzTimeoutRef.current)
    if (newVal.length >= 20) {
      mrzTimeoutRef.current = setTimeout(() => {
        evaluateMrzBuffer(newVal)
      }, 110)
    }
  }

  const handlePhysicalScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (mrzTimeoutRef.current) clearTimeout(mrzTimeoutRef.current)
      mrzTimeoutRef.current = setTimeout(() => {
        evaluateMrzBuffer(mrzBuffer)
      }, 40)
    }
  }

  // Ajout séparé de la copie du passeport (image ou PDF)
  const handlePassportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    e.target.value = ''
    if (!selectedFile) return

    if (selectedFile.type.startsWith('image/')) {
      const { dataUrl } = await readFileAsCleanDataUrl(selectedFile, 2200)
      setPassportSourceSrc(dataUrl)

      const [formattedRes, faceRes] = await Promise.allSettled([
        compressAndFormatPassportNusuk(dataUrl),
        !photoFile ? autoDetectAndCropNusuk(dataUrl) : Promise.resolve(null),
      ])

      if (formattedRes.status === 'fulfilled') {
        setFileToUpload(formattedRes.value.file)
      } else {
        setFileToUpload(selectedFile)
      }

      if (faceRes.status === 'fulfilled' && faceRes.value) {
        const result = faceRes.value
        setPhotoSourceSrc(dataUrl)
        setPhotoFile(result.file)
        setPhotoPreview(result.dataUrl)
        setPhotoQuality(result.quality)
        setOriginalPhotoBackup({ file: result.file, dataUrl: result.dataUrl })
        setWhiteBgApplied(false)
        setCropBox(result.cropBox)
        setCropImgDims(result.dims)
        setMessage({
          text: "✅ Copie du passeport jointe et photo d'identité préparée automatiquement !",
          type: 'success',
        })
      } else {
        setMessage({ text: '✅ Copie du passeport ajoutée (< 400 Ko).', type: 'success' })
      }
    } else {
      setFileToUpload(selectedFile)
      setMessage({ text: '✅ Document PDF du passeport joint.', type: 'success' })
    }
  }

  // Ajout séparé d'une photo d'identité dédiée (SANS écraser passportSourceSrc !)
  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      const { dataUrl } = await readFileAsCleanDataUrl(file, 2000)
      setPhotoSourceSrc(dataUrl)
      const autoCrop = await autoDetectAndCropNusuk(dataUrl)
      setPhotoFile(autoCrop.file)
      setPhotoPreview(autoCrop.dataUrl)
      setPhotoQuality(autoCrop.quality)
      setOriginalPhotoBackup({ file: autoCrop.file, dataUrl: autoCrop.dataUrl })
      setWhiteBgApplied(false)
      setCropBox(autoCrop.cropBox)
      setCropImgDims(autoCrop.dims)
      setMessage({
        text: "✅ Photo d'identité alignée au format Nusuk (480×680 < 100 Ko) !",
        type: 'success',
      })
    } catch {
      setCropModalOpen(true)
    }
  }

  const openPhotoCropper = async () => {
    const src = photoSourceSrc || passportSourceSrc
    if (!src) return
    if (!photoSourceSrc) setPhotoSourceSrc(src)
    const img = await loadHtmlImage(src)
    setCropImgDims({ width: img.width, height: img.height })
    setCropModalOpen(true)
  }

  const handleConfirmCropNusuk = async () => {
    const src = photoSourceSrc || passportSourceSrc
    if (!src) return
    try {
      const img = await loadHtmlImage(src)
      const rendered = await renderNusukPhoto(img, cropBox.x, cropBox.y, cropBox.size)
      setPhotoFile(rendered.file)
      setPhotoPreview(rendered.dataUrl)
      setOriginalPhotoBackup({ file: rendered.file, dataUrl: rendered.dataUrl })
      setWhiteBgApplied(false)
      setPhotoQuality({
        width: 480,
        height: 680,
        sizeBytes: rendered.sizeBytes,
        sizeOk: rendered.sizeBytes <= 100 * 1024,
        faceDetected: true,
        landmarksAligned: true,
        tiltCorrectedDeg: 0,
      })
      setCropModalOpen(false)
      setMessage({ text: '✅ Photo du pèlerin ajustée (480×680) !', type: 'success' })
    } catch {
      setMessage({
        text: '⚠️ Impossible de recadrer la photo. Veuillez réessayer.',
        type: 'error',
      })
    }
  }

  const openPassportCropper = async () => {
    if (!passportSourceSrc) return
    const img = await loadHtmlImage(passportSourceSrc)
    setPassportImgDims({ width: img.width, height: img.height })
    setPassportCropBox({ x: 0, y: 0, width: img.width, height: img.height })
    setPassportCropModalOpen(true)
  }

  const handleConfirmPassportCrop = async () => {
    if (!passportSourceSrc) return
    try {
      const formatted = await compressAndFormatPassportNusuk(passportSourceSrc, passportCropBox)
      setFileToUpload(formatted.file)
      setPassportCropModalOpen(false)
      setMessage({ text: '✅ Copie du passeport recadrée (< 400 Ko) !', type: 'success' })
    } catch {
      setMessage({
        text: '⚠️ Impossible de recadrer le passeport. Veuillez réessayer.',
        type: 'error',
      })
    }
  }

  const resetForm = (keepGroupAndPackage = false) => {
    setNom('')
    setPrenom('')
    setPasseport('')
    setPhone('')
    setSexe('')
    setDateNaissance('')
    setDateExpiration('')
    setDateInscription(new Date().toISOString().split('T')[0])
    if (!keepGroupAndPackage) {
      setCampagne(selectedYear === 'all' ? new Date().getFullYear() : Number(selectedYear))
      setReference('')
      setAssocie('')
      setTotal(0)
      setTotalInput('')
      setNomPackage('')
    }
    setPaye(0)
    setPayeInput('')
    setNotes('')
    setFileToUpload(null)
    setPhotoFile(null)
    setPhotoPreview(null)
    setPhotoQuality(null)
    setOriginalPhotoBackup(null)
    setWhiteBgApplied(false)
    setPassportSourceSrc(null)
    setPhotoSourceSrc(null)
    setMrzAudit(null)
    setConfirmedFields({})
    setConfirmDuplicateOverride(false)
    setMrzBuffer('')
    setSavedSummary(null)
    setMessage({ text: '', type: '' })
    try {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY)
    } catch {}
  }

  const sanitizeAmount = (value: string) => value.replace(/\D/g, '')
  const parseAmount = (value: string) => {
    const cleaned = sanitizeAmount(value)
    return cleaned === '' ? 0 : Number(cleaned)
  }
  const formatAmount = (value: string | number) => {
    const digits = typeof value === 'number' ? String(value) : sanitizeAmount(value)
    return digits === '' ? '' : Number(digits).toLocaleString('fr-FR')
  }

  const applyPackageSuggestion = (pkg: {
    name: string
    price: number
    devise: HajjCurrency
  }) => {
    setNomPackage(pkg.name)
    if (total === 0 && pkg.price > 0) {
      setDevise(pkg.devise)
      setTotal(pkg.price)
      setTotalInput(formatAmount(pkg.price))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    if (!agenceId) {
      setMessage({
        text: profileReady
          ? "⚠️ Votre compte n'est rattaché à aucune agence. Veuillez contacter l'administrateur."
          : '⏳ Chargement de votre espace en cours, veuillez patienter…',
        type: 'error',
      })
      return
    }

    if (isOverpaid) {
      setMessage({
        text: "⚠️ L'acompte saisi dépasse le prix total du forfait. Vérifiez les montants.",
        type: 'error',
      })
      return
    }

    if (pilgrimAgeInfo?.invalid) {
      setMessage({
        text: '⚠️ La date de naissance semble invalide. Veuillez la vérifier avant enregistrement.',
        type: 'error',
      })
      return
    }

    if (duplicatePassportMatch?.isSameCampagne && !confirmDuplicateOverride) {
      setMessage({
        text: '⚠️ Ce numéro de passeport existe déjà dans cette campagne. Cochez la confirmation de doublon si vous souhaitez vraiment créer une seconde fiche.',
        type: 'error',
      })
      return
    }

    setLoading(true)
    try {
      const [uploadedDoc, uploadedPhoto] = await Promise.all([
        fileToUpload ? uploadPassportFile(fileToUpload) : Promise.resolve(null),
        photoFile ? uploadPassportFile(photoFile) : Promise.resolve(null),
      ])

      const fileUrl = uploadedDoc?.path || ''
      const photoUrl = uploadedPhoto?.path || ''
      const newId = crypto.randomUUID()

      const { error } = await supabase.from('pelerins').insert({
        id: newId,
        nom_complet: nom.trim().toUpperCase(),
        prenom: prenom.trim().toUpperCase(),
        reference: reference.trim().toUpperCase() || null,
        num_passeport: passeport.trim().toUpperCase() || null,
        telephone_pelerin: phone.trim() || null,
        sexe: sexe || null,
        date_naissance: dateNaissance || null,
        date_expiration: dateExpiration || null,
        date_inscription: dateInscription || null,
        campagne: campagne || null,
        prix_package: total,
        total_paye: paye,
        devise,
        nom_package: nomPackage.trim().toUpperCase() || null,
        document_url: fileUrl || null,
        photo_url: photoUrl || null,
        notes: notes.trim() || null,
        agence_id: agenceId,
        agence_ou_personne_associee: associe.trim().toUpperCase() || null,
        created_by_name: workProfile?.name?.trim() || null,
        created_by_role: workProfile?.profile_type || null,
        created_at: new Date().toISOString(),
      })
      if (error) throw error

      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY)
      } catch {}

      setSavedSummary({
        id: newId,
        nomComplet: `${nom.trim().toUpperCase()} ${prenom.trim().toUpperCase()}`.trim(),
        numPasseport: passeport.trim().toUpperCase(),
        reste: Math.max(0, total - paye),
        devise,
      })
      setMessage({
        text: '✅ Le dossier du pèlerin a été enregistré avec succès !',
        type: 'success',
      })
    } catch (err: unknown) {
      console.error(err)
      setMessage({
        text: `⚠️ ${humanizeError(
          err,
          "Impossible d'enregistrer le dossier. Vérifiez votre connexion et réessayez."
        )}`,
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  // ── Indicateur de conformité Nusuk du dossier ──
  const nusukChecklist = [
    { label: 'Identité', ok: Boolean(nom.trim() && prenom.trim() && sexe) },
    {
      label: 'Passeport valide',
      ok: Boolean(passeport.trim() && passportValidityInfo.status === 'valid'),
    },
    { label: 'Photo 480×680', ok: Boolean(photoFile) },
    { label: 'Copie < 400 Ko', ok: Boolean(fileToUpload) },
  ]

  // ── Composants réutilisés Mobile & PC pour éviter les divergences ──
  const renderMrzVerificationBanner = () => {
    if (!mrzAudit) return null
    const pendingUnverified = mrzAudit.unverifiedFields.filter((f) => !confirmedFields[f])
    const allOk = pendingUnverified.length === 0

    return (
      <div
        className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
          allOk
            ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
            : 'bg-amber-50/95 border-amber-300 text-amber-950'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-black flex items-center gap-1.5">
            {allOk ? (
              <>
                <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                <span>Lecture rapide vérifiée</span>
              </>
            ) : (
              <>
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                <span>Vérification conseillée sur {pendingUnverified.length} champ(s)</span>
              </>
            )}
          </span>
          {passportSourceSrc && (
            <button
              type="button"
              onClick={openManualMrzModal}
              className="text-[11px] font-black underline cursor-pointer shrink-0"
            >
              Relire le code
            </button>
          )}
        </div>
        {!allOk && (
          <p className="text-[11px] font-semibold">
            Contrôlez les champs encadrés en orange avant d&apos;enregistrer.
          </p>
        )}
      </div>
    )
  }

  const renderDuplicateWarning = () => {
    if (!duplicatePassportMatch) return null
    const { record, isSameCampagne } = duplicatePassportMatch
    return (
      <div
        className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
          isSameCampagne
            ? 'bg-rose-50 border-rose-300 text-rose-900'
            : 'bg-blue-50 border-blue-200 text-blue-900'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <p className="font-black flex items-center gap-1.5">
              <AlertTriangle
                size={15}
                className={isSameCampagne ? 'text-rose-600 shrink-0' : 'text-blue-600 shrink-0'}
              />
              <span>
                {isSameCampagne
                  ? `Passeport déjà inscrit en Campagne ${record.campagne}`
                  : `Ce passeport figure déjà en Campagne ${record.campagne || 'précédente'}`}
              </span>
            </p>
            <p className="font-bold text-[11px]">
              {record.nom_complet} {record.prenom}
            </p>
          </div>
          <Link
            href={`/hajj/pelerin?id=${record.id}`}
            className="px-2.5 py-1.5 rounded-xl bg-white border border-current/20 font-black text-[11px] flex items-center gap-1 shrink-0"
          >
            <span>Voir fiche</span>
            <ExternalLink size={12} />
          </Link>
        </div>

        {isSameCampagne && (
          <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmDuplicateOverride}
              onChange={(e) => setConfirmDuplicateOverride(e.target.checked)}
              className="w-4 h-4 rounded accent-rose-600"
            />
            <span className="text-[11px] font-bold">
              Je confirme vouloir créer quand même une nouvelle fiche
            </span>
          </label>
        )}
      </div>
    )
  }

  const renderFieldVerifyBadge = (field: MrzFieldKey) => {
    if (!isFieldFlagged(field)) return null
    return (
      <button
        type="button"
        onClick={() => markFieldEdited(field)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black cursor-pointer hover:bg-amber-200"
        title="Cliquez pour marquer comme vérifié"
      >
        <span>À vérifier • OK ?</span>
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 md:bg-gray-50 md:flex md:items-center md:justify-center p-0 md:p-6 lg:p-8">
      {/* =================================================================== */}
      {/* 📱 VERSION MOBILE NATIVE (`md:hidden`)                              */}
      {/* =================================================================== */}
      <div className="md:hidden pb-28">
        {/* 1. BARRE SUPÉRIEURE BLANCHE COLLANTE */}
        <div className="bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 sticky top-0 z-40 flex items-center justify-between gap-2">
          <Link
            href="/hajj/liste-pelerins"
            aria-label="Retour aux dossiers"
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center active:scale-90 transition shrink-0"
          >
            <ArrowLeft size={18} />
          </Link>

          <div className="min-w-0 flex-1 text-center px-1">
            <h1 className="text-base font-black text-blue-950 tracking-tight leading-tight truncate">
              Nouveau pèlerin
            </h1>
            <p className="text-[11px] font-semibold text-slate-400 truncate">
              {campagne ? `Campagne ${campagne}` : 'Inscription Hajj'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => resetForm(false)}
            aria-label="Vider le formulaire"
            className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 active:bg-rose-50 active:text-rose-600 flex items-center justify-center active:scale-90 transition shrink-0 cursor-pointer"
          >
            <RotateCcw size={17} />
          </button>
        </div>

        <div className="px-4 pt-3.5 space-y-3.5">
          {/* Barre compacte de conformité Nusuk */}
          <div className="bg-white rounded-2xl border border-blue-950/10 px-3 py-2.5 flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar">
            {nusukChecklist.map((item) => (
              <div
                key={item.label}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 shrink-0 ${
                  item.ok
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                    : 'bg-slate-50 text-slate-400 border border-slate-100'
                }`}
              >
                <CheckCircle2
                  size={12}
                  className={item.ok ? 'text-emerald-600' : 'text-slate-300'}
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Bannière de statut */}
          {message.text && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-bold border leading-relaxed ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : message.type === 'info'
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {message.text}
            </div>
          )}

          {renderMrzVerificationBanner()}

          {/* 2. CARTE SCAN PASSEPORT HAUTE PRÉCISION (Caméra Guidée 1-Tap + Galerie Directe) */}
          <div className="bg-white rounded-3xl border border-blue-950/12 shadow-xs p-4 space-y-3">
            <button
              type="button"
              disabled={isScanning || isTwainScanning}
              onClick={() => setCameraModalOpen(true)}
              className="w-full p-4 rounded-2xl bg-[#1E3A5F] text-white flex items-center gap-3.5 active:scale-[0.98] transition cursor-pointer shadow-sm text-left disabled:opacity-70"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                {isScanning || isTwainScanning ? (
                  <Loader2 size={22} className="animate-spin text-emerald-300" />
                ) : (
                  <Camera size={22} className="text-emerald-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black leading-tight">
                  {isScanning ? 'Lecture rapide…' : 'Scanner le passeport'}
                </p>
                <p className="text-[11px] text-blue-100/85 font-medium mt-0.5 leading-snug">
                  {scanStageText || 'Lecture rapide & photo 480×680 automatique'}
                </p>
              </div>
              <ChevronRight size={18} className="text-blue-200 shrink-0" />
            </button>

            <div className="grid grid-cols-2 gap-2">
              <label className="h-11 px-3 rounded-2xl bg-slate-100 active:bg-slate-200 text-slate-800 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition">
                <ImageIcon size={15} className="text-blue-700 shrink-0" />
                <span className="truncate">Depuis Galerie</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleGalleryScanInput}
                  disabled={isScanning}
                />
              </label>

              {passportSourceSrc ? (
                <button
                  type="button"
                  onClick={openManualMrzModal}
                  disabled={isScanning}
                  className="h-11 px-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                >
                  <ScanLine size={15} className="text-amber-600 shrink-0" />
                  <span className="truncate">Relire le code</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMobileScannerSheetOpen(true)}
                  className="h-11 px-3 rounded-2xl bg-slate-100 active:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Keyboard size={15} className="text-slate-600 shrink-0" />
                  <span className="truncate">Autres scanners</span>
                </button>
              )}
            </div>

            {passportSourceSrc && (
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-slate-400">
                  Douchette ou scanner USB ?
                </span>
                <button
                  type="button"
                  onClick={() => setMobileScannerSheetOpen(true)}
                  className="text-xs font-black text-blue-700 cursor-pointer"
                >
                  Autres modes →
                </button>
              </div>
            )}

            {showPhysicalScannerInput && (
              <div className="p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-200 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px] font-black text-emerald-800">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                    Prêt pour la douchette
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPhysicalScannerInput(false)}
                    className="w-7 h-7 rounded-full bg-white text-slate-500 flex items-center justify-center cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
                <input
                  autoFocus
                  type="text"
                  value={mrzBuffer}
                  onChange={handlePhysicalScanChange}
                  onKeyDown={handlePhysicalScanKeyDown}
                  placeholder="Glissez le passeport dans la douchette…"
                  className="w-full h-11 px-3.5 bg-white border border-emerald-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-500"
                />
              </div>
            )}
          </div>

          {/* 3. CARTE PHOTO NUSUK (480×680) & COPIE DU PASSEPORT */}
          <div className="bg-white rounded-3xl border border-blue-950/12 shadow-xs p-4 space-y-4">
            {/* Photo Nusuk */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Camera size={15} className="text-blue-600" />
                  Photo Nusuk (480×680)
                </span>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoFile(null)
                      setPhotoPreview(null)
                      setPhotoQuality(null)
                      setOriginalPhotoBackup(null)
                      setWhiteBgApplied(false)
                    }}
                    className="text-[11px] font-bold text-rose-500 active:opacity-70 cursor-pointer"
                  >
                    Supprimer
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3.5">
                <div className="w-20 h-28 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 relative">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Aperçu Nusuk"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={24} className="text-slate-300" />
                  )}
                  {photoPreview && (
                    <div
                      className={`absolute bottom-0 inset-x-0 text-[9px] font-black text-white text-center py-0.5 uppercase ${
                        photoQuality && !photoQuality.faceDetected
                          ? 'bg-amber-600'
                          : 'bg-emerald-600'
                      }`}
                    >
                      {photoQuality && !photoQuality.faceDetected ? 'À ajuster' : 'Nusuk OK'}
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {(photoSourceSrc || passportSourceSrc) && (
                      <button
                        type="button"
                        onClick={openPhotoCropper}
                        className="h-9 px-2.5 bg-blue-50 active:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-xl text-[11px] font-black flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <Crop size={13} />
                        <span>Ajuster</span>
                      </button>
                    )}

                    {photoPreview && (
                      <button
                        type="button"
                        disabled={isRemovingBg}
                        onClick={handleToggleWhiteBackground}
                        className={`h-9 px-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1 transition cursor-pointer border ${
                          whiteBgApplied
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {isRemovingBg ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : whiteBgApplied ? (
                          <Undo2 size={13} />
                        ) : (
                          <Sparkles size={13} />
                        )}
                        <span>{whiteBgApplied ? 'Origine' : 'Fond blanc'}</span>
                      </button>
                    )}
                  </div>

                  <label className="w-full h-9 px-3 bg-slate-100 active:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition">
                    <Upload size={13} />
                    <span>{photoFile ? 'Remplacer la photo' : 'Importer une photo'}</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handlePhotoFileChange}
                    />
                  </label>

                  <p className="text-[10px] text-slate-500 font-semibold leading-tight">
                    {photoFile
                      ? `480×680 px • ${(photoFile.size / 1024).toFixed(0)} Ko • Prête`
                      : '480×680 px (< 100 Ko) • Cadrage automatique'}
                  </p>
                </div>
              </div>
            </div>

            {/* Copie du passeport */}
            <div className="pt-3.5 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <FileCheck size={15} className="text-blue-600" />
                  Copie du passeport
                </span>
                {fileToUpload && (
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {(fileToUpload.size / 1024).toFixed(0)} Ko • Prêt
                  </span>
                )}
              </div>

              <label className="w-full min-h-[50px] px-3.5 py-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-300 active:bg-slate-100 flex items-center gap-3 cursor-pointer transition">
                <Upload size={17} className="text-blue-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800 truncate">
                    {fileToUpload ? fileToUpload.name : 'Joindre la copie du passeport'}
                  </p>
                  <p className="text-[10px] text-slate-400">Compression fidèle Nusuk &lt; 400 Ko</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                  onChange={handlePassportFileChange}
                />
              </label>

              {passportSourceSrc && (
                <button
                  type="button"
                  onClick={openPassportCropper}
                  className="w-full h-9 px-3 bg-white active:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Crop size={14} className="text-blue-600" />
                  <span>Recadrer le passeport</span>
                </button>
              )}
            </div>
          </div>

          {/* 4. FORMULAIRE MOBILE STRUCTURÉ PAR CARTES */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Carte Identité */}
            <div className="bg-white rounded-3xl border border-blue-950/12 shadow-xs p-5 space-y-4">
              <h2 className="text-sm font-black text-slate-900">Identité</h2>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-black uppercase text-slate-400">
                    Nom de famille *
                  </label>
                  {renderFieldVerifyBadge('nom')}
                </div>
                <input
                  type="text"
                  value={nom}
                  onChange={(e) => {
                    setNom(e.target.value)
                    markFieldEdited('nom')
                  }}
                  className={`w-full h-12 px-4 rounded-2xl border text-slate-900 text-sm font-bold outline-none transition uppercase ${
                    isFieldFlagged('nom')
                      ? 'border-amber-400 bg-amber-50/40'
                      : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-600'
                  }`}
                  placeholder="NOM DE FAMILLE"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-black uppercase text-slate-400">
                    Prénom(s) *
                  </label>
                  {renderFieldVerifyBadge('prenom')}
                </div>
                <input
                  type="text"
                  value={prenom}
                  onChange={(e) => {
                    setPrenom(e.target.value)
                    markFieldEdited('prenom')
                  }}
                  className={`w-full h-12 px-4 rounded-2xl border text-slate-900 text-sm font-bold outline-none transition uppercase ${
                    isFieldFlagged('prenom')
                      ? 'border-amber-400 bg-amber-50/40'
                      : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-600'
                  }`}
                  placeholder="TOUS LES PRÉNOMS"
                  required
                />
              </div>

              {/* Sexe */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-black uppercase text-slate-400">Sexe</label>
                  {renderFieldVerifyBadge('sexe')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['HOMME', 'FEMME'] as const).map((g) => {
                    const active = sexe === g
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          setSexe(active ? '' : g)
                          markFieldEdited('sexe')
                        }}
                        className={`h-11 rounded-2xl text-xs font-black transition active:scale-[0.98] cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {g === 'HOMME' ? 'Homme' : 'Femme'}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5 gap-1">
                    <label className="text-[11px] font-black uppercase text-slate-400">
                      Naissance
                    </label>
                    {pilgrimAgeInfo && !pilgrimAgeInfo.invalid && (
                      <span
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                          pilgrimAgeInfo.age < 18
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {pilgrimAgeInfo.age} ans
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    value={dateNaissance}
                    onChange={(e) => {
                      setDateNaissance(e.target.value)
                      markFieldEdited('dateNaissance')
                    }}
                    className={`w-full h-12 px-3 rounded-2xl border font-bold text-xs outline-none ${
                      isFieldFlagged('dateNaissance') || pilgrimAgeInfo?.invalid
                        ? 'border-amber-400 bg-amber-50/50 text-amber-950'
                        : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-600'
                    }`}
                  />
                  {renderFieldVerifyBadge('dateNaissance')}
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-400 block mb-1.5">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-12 px-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 font-bold text-sm outline-none focus:bg-white focus:border-blue-600"
                    placeholder="70 00 00 00"
                  />
                </div>
              </div>
            </div>

            {/* Carte Passeport & Dossier */}
            <div className="bg-white rounded-3xl border border-blue-950/12 shadow-xs p-5 space-y-4">
              <h2 className="text-sm font-black text-slate-900">Passeport & Dossier</h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black uppercase text-slate-400">
                      N° Passeport
                    </label>
                    {renderFieldVerifyBadge('passeport')}
                  </div>
                  <input
                    type="text"
                    value={passeport}
                    onChange={(e) => {
                      setPasseport(e.target.value)
                      markFieldEdited('passeport')
                    }}
                    className={`w-full h-12 px-3.5 rounded-2xl border font-mono font-bold text-sm outline-none uppercase ${
                      duplicatePassportMatch?.isSameCampagne
                        ? 'border-rose-400 bg-rose-50/50 text-rose-900'
                        : isFieldFlagged('passeport')
                        ? 'border-amber-400 bg-amber-50/50 text-amber-950'
                        : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-600'
                    }`}
                    placeholder="A000000"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black uppercase text-slate-400">
                      Expiration
                    </label>
                    {passportValidityInfo.status === 'valid' && (
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                        +{passportValidityInfo.monthsLeft}m
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    value={dateExpiration}
                    onChange={(e) => {
                      setDateExpiration(e.target.value)
                      markFieldEdited('dateExpiration')
                    }}
                    className={`w-full h-12 px-3 rounded-2xl border font-bold text-xs outline-none ${
                      passportValidityInfo.status === 'expired'
                        ? 'border-rose-500 bg-rose-50 text-rose-900'
                        : passportValidityInfo.status === 'soon' ||
                          isFieldFlagged('dateExpiration')
                        ? 'border-amber-500 bg-amber-50/50 text-amber-900'
                        : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-600'
                    }`}
                  />
                  {renderFieldVerifyBadge('dateExpiration')}
                </div>
              </div>

              {passportValidityInfo.status === 'expired' && (
                <p className="text-xs font-black text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  ⛔ Ce passeport est EXPIRÉ ! Renouvellement obligatoire pour Nusuk.
                </p>
              )}
              {passportValidityInfo.status === 'soon' && (
                <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  ⚠️ Passeport valide seulement {passportValidityInfo.monthsLeft} mois (&lt; 6 mois).
                </p>
              )}

              {renderDuplicateWarning()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-400 block mb-1.5">
                    Référence / Groupe
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full h-12 px-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 font-bold text-sm outline-none focus:bg-white focus:border-blue-600 uppercase"
                    placeholder="GRP-A"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-400 block mb-1.5">
                    Campagne
                  </label>
                  <select
                    value={campagne ?? ''}
                    onChange={(e) =>
                      setCampagne(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full h-12 px-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 font-bold text-sm outline-none focus:bg-white focus:border-blue-600"
                  >
                    <option value="">Sélectionner</option>
                    {campaignOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {smartSuggestions.references.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">Groupes :</span>
                  {smartSuggestions.references.map((refName) => (
                    <button
                      key={refName}
                      type="button"
                      onClick={() => setReference(refName)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 cursor-pointer border ${
                        reference.toUpperCase() === refName
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {refName}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-400 block mb-1.5">
                    Intermédiaire
                  </label>
                  <input
                    type="text"
                    value={associe}
                    onChange={(e) => setAssocie(e.target.value)}
                    className="w-full h-12 px-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 font-bold text-sm outline-none focus:bg-white focus:border-blue-600 uppercase"
                    placeholder="Associé / Agence"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-400 block mb-1.5">
                    Inscription
                  </label>
                  <input
                    type="date"
                    value={dateInscription}
                    onChange={(e) => setDateInscription(e.target.value)}
                    className="w-full h-12 px-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 font-bold text-xs outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              </div>

              {smartSuggestions.associes.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">Associés :</span>
                  {smartSuggestions.associes.map((aName) => (
                    <button
                      key={aName}
                      type="button"
                      onClick={() => setAssocie(aName)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 cursor-pointer border ${
                        associe.toUpperCase() === aName
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {aName}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Carte Forfait & Paiement */}
            <div className="bg-white rounded-3xl border border-blue-950/12 shadow-xs p-5 space-y-4">
              <h2 className="text-sm font-black text-slate-900">Forfait & Paiement</h2>

              {smartSuggestions.packages.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase text-slate-400 block">
                    Forfaits habituels (1 clic = nom + tarif)
                  </span>
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    {smartSuggestions.packages.map((pkg) => (
                      <button
                        key={pkg.name}
                        type="button"
                        onClick={() => applyPackageSuggestion(pkg)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 cursor-pointer border transition ${
                          nomPackage.toUpperCase() === pkg.name
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-blue-50/60 text-blue-900 border-blue-200/70'
                        }`}
                      >
                        {pkg.name}
                        {pkg.price > 0
                          ? ` • ${formatHajjMoney(pkg.price, pkg.devise)}`
                          : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1.5">
                  Devise de paiement
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl">
                  {HAJJ_CURRENCIES.map((cur) => {
                    const active = devise === cur.code
                    return (
                      <button
                        key={cur.code}
                        type="button"
                        onClick={() => setDevise(cur.code)}
                        className={`h-10 rounded-xl text-xs font-black transition active:scale-[0.98] cursor-pointer ${
                          active ? cur.pillActiveClass : 'text-slate-600'
                        }`}
                      >
                        {cur.shortLabel}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900 p-3.5 rounded-2xl">
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
                    Prix total ({getHajjCurrencySymbol(devise)}) *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9\s]*"
                    value={totalInput}
                    onChange={(e) => {
                      setTotalInput(formatAmount(e.target.value))
                      setTotal(parseAmount(e.target.value))
                    }}
                    placeholder="0"
                    className="w-full bg-transparent text-white font-black text-lg tabular-nums outline-none"
                    required
                  />
                </div>

                <div
                  className={`p-3.5 rounded-2xl ${
                    isOverpaid ? 'bg-rose-600' : 'bg-emerald-600'
                  }`}
                >
                  <label className="text-[10px] font-black text-white/80 uppercase block mb-1">
                    Acompte ({getHajjCurrencySymbol(devise)})
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9\s]*"
                    value={payeInput}
                    onChange={(e) => {
                      setPayeInput(formatAmount(e.target.value))
                      setPaye(parseAmount(e.target.value))
                    }}
                    placeholder="0"
                    className="w-full bg-transparent text-white font-black text-lg tabular-nums outline-none"
                  />
                </div>
              </div>

              {isOverpaid && (
                <p className="text-xs font-black text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  ⚠️ L&apos;acompte dépasse le prix total du forfait !
                </p>
              )}

              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-xs font-bold text-slate-500">Reste à payer</span>
                <span className="text-base font-black text-slate-900 tabular-nums">
                  {formatHajjMoney(Math.max(0, total - paye), devise)}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1.5">
                  Nom du package (optionnel)
                </label>
                <input
                  type="text"
                  value={nomPackage}
                  onChange={(e) => setNomPackage(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 font-bold text-sm outline-none focus:bg-white focus:border-blue-600 uppercase"
                  placeholder="Ex: PREMIUM, ÉCONOMIQUE…"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-400 block mb-1.5">
                  Notes & commentaires
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observations médicales, régime, demandes particulières…"
                  className="w-full p-3.5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm outline-none focus:bg-white focus:border-blue-600 resize-none"
                />
              </div>
            </div>

            {/* Bouton Enregistrer principal */}
            <button
              type="submit"
              disabled={loading || !agenceId || !profileReady || isOverpaid}
              className={`w-full h-14 rounded-2xl text-white font-black text-base shadow-lg active:scale-[0.98] transition flex items-center justify-center gap-2.5 cursor-pointer ${
                loading || !agenceId || !profileReady || isOverpaid
                  ? 'bg-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-blue-600 active:bg-blue-700 shadow-blue-600/25'
              }`}
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              <span>
                {loading
                  ? 'Enregistrement…'
                  : !profileReady
                  ? 'Chargement…'
                  : 'Enregistrer le dossier'}
              </span>
            </button>
          </form>
        </div>

        {/* Bottom Sheet Scanners Externes */}
        {mobileScannerSheetOpen && (
          <div
            onClick={() => setMobileScannerSheetOpen(false)}
            className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-xs flex items-end md:hidden animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-white rounded-t-[2rem] shadow-2xl px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-3.5 animate-in slide-in-from-bottom duration-200"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto" />

              <div className="flex items-center justify-between pt-1">
                <div>
                  <h3 className="text-base font-black text-slate-900">Modes de scan externes</h3>
                  <p className="text-xs font-semibold text-slate-500">
                    Scanners USB, pleine page ou douchette MRZ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileScannerSheetOpen(false)}
                  aria-label="Fermer"
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={isTwainScanning}
                  onClick={() => {
                    setMobileScannerSheetOpen(false)
                    triggerTwainScan()
                  }}
                  className="w-full min-h-[60px] p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5 text-left active:scale-[0.98] transition disabled:opacity-50 cursor-pointer"
                >
                  <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Printer size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900">Numériser (Scanner à plat)</p>
                    <p className="text-xs font-medium text-slate-500">Scanner USB / TWAIN</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileScannerSheetOpen(false)
                    toggleFullPageScanner()
                  }}
                  className="w-full min-h-[60px] p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5 text-left active:scale-[0.98] transition cursor-pointer"
                >
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                      isFullPageListening
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    }`}
                  >
                    <Radio size={20} className={isFullPageListening ? 'animate-pulse' : ''} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900">
                      Pleine Page {isFullPageListening ? '(Actif)' : ''}
                    </p>
                    <p className="text-xs font-medium text-slate-500">Lecteur vitre USB</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileScannerSheetOpen(false)
                    setShowPhysicalScannerInput(true)
                  }}
                  className="w-full min-h-[60px] p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5 text-left active:scale-[0.98] transition cursor-pointer"
                >
                  <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <Keyboard size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900">Douchette MRZ</p>
                    <p className="text-xs font-medium text-slate-500">
                      Lecteur code passeport USB
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 shrink-0" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setMobileScannerSheetOpen(false)}
                className="w-full h-12 rounded-2xl bg-slate-100 text-slate-700 font-black text-sm cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 💻 VERSION PC / TABLETTE (`hidden md:block`)                        */}
      {/* =================================================================== */}
      <div className="hidden md:block w-full max-w-6xl">
        <div className="bg-white md:rounded-[2.5rem] shadow-xl border border-gray-100 p-5 md:p-10 min-h-screen md:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 uppercase tracking-tight">
                Nouveau Dossier Pèlerin
              </h2>
              <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1">
                Lecture rapide du passeport • Photo d&apos;identité automatique
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {nusukChecklist.map((item) => (
                <div
                  key={item.label}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 ${
                    item.ok
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-gray-50 text-gray-400 border border-gray-100'
                  }`}
                >
                  <CheckCircle2
                    size={13}
                    className={item.ok ? 'text-emerald-600' : 'text-gray-300'}
                  />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* BLOC GAUCHE */}
            <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">
              {/* OPTIONS DE SCAN */}
              <div className="p-5 bg-blue-50/70 rounded-3xl border-2 border-dashed border-blue-200 shadow-inner space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-blue-900 uppercase flex items-center gap-2">
                    <Smartphone size={14} /> 1. Mode de Scan Passeport
                  </label>
                  {(isScanning || isTwainScanning) && (
                    <Loader2 className="animate-spin text-blue-600" size={18} />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl border border-blue-100 cursor-pointer hover:border-blue-300 active:scale-95 transition shadow-xs text-center">
                    <ScanLine className="text-blue-600 mb-1" size={18} />
                    <span className="text-[9px] font-black text-blue-900 uppercase leading-tight">
                      {isScanning ? 'Lecture rapide…' : 'Importer & Lire'}
                    </span>
                    <span className="text-[7.5px] text-slate-500">Photo / Scan fichier</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleGalleryScanInput}
                      disabled={isScanning}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setCameraModalOpen(true)}
                    disabled={isScanning}
                    className="flex flex-col items-center justify-center p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl border border-slate-900 cursor-pointer active:scale-95 transition shadow-xs text-center disabled:opacity-50"
                  >
                    <Camera className="text-emerald-400 mb-1" size={18} />
                    <span className="text-[9px] font-black uppercase leading-tight">
                      Caméra Guidée
                    </span>
                    <span className="text-[7.5px] opacity-80">Cadre + Netteté live</span>
                  </button>

                  <button
                    type="button"
                    onClick={triggerTwainScan}
                    disabled={isTwainScanning}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl border bg-blue-600 hover:bg-blue-700 text-white border-blue-600 transition cursor-pointer active:scale-95 text-center shadow-xs disabled:opacity-50"
                  >
                    {isTwainScanning ? (
                      <Loader2 size={18} className="animate-spin mb-1" />
                    ) : (
                      <Printer size={18} className="mb-1" />
                    )}
                    <span className="text-[9px] font-black uppercase leading-tight">
                      Numériser
                    </span>
                    <span className="text-[7.5px] opacity-80">Scanner à plat / USB</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleFullPageScanner}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition cursor-pointer active:scale-95 ${
                      isFullPageListening
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-800 border-blue-100 hover:border-emerald-500 shadow-xs'
                    }`}
                  >
                    <Radio
                      size={18}
                      className={
                        isFullPageListening
                          ? 'text-white mb-1 animate-pulse'
                          : 'text-emerald-600 mb-1'
                      }
                    />
                    <span className="text-[9px] font-black uppercase leading-tight">
                      Pleine Page
                    </span>
                    <span className="text-[7.5px] opacity-75">
                      {isFullPageListening ? 'Actif' : 'Vitre USB'}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPhysicalScannerInput((prev) => !prev)
                      setTimeout(() => physicalInputRef.current?.focus(), 100)
                    }}
                    className={`py-2 px-3 rounded-xl border text-[10px] font-black uppercase flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      showPhysicalScannerInput
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-blue-100 hover:border-blue-300'
                    }`}
                  >
                    <Keyboard size={14} className="text-blue-600" />
                    <span>Douchette USB</span>
                  </button>

                  {passportSourceSrc && (
                    <button
                      type="button"
                      onClick={openManualMrzModal}
                      disabled={isScanning}
                      className="py-2 px-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[10px] font-black uppercase flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <ScanLine size={14} className="text-amber-600" />
                      <span>Relire le code</span>
                    </button>
                  )}
                </div>

                {showPhysicalScannerInput && (
                  <div className="p-3 bg-white rounded-2xl border-2 border-emerald-400 shadow-sm animate-in fade-in space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-black text-emerald-800 uppercase">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block mr-1" />
                        Prêt pour la douchette
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPhysicalScannerInput(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <input
                      ref={physicalInputRef}
                      type="text"
                      value={mrzBuffer}
                      onChange={handlePhysicalScanChange}
                      onKeyDown={handlePhysicalScanKeyDown}
                      placeholder="Glissez le passeport dans la douchette…"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              {renderMrzVerificationBanner()}

              {/* SECTION PHOTO D'IDENTITÉ NUSUK */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-700 uppercase flex items-center gap-1.5">
                    <Camera size={14} className="text-blue-600" /> Photo d&apos;identité Nusuk
                    (480×680)
                  </span>
                  {photoPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoFile(null)
                        setPhotoPreview(null)
                        setPhotoQuality(null)
                        setOriginalPhotoBackup(null)
                        setWhiteBgApplied(false)
                      }}
                      className="text-[9px] font-bold text-red-500 hover:text-red-700 uppercase cursor-pointer"
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-20 h-28 rounded-2xl border-2 border-dashed border-gray-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-inner relative">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt="Aperçu Nusuk"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon size={24} className="text-gray-300" />
                    )}
                    {photoPreview && (
                      <div
                        className={`absolute bottom-0 inset-x-0 text-[8px] font-black text-white text-center py-0.5 uppercase ${
                          photoQuality && !photoQuality.faceDetected
                            ? 'bg-amber-600'
                            : 'bg-emerald-600'
                        }`}
                      >
                        {photoQuality && !photoQuality.faceDetected ? 'À ajuster' : 'Nusuk OK'}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      {(photoSourceSrc || passportSourceSrc) && (
                        <button
                          type="button"
                          onClick={openPhotoCropper}
                          className="py-2 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 transition cursor-pointer"
                        >
                          <Crop size={12} />
                          <span>Ajuster</span>
                        </button>
                      )}

                      {photoPreview && (
                        <button
                          type="button"
                          disabled={isRemovingBg}
                          onClick={handleToggleWhiteBackground}
                          className={`py-2 px-2 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 transition cursor-pointer border ${
                            whiteBgApplied
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {isRemovingBg ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : whiteBgApplied ? (
                            <Undo2 size={12} />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          <span>{whiteBgApplied ? 'Origine' : 'Fond blanc'}</span>
                        </button>
                      )}
                    </div>

                    <label className="block w-full py-2 px-2.5 bg-white border border-gray-200 hover:border-blue-300 rounded-xl text-center text-[10px] font-bold text-gray-700 cursor-pointer transition shadow-2xs">
                      {photoFile ? 'Remplacer la photo' : 'Choisir une photo'}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handlePhotoFileChange}
                      />
                    </label>
                  </div>
                </div>

                <p className="text-[9px] text-gray-500 font-semibold leading-tight">
                  {photoFile
                    ? `480×680 px • ${(photoFile.size / 1024).toFixed(0)} Ko / 100 Ko • Prête`
                    : 'Format officiel : 480×680 pixels (< 100 Ko) • Cadrage automatique.'}
                </p>
              </div>

              {/* SECTION PIÈCE JOINTE PASSEPORT */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-700 uppercase flex items-center gap-1.5">
                    <FileCheck size={14} className="text-blue-600" /> Copie du Passeport (Nusuk &lt;
                    400 Ko)
                  </span>
                  {fileToUpload && (
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                      {(fileToUpload.size / 1024).toFixed(0)} Ko (Prêt)
                    </span>
                  )}
                </div>

                <label className="flex items-center px-4 py-3 bg-white rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 transition cursor-pointer shadow-xs">
                  <Upload size={16} className="text-blue-600 mr-2.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-700 truncate">
                      {fileToUpload ? fileToUpload.name : 'Joindre la copie du passeport'}
                    </p>
                    <p className="text-[9px] text-gray-400">
                      Couleurs préservées & poids garanti &lt; 400 Ko
                    </p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={handlePassportFileChange}
                  />
                </label>

                {passportSourceSrc && (
                  <button
                    type="button"
                    onClick={openPassportCropper}
                    className="w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-center text-[10px] font-black uppercase flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Crop size={13} className="text-blue-600" />
                    <span>Recadrer le passeport manuellement</span>
                  </button>
                )}
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between px-4">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">
                  2. Formulaire Pèlerin
                </p>
                <button
                  type="button"
                  onClick={() => resetForm(false)}
                  className="text-[9px] font-black text-red-500 hover:text-red-700 flex items-center gap-1 uppercase bg-white px-3 py-1.5 rounded-xl border border-gray-200/60 shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <RotateCcw size={10} /> Vider le formulaire
                </button>
              </div>
            </div>

            {/* BLOC DROIT : FORMULAIRE PC */}
            <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-5">
              {message.text && (
                <div
                  className={`p-4 rounded-2xl font-bold text-xs tracking-wide shadow-xs border ${
                    message.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : message.type === 'info'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {message.text}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between ml-4 mr-2 mb-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase">
                      Nom de famille *
                    </label>
                    {renderFieldVerifyBadge('nom')}
                  </div>
                  <input
                    type="text"
                    value={nom}
                    onChange={(e) => {
                      setNom(e.target.value)
                      markFieldEdited('nom')
                    }}
                    className={`w-full px-5 py-4 rounded-2xl border-2 text-gray-900 text-base font-bold outline-none transition-all uppercase ${
                      isFieldFlagged('nom')
                        ? 'border-amber-400 bg-amber-50/40'
                        : 'border-gray-100 bg-gray-50 focus:border-blue-600 focus:bg-white'
                    }`}
                    placeholder="NOM DE FAMILLE"
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between ml-4 mr-2 mb-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase">
                      Prénom(s) *
                    </label>
                    {renderFieldVerifyBadge('prenom')}
                  </div>
                  <input
                    type="text"
                    value={prenom}
                    onChange={(e) => {
                      setPrenom(e.target.value)
                      markFieldEdited('prenom')
                    }}
                    className={`w-full px-5 py-4 rounded-2xl border-2 text-gray-900 text-base font-bold outline-none transition-all uppercase ${
                      isFieldFlagged('prenom')
                        ? 'border-amber-400 bg-amber-50/40'
                        : 'border-gray-100 bg-gray-50 focus:border-blue-600 focus:bg-white'
                    }`}
                    placeholder="TOUS LES PRÉNOMS"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black text-blue-600 uppercase ml-4 mb-1 flex items-center gap-1">
                    <CalendarDays size={12} /> Inscription
                  </label>
                  <input
                    type="date"
                    value={dateInscription}
                    onChange={(e) => setDateInscription(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border-2 border-blue-50 bg-blue-50/30 text-gray-900 font-bold text-sm focus:border-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">
                    Campagne
                  </label>
                  <select
                    value={campagne ?? ''}
                    onChange={(e) =>
                      setCampagne(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full px-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold text-sm focus:border-blue-600 outline-none"
                  >
                    <option value="">SÉLECTIONNER</option>
                    {campaignOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between ml-4 mr-2 mb-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-1">
                      <UserRound size={12} /> Sexe
                    </label>
                    {renderFieldVerifyBadge('sexe')}
                  </div>
                  <select
                    value={sexe}
                    onChange={(e) => {
                      setSexe(e.target.value)
                      markFieldEdited('sexe')
                    }}
                    className={`w-full px-4 py-4 rounded-2xl border-2 text-gray-900 font-bold text-sm outline-none transition-all cursor-pointer ${
                      isFieldFlagged('sexe')
                        ? 'border-amber-400 bg-amber-50/40'
                        : 'border-gray-100 bg-gray-50 focus:border-blue-600'
                    }`}
                  >
                    <option value="">SÉLECTIONNER</option>
                    <option value="HOMME">HOMME</option>
                    <option value="FEMME">FEMME</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">
                    Référence / Groupe
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none uppercase"
                    placeholder="GRP-A"
                  />
                  {smartSuggestions.references.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 ml-1">
                      {smartSuggestions.references.map((refName) => (
                        <button
                          key={refName}
                          type="button"
                          onClick={() => setReference(refName)}
                          className="px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-700 text-[10px] font-bold cursor-pointer"
                        >
                          {refName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between ml-4 mr-2 mb-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase">
                      N° Passeport
                    </label>
                    {renderFieldVerifyBadge('passeport')}
                  </div>
                  <input
                    type="text"
                    value={passeport}
                    onChange={(e) => {
                      setPasseport(e.target.value)
                      markFieldEdited('passeport')
                    }}
                    className={`w-full px-5 py-4 rounded-2xl border-2 font-mono text-gray-900 font-bold outline-none uppercase ${
                      duplicatePassportMatch?.isSameCampagne
                        ? 'border-rose-400 bg-rose-50/40'
                        : isFieldFlagged('passeport')
                        ? 'border-amber-400 bg-amber-50/40'
                        : 'border-gray-100 bg-gray-50 focus:border-blue-600 focus:bg-white'
                    }`}
                    placeholder="A000000"
                  />
                </div>
              </div>

              {renderDuplicateWarning()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">
                    Intermédiaire / Agence
                  </label>
                  <input
                    type="text"
                    value={associe}
                    onChange={(e) => setAssocie(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none uppercase"
                    placeholder="NOM DE L'ASSOCIÉ"
                  />
                  {smartSuggestions.associes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 ml-1">
                      {smartSuggestions.associes.map((aName) => (
                        <button
                          key={aName}
                          type="button"
                          onClick={() => setAssocie(aName)}
                          className="px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-700 text-[10px] font-bold cursor-pointer"
                        >
                          {aName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none"
                    placeholder="70 00 00 00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between ml-4 mr-2 mb-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase">
                      Date de naissance
                    </label>
                    <div className="flex items-center gap-1.5">
                      {pilgrimAgeInfo && !pilgrimAgeInfo.invalid && (
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                            pilgrimAgeInfo.age < 18
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {pilgrimAgeInfo.age} ans
                        </span>
                      )}
                      {renderFieldVerifyBadge('dateNaissance')}
                    </div>
                  </div>
                  <input
                    type="date"
                    value={dateNaissance}
                    onChange={(e) => {
                      setDateNaissance(e.target.value)
                      markFieldEdited('dateNaissance')
                    }}
                    className={`w-full px-4 py-4 rounded-2xl border-2 text-gray-900 font-bold text-sm outline-none ${
                      isFieldFlagged('dateNaissance') || pilgrimAgeInfo?.invalid
                        ? 'border-amber-400 bg-amber-50/40'
                        : 'border-gray-100 bg-gray-50 focus:border-blue-600 focus:bg-white'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between ml-4 mr-2 mb-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase">
                      Exp. Passeport
                    </label>
                    <div className="flex items-center gap-1.5">
                      {passportValidityInfo.status === 'valid' && (
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          Valide (+{passportValidityInfo.monthsLeft} mois)
                        </span>
                      )}
                      {renderFieldVerifyBadge('dateExpiration')}
                    </div>
                  </div>
                  <input
                    type="date"
                    value={dateExpiration}
                    onChange={(e) => {
                      setDateExpiration(e.target.value)
                      markFieldEdited('dateExpiration')
                    }}
                    className={`w-full px-4 py-4 rounded-2xl border-2 text-gray-900 font-bold text-sm outline-none ${
                      passportValidityInfo.status === 'expired'
                        ? 'border-rose-500 bg-rose-50 text-rose-900'
                        : passportValidityInfo.status === 'soon' ||
                          isFieldFlagged('dateExpiration')
                        ? 'border-amber-500 bg-amber-50/40'
                        : 'border-gray-100 bg-gray-50 focus:border-blue-600 focus:bg-white'
                    }`}
                  />
                  {passportValidityInfo.status === 'expired' && (
                    <p className="text-[10px] font-black text-rose-600 mt-1 ml-2 uppercase">
                      ⛔ Passeport expiré — renouvellement requis
                    </p>
                  )}
                  {passportValidityInfo.status === 'soon' && (
                    <p className="text-[10px] font-black text-amber-600 mt-1 ml-2 uppercase">
                      ⚠️ Expire dans moins de 6 mois ({passportValidityInfo.monthsLeft} mois)
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {smartSuggestions.packages.length > 0 && (
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1.5 block">
                      Forfaits rapides (pré-remplit le tarif)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {smartSuggestions.packages.map((pkg) => (
                        <button
                          key={pkg.name}
                          type="button"
                          onClick={() => applyPackageSuggestion(pkg)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer ${
                            nomPackage.toUpperCase() === pkg.name
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-blue-50/60 hover:bg-blue-100 text-blue-900 border-blue-200'
                          }`}
                        >
                          {pkg.name}
                          {pkg.price > 0
                            ? ` • ${formatHajjMoney(pkg.price, pkg.devise)}`
                            : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1.5 block">
                    Devise de paiement
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {HAJJ_CURRENCIES.map((cur) => {
                      const active = devise === cur.code
                      return (
                        <button
                          key={cur.code}
                          type="button"
                          onClick={() => setDevise(cur.code)}
                          className={`py-3 px-3 rounded-2xl border-2 font-black text-xs uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
                            active
                              ? cur.pillActiveClass
                              : 'bg-gray-50 border-gray-100 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {cur.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-900 p-4 rounded-2xl shadow-inner">
                    <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block">
                      Prix Total ({getHajjCurrencySymbol(devise)}) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9\s]*"
                      value={totalInput}
                      onChange={(e) => {
                        setTotalInput(formatAmount(e.target.value))
                        setTotal(parseAmount(e.target.value))
                      }}
                      placeholder="0"
                      className="w-full bg-transparent text-white font-black text-lg tabular-nums outline-none"
                      required
                    />
                  </div>
                  <div
                    className={`p-4 rounded-2xl shadow-inner ${
                      isOverpaid ? 'bg-rose-600' : 'bg-green-600'
                    }`}
                  >
                    <label className="text-[9px] font-black text-white/80 uppercase mb-1 block">
                      Acompte ({getHajjCurrencySymbol(devise)})
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9\s]*"
                      value={payeInput}
                      onChange={(e) => {
                        setPayeInput(formatAmount(e.target.value))
                        setPaye(parseAmount(e.target.value))
                      }}
                      placeholder="0"
                      className="w-full bg-transparent text-white font-black text-lg tabular-nums outline-none"
                    />
                  </div>
                </div>

                {isOverpaid && (
                  <p className="text-xs font-black text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">
                    ⚠️ L&apos;acompte dépasse le prix total du forfait !
                  </p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">
                  Nom du Package (Optionnel)
                </label>
                <input
                  type="text"
                  value={nomPackage}
                  onChange={(e) => setNomPackage(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-base font-bold focus:border-blue-600 focus:bg-white outline-none transition-all uppercase"
                  placeholder="Ex: PREMIUM, ÉCONOMIQUE, ETC."
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 flex items-center gap-1.5">
                  <FileText size={12} className="text-blue-600" /> Notes & Commentaires (Optionnel)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observations médicales, demandes particulières, régime alimentaire, statut spécial…"
                  className="w-full px-5 py-3.5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-semibold text-sm focus:border-blue-600 focus:bg-white outline-none transition-all resize-none"
                />
              </div>

              <div className="flex justify-between items-center px-5 py-4 bg-gray-100 rounded-2xl border border-gray-200/50 shadow-sm">
                <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                  Reste à payer :
                </span>
                <span className="font-black text-lg text-gray-900 tabular-nums">
                  {formatHajjMoney(Math.max(0, total - paye), devise)}
                </span>
              </div>

              <button
                type="submit"
                disabled={loading || !agenceId || !profileReady || isOverpaid}
                className={`w-full py-5 rounded-2xl text-white font-black text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 cursor-pointer ${
                  loading || !agenceId || !profileReady || isOverpaid
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                }`}
              >
                {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                {loading
                  ? 'ENREGISTREMENT EN COURS…'
                  : !profileReady
                  ? 'CHARGEMENT…'
                  : 'ENREGISTRER LE DOSSIER'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── FEUILLE / MODALE DE CONFIRMATION POST-ENREGISTREMENT (ZÉRO RESET BRUTAL) ── */}
      {savedSummary && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-5 animate-in fade-in duration-150">
          <div className="w-full md:max-w-md bg-white rounded-t-[2rem] md:rounded-3xl shadow-2xl p-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] space-y-5 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Check size={24} strokeWidth={3} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-emerald-700">
                  Inscription confirmée
                </p>
                <h3 className="text-base font-black text-slate-900 truncate">
                  {savedSummary.nomComplet}
                </h3>
                <p className="text-xs font-semibold text-slate-500">
                  {savedSummary.numPasseport
                    ? `Passeport ${savedSummary.numPasseport} • `
                    : ''}
                  Reste : {formatHajjMoney(savedSummary.reste, savedSummary.devise)}
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => resetForm(true)}
                className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <UserPlus size={17} />
                <span>Inscrire un proche / même forfait</span>
              </button>

              <button
                type="button"
                onClick={() => resetForm(false)}
                className="w-full h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw size={16} />
                <span>Nouveau dossier vierge</span>
              </button>

              <Link
                href={`/hajj/pelerin?id=${savedSummary.id}`}
                className="w-full h-11 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <span>Ouvrir la fiche du pèlerin</span>
                <ExternalLink size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── CAMÉRA GUIDÉE EN DIRECT ── */}
      <PassportCameraModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCaptureDataUrl={(dataUrl) => {
          setCameraModalOpen(false)
          executeFullPassportScan(dataUrl)
        }}
        onPickGalleryFile={(file) => {
          setCameraModalOpen(false)
          executeFullPassportScan(file)
        }}
      />

      {/* ── MODALE 1 : RECADRAGE PHOTO D'IDENTITÉ NUSUK (480×680) ── */}
      <NusukPhotoCropModal
        open={cropModalOpen}
        imageSrc={photoSourceSrc || passportSourceSrc}
        cropBox={cropBox}
        imgDims={cropImgDims}
        onChangeCropBox={setCropBox}
        onRotate90={handleRotatePhotoSource}
        onCancel={() => setCropModalOpen(false)}
        onConfirm={handleConfirmCropNusuk}
      />

      {/* ── MODALE 2 : RECADRAGE PAGE COMPLÈTE DU PASSEPORT ── */}
      <FreeRectCropModal
        open={passportCropModalOpen}
        mode="passport"
        imageSrc={passportSourceSrc}
        rectBox={passportCropBox}
        imgDims={passportImgDims}
        onChangeRectBox={setPassportCropBox}
        onRotate90={handleRotatePassportSource}
        onCancel={() => setPassportCropModalOpen(false)}
        onConfirm={handleConfirmPassportCrop}
      />

      {/* ── MODALE 3 : CIBLAGE MANUEL DE LA BANDE MRZ (À LA DEMANDE) ── */}
      <FreeRectCropModal
        open={mrzModalOpen}
        mode="mrz"
        imageSrc={passportSourceSrc}
        rectBox={mrzCropBox}
        imgDims={mrzImgDims}
        onChangeRectBox={setMrzCropBox}
        onRotate90={handleRotatePassportSource}
        onCancel={() => setMrzModalOpen(false)}
        onConfirm={handleConfirmManualMrzRescan}
      />
    </div>
  )
}
