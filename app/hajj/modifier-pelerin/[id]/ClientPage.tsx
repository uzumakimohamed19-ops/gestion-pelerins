'use client'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  Save, ArrowLeft, Loader2, Upload, FileCheck, AlertCircle, 
  User, CreditCard, Syringe, Hotel, Calendar, FileText, Camera, Image as ImageIcon,
  ScanLine, Crop, Check, X, Move
} from 'lucide-react'
import { uploadPassportFile, getPassportPublicUrl } from '@/lib/hajjPassport'
import Link from 'next/link'
import * as faceapi from '@vladmandic/face-api'

// Petit composant Switch réutilisable pour les champs booléens
const FormToggle = ({ 
  label, 
  checked, 
  onChange, 
  disabled = false 
}: { 
  label: string, 
  checked: boolean, 
  onChange: (val: boolean) => void, 
  disabled?: boolean 
}) => (
  <div 
    onClick={() => !disabled && onChange(!checked)}
    className={`flex items-center justify-between p-4 border rounded-2xl transition-all select-none ${
      disabled ? 'bg-amber-50 border-amber-200 cursor-not-allowed' : 'bg-gray-50 border-gray-100 cursor-pointer hover:bg-gray-100'
    }`}
  >
    <span className={`text-xs font-black uppercase tracking-wider ${disabled ? 'text-amber-700' : 'text-gray-600'}`}>{label}</span>
    <div className={`w-12 h-6 flex items-center rounded-full p-1 transition-all duration-300 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
    </div>
  </div>
)

const sanitizeAmount = (value: string) => value.replace(/\D/g, '')
const parseAmount = (value: string) => {
  const cleaned = sanitizeAmount(value)
  return cleaned === '' ? 0 : Number(cleaned)
}
const formatAmount = (value: string | number) => {
  const digits = typeof value === 'number' ? String(value) : sanitizeAmount(value)
  return digits === '' ? '' : Number(digits).toLocaleString('fr-FR')
}

// ─────────────────────────────────────────────────────────────
// 🎯 MOTEUR DE CAPTURE PHOTO D'IDENTITÉ NUSUK (200×200, < 100 Ko)
// ─────────────────────────────────────────────────────────────

// Gestion du modèle IA Face-API (chargement unique, même en appels simultanés)
let isFaceModelLoaded = false
let faceModelPromise: Promise<void> | null = null
async function loadFaceModel() {
  if (isFaceModelLoaded) return
  if (!faceModelPromise) {
    faceModelPromise = faceapi.nets.ssdMobilenetv1
      .loadFromUri('/models')
      .then(() => {
        isFaceModelLoaded = true
      })
      .catch((err) => {
        faceModelPromise = null
        throw err
      })
  }
  await faceModelPromise
}

// Télécharge un passeport déjà enregistré et le convertit en data URL (évite les blocages CORS du canvas)
async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Téléchargement du passeport impossible (${res.status}).`)
  const blob = await res.blob()
  if (blob.type.includes('pdf')) {
    throw new Error("Le passeport enregistré est un PDF : joignez une image pour extraire la photo.")
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Lecture du passeport impossible.'))
    reader.readAsDataURL(blob)
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.readAsDataURL(file)
  })
}

const NUSUK_PHOTO_MAX_BYTES = 95 * 1024

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Erreur blob'))),
      'image/jpeg',
      quality
    )
  })
}

// Réduction par paliers (÷2 à chaque étape) : bien plus net qu'une réduction directe
function resizeHighQuality(source: HTMLCanvasElement, dw: number, dh: number): HTMLCanvasElement {
  let cur = source
  while (cur.width / 2 >= dw && cur.height / 2 >= dh) {
    const next = document.createElement('canvas')
    next.width = Math.max(1, Math.floor(cur.width / 2))
    next.height = Math.max(1, Math.floor(cur.height / 2))
    const nctx = next.getContext('2d')
    if (!nctx) break
    nctx.imageSmoothingEnabled = true
    nctx.imageSmoothingQuality = 'high'
    nctx.drawImage(cur, 0, 0, next.width, next.height)
    cur = next
  }
  const out = document.createElement('canvas')
  out.width = Math.max(1, dw)
  out.height = Math.max(1, dh)
  const octx = out.getContext('2d')
  if (octx) {
    octx.imageSmoothingEnabled = true
    octx.imageSmoothingQuality = 'high'
    octx.drawImage(cur, 0, 0, out.width, out.height)
  }
  return out
}

// Netteté légère (masque flou 3x3) : détails du visage plus lisibles sans bruit
function sharpenCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const imgData = ctx.getImageData(0, 0, w, h)
  const s = imgData.data
  const out = new Uint8ClampedArray(s.length)
  out.set(s)
  const stride = w * 4
  const center = 1 + 4 * amount
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * stride + x * 4
      for (let c = 0; c < 3; c++) {
        const k = i + c
        out[k] = s[k] * center - amount * (s[k - 4] + s[k + 4] + s[k - stride] + s[k + stride])
      }
    }
  }
  imgData.data.set(out)
  ctx.putImageData(imgData, 0, 0)
}

async function renderNusukPhoto(
  img: HTMLImageElement,
  cropX: number,
  cropY: number,
  size: number,
  leftCut: number = -Infinity,
  rightCut: number = Infinity
): Promise<{ file: File; dataUrl: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 200
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Erreur canvas')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, 200, 200)

  const ratio = 200 / size
  const srcLeft = Math.max(cropX, 0, leftCut)
  const srcRight = Math.min(cropX + size, img.width, rightCut)
  const srcTop = Math.max(cropY, 0)
  const srcBottom = Math.min(cropY + size, img.height)

  if (srcRight > srcLeft && srcBottom > srcTop) {
    const srcW = Math.max(1, Math.round(srcRight - srcLeft))
    const srcH = Math.max(1, Math.round(srcBottom - srcTop))

    // Zone utile extraite à la résolution d'origine, puis réduite par paliers
    const region = document.createElement('canvas')
    region.width = srcW
    region.height = srcH
    const rctx = region.getContext('2d')
    if (!rctx) throw new Error('Erreur canvas')
    rctx.drawImage(img, Math.round(srcLeft), Math.round(srcTop), srcW, srcH, 0, 0, srcW, srcH)

    const dw = Math.max(1, Math.round(srcW * ratio))
    const dh = Math.max(1, Math.round(srcH * ratio))
    const dx = Math.round((srcLeft - cropX) * ratio)
    const dy = Math.round((srcTop - cropY) * ratio)

    const resized = resizeHighQuality(region, dw, dh)
    ctx.drawImage(resized, dx, dy)
  }

  sharpenCanvas(ctx, 200, 200, 0.45)

  // Qualité maximale tout en restant sous la limite Nusuk
  let quality = 0.95
  let blob = await canvasToJpegBlob(canvas, quality)
  while (blob.size > NUSUK_PHOTO_MAX_BYTES && quality > 0.6) {
    quality -= 0.05
    blob = await canvasToJpegBlob(canvas, quality)
  }

  const file = new File([blob], `photo_nusuk_${Date.now()}.jpg`, { type: 'image/jpeg' })
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return { file, dataUrl }
}

// 🎯 DÉTECTION ET DÉCOUPE FACIALE : visage centré (~70% du carré), aucun texte à droite, pas de vide à gauche
async function autoDetectAndCropNusuk(imageSrc: string): Promise<{ 
  file: File; 
  dataUrl: string; 
  cropBox: { x: number; y: number; size: number }; 
  dims: { width: number; height: number };
  detected: boolean;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = async () => {
      const dims = { width: img.width, height: img.height }
      let cropX = 0
      let cropY = 0
      let size = 200
      let faceFound = false

      // Limites dures : tout ce qui dépasse sera rendu en blanc (jamais de texte ni de bord de page)
      let leftCut = -Infinity
      let rightCut = Infinity

      try {
        await loadFaceModel()

        // Détection sur une version réduite (beaucoup plus rapide), coordonnées remises à l'échelle ensuite
        const maxSide = 1280
        const ds = Math.min(1, maxSide / Math.max(dims.width, dims.height))
        let detectInput: HTMLImageElement | HTMLCanvasElement = img
        if (ds < 1) {
          const dc = document.createElement('canvas')
          dc.width = Math.max(1, Math.round(dims.width * ds))
          dc.height = Math.max(1, Math.round(dims.height * ds))
          const dctx = dc.getContext('2d')
          if (dctx) {
            dctx.drawImage(img, 0, 0, dc.width, dc.height)
            detectInput = dc
          }
        }
        const inv = detectInput === img ? 1 : 1 / ds

        const detection = await faceapi.detectSingleFace(
          detectInput,
          new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 })
        )

        if (detection) {
          const faceX = detection.box.x * inv
          const faceY = detection.box.y * inv
          const faceW = detection.box.width * inv
          const faceH = detection.box.height * inv

          const faceCx = faceX + faceW / 2

          // 🛡️ Fenêtre horizontale symétrique autour du visage (rien au-delà : jamais de texte à droite)
          leftCut = faceX - faceW * 0.42
          rightCut = faceX + faceW * 1.42
          const windowW = rightCut - leftCut

          // 📐 Le visage occupe ~70% de la hauteur du carré (tête bien dégagée), et le carré tient toujours dans la fenêtre
          size = Math.round(Math.min(faceH / 0.70, windowW, dims.width, dims.height))

          // 🎯 Visage parfaitement centré horizontalement
          cropX = Math.round(faceCx - size / 2)
          cropX = Math.max(0, Math.min(dims.width - size, cropX))

          // 🎯 Centrage vertical (légèrement plus de marge en haut pour les cheveux)
          const leftover = size - faceH
          let targetY = faceY - leftover * 0.58
          if (targetY + size > dims.height) targetY = dims.height - size
          if (targetY < 0) targetY = 0
          cropY = Math.round(targetY)

          faceFound = true
        }
      } catch (err) {
        console.warn('Face-API : repli géométrique :', err)
      }

      // Repli si l'IA n'a pas détecté le visage
      if (!faceFound) {
        if (img.width > img.height) {
          size = Math.round(Math.min(img.height * 0.48, img.width * 0.25))
          cropX = Math.round(img.width * 0.05)
          cropY = Math.round(img.height * 0.16)
        } else {
          size = Math.round(Math.min(img.width * 0.60, img.height * 0.60))
          cropX = Math.round((img.width - size) / 2)
          cropY = Math.round(Math.max(0, img.height * 0.12))
        }
      }

      // Boîte renvoyée à l'éditeur manuel : toujours contenue dans l'image
      const safeX = Math.round(Math.max(0, Math.min(dims.width - size, cropX)))

      // 🎯 Rendu carré 200x200 px haute qualité : fond blanc, zone autorisée uniquement, netteté, < 100 Ko
      try {
        const rendered = await renderNusukPhoto(img, cropX, cropY, size, leftCut, rightCut)
        resolve({
          file: rendered.file,
          dataUrl: rendered.dataUrl,
          cropBox: { x: safeX, y: cropY, size },
          dims,
          detected: faceFound
        })
      } catch (renderErr) {
        reject(renderErr)
      }
    }

    img.onerror = () => reject(new Error("Erreur de chargement d'image"))
    img.src = imageSrc
  })
}

export default function ModifierPelerin() {
  const id = useSearchParams().get('id')
  const router = useRouter()
  
  // États de contrôle de l'application
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Fichiers
  const [file, setFile] = useState<File | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Capture photo d'identité (moteur Nusuk)
  const [capturing, setCapturing] = useState(false)
  const [captureInfo, setCaptureInfo] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null)
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; size: number }>({ x: 0, y: 0, size: 200 })
  const [cropImgDims, setCropImgDims] = useState<{ width: number; height: number }>({ width: 1, height: 1 })
  const cropContainerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const isResizingRef = useRef(false)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; boxX: number; boxY: number; boxSize: number }>({ mouseX: 0, mouseY: 0, boxX: 0, boxY: 0, boxSize: 0 })

  const [prixPackageInput, setPrixPackageInput] = useState('')
  const [totalPayeInput, setTotalPayeInput] = useState('')
  const [sessionLocked, setSessionLocked] = useState(false)

  // TOUS LES CHAMPS DE LA BASE DE DONNÉES ALIGNÉS (AVEC PHOTO ET NOTES)
  const [formData, setFormData] = useState({
    prenom: '',
    nom_complet: '',
    sexe: '',
    telephone_pelerin: '',
    date_naissance: '',
    num_passeport: '',
    date_expiration: '',
    reference: '',
    agence_id: '',
    agence_ou_personne_associee: '',
    nom_package: '',
    prix_package: 0,
    total_paye: 0,
    vacciné: false,
    visite_medicale: false,
    formation_suivie: false,
    date_formation: '',
    groupe_formation: '',
    hotel_mecque: '',
    hotel_medine: '',
    hotel_statut: false,
    groupe_encadrement: '',
    date_depart: '',
    date_retour: '',
    visa_obtenu: false,
    sur_plateforme_gouv: false,
    sur_plateforme_nusuk: false,
    date_inscription: '',
    campagne: new Date().getFullYear(),
    document_url: '',
    photo_url: '',
    notes: ''
  })

  const isGouvLocked = Boolean(formData.sur_plateforme_gouv)
  const isFieldLockedForGouv = (field: string) => isGouvLocked && !['nom_package', 'prix_package', 'total_paye', 'notes'].includes(field)

  // Un passeport est exploitable s'il vient d'être joint (image) ou s'il est déjà enregistré
  const canCaptureFromPassport = Boolean((file && file.type.startsWith('image/')) || (!file && formData.document_url))

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // 🚀 Préchargement du modèle IA en arrière-plan : la première capture n'attend plus
  useEffect(() => {
    loadFaceModel().catch(() => {})
  }, [])

  // Applique un résultat de cadrage automatique à l'aperçu et au fichier à enregistrer
  const applyAutoCrop = (result: Awaited<ReturnType<typeof autoDetectAndCropNusuk>>) => {
    setPhotoFile(result.file)
    setPhotoPreview(result.dataUrl)
    setCropBox(result.cropBox)
    setCropImgDims(result.dims)
  }

  // 🎯 Capture de la photo depuis un passeport déjà enregistré (ou fraîchement joint) sans tout reprendre
  const captureFromPassport = async () => {
    setCapturing(true)
    setCaptureInfo({ text: '⚡ Extraction du visage en cours...', type: 'info' })

    try {
      let dataUrl: string
      if (file && file.type.startsWith('image/')) {
        dataUrl = await readFileAsDataUrl(file)
      } else if (formData.document_url) {
        const passportUrl = getPassportPublicUrl(formData.document_url)
        if (!passportUrl) {
          throw new Error('Le passeport enregistré est introuvable ou inaccessible.')
        }
        dataUrl = await fetchImageAsDataUrl(passportUrl)
      } else {
        throw new Error('Aucun passeport disponible pour extraire la photo.')
      }

      setCropImageSrc(dataUrl)
      const result = await autoDetectAndCropNusuk(dataUrl)
      applyAutoCrop(result)

      if (result.detected) {
        setCaptureInfo({ text: '✅ Visage cadré avec précision au format officiel Nusuk !', type: 'success' })
      } else {
        setCaptureInfo({ text: '⚠️ Visage non détecté : ajustez le cadrage manuellement.', type: 'info' })
        setCropModalOpen(true)
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setCaptureInfo({ text: `❌ ${errMsg}`, type: 'error' })
    } finally {
      setCapturing(false)
    }
  }

  // Sélection d'une nouvelle photo d'identité : cadrage automatique Nusuk
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      setCropImageSrc(dataUrl)

      try {
        const result = await autoDetectAndCropNusuk(dataUrl)
        applyAutoCrop(result)
        setCaptureInfo({ text: "✅ Photo d'identité chargée et cadrée aux normes Nusuk (200×200px) !", type: 'success' })
      } catch {
        setPhotoFile(f)
        setPhotoPreview(dataUrl)
        setCaptureInfo(null)
        setCropModalOpen(true)
      }
    }
    reader.readAsDataURL(f)
  }

  // Validation du cadrage manuel
  const handleConfirmCropNusuk = () => {
    if (!cropImageSrc) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = async () => {
      try {
        const rendered = await renderNusukPhoto(img, cropBox.x, cropBox.y, cropBox.size)
        setPhotoFile(rendered.file)
        setPhotoPreview(rendered.dataUrl)
        setCropModalOpen(false)
        setCaptureInfo({ text: '✅ Photo du pèlerin ajustée aux normes Nusuk (200×200px) !', type: 'success' })
      } catch {
        setCaptureInfo({ text: '❌ Erreur lors du recadrage de la photo.', type: 'error' })
      }
    }
    img.src = cropImageSrc
  }

  const handlePointerDownBox = (e: React.PointerEvent) => {
    e.stopPropagation()
    isDraggingRef.current = true
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, boxX: cropBox.x, boxY: cropBox.y, boxSize: cropBox.size }
  }
  const handlePointerDownHandle = (e: React.PointerEvent) => {
    e.stopPropagation()
    isResizingRef.current = true
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, boxX: cropBox.x, boxY: cropBox.y, boxSize: cropBox.size }
  }
  const handlePointerMoveContainer = (e: React.PointerEvent) => {
    if (!cropContainerRef.current) return
    const rect = cropContainerRef.current.getBoundingClientRect()
    const scaleX = cropImgDims.width / rect.width

    if (isDraggingRef.current) {
      const deltaX = (e.clientX - dragStartRef.current.mouseX) * scaleX
      const deltaY = (e.clientY - dragStartRef.current.mouseY) * scaleX
      const nextX = Math.max(0, Math.min(cropImgDims.width - cropBox.size, dragStartRef.current.boxX + deltaX))
      const nextY = Math.max(0, Math.min(cropImgDims.height - cropBox.size, dragStartRef.current.boxY + deltaY))
      setCropBox(prev => ({ ...prev, x: nextX, y: nextY }))
    } else if (isResizingRef.current) {
      const delta = (e.clientX - dragStartRef.current.mouseX) * scaleX
      const nextSize = Math.max(80, Math.min(cropImgDims.width - cropBox.x, cropImgDims.height - cropBox.y, dragStartRef.current.boxSize + delta))
      setCropBox(prev => ({ ...prev, size: nextSize }))
    }
  }
  const handlePointerUpContainer = () => {
    isDraggingRef.current = false
    isResizingRef.current = false
  }

  // Ouvre l'éditeur manuel : charge d'abord les dimensions si le cadrage n'a pas encore été calculé
  const openCropEditor = () => {
    if (!cropImageSrc) return
    if (cropImgDims.width > 1) {
      setCropModalOpen(true)
      return
    }
    const img = new Image()
    img.onload = () => {
      const size = Math.round(Math.min(img.width, img.height) * 0.6)
      setCropImgDims({ width: img.width, height: img.height })
      setCropBox({
        x: Math.round((img.width - size) / 2),
        y: Math.round(Math.max(0, img.height * 0.12)),
        size
      })
      setCropModalOpen(true)
    }
    img.src = cropImageSrc
  }

  useEffect(() => {
    let active = true

    const loadSessionState = async () => {
      const [{ data: configData }, { data: sessionData }] = await Promise.all([
        supabase
          .from('hajj_campaign_config')
          .select('session_ouverte')
          .eq('id', 1)
          .maybeSingle(),
        supabase
          .from('hajj_sessions')
          .select('*')
          .eq('est_active', true)
          .order('date_ouverture', { ascending: false })
          .limit(1)
          .maybeSingle()
      ])

      if (!active) return

      const isSessionOpenInDb = Boolean(
        sessionData?.id && (
          sessionData?.est_active === true ||
          sessionData?.session_ouverte === true ||
          sessionData?.is_active === true
        )
      )

      setSessionLocked(!(isSessionOpenInDb || Boolean(configData?.session_ouverte)))
    }

    void loadSessionState()

    const channel = supabase
      .channel('session_lock_hajj_modifier')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hajj_campaign_config' }, () => {
        void loadSessionState()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hajj_sessions' }, () => {
        void loadSessionState()
      })
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    async function getPelerin() {
      try {
        const { data, error } = await supabase
          .from('pelerins')
          .select('*')
          .eq('id', id)
          .single()

        if (error) throw error

        if (data) {
          const formatDateTime = (dateStr: string | null) => {
            if (!dateStr) return ''
            return dateStr.slice(0, 16)
          }

          const prixPackage = Number(data.prix_package || 0)
          const totalPaye = Number(data.total_paye || 0)

          setFormData({
            prenom: data.prenom || '',
            nom_complet: data.nom_complet || '',
            sexe: data.sexe || '',
            telephone_pelerin: data.telephone_pelerin || '',
            date_naissance: data.date_naissance || '',
            num_passeport: data.num_passeport || '',
            date_expiration: data.date_expiration || '',
            reference: data.reference || '',
            agence_id: data.agence_id || '',
            agence_ou_personne_associee: data.agence_ou_personne_associee || '',
            nom_package: data.nom_package || '',
            prix_package: prixPackage,
            total_paye: totalPaye,
            vacciné: !!data.vacciné,
            visite_medicale: !!data.visite_medicale,
            formation_suivie: !!data.formation_suivie,
            date_formation: data.date_formation || '',
            groupe_formation: data.groupe_formation || '',
            hotel_mecque: data.hotel_mecque || '',
            hotel_medine: data.hotel_medine || '',
            hotel_statut: !!data.hotel_statut,
            groupe_encadrement: data.groupe_encadrement || '',
            date_depart: formatDateTime(data.date_depart),
            date_retour: formatDateTime(data.date_retour),
            visa_obtenu: !!data.visa_obtenu,
            sur_plateforme_gouv: !!data.sur_plateforme_gouv,
            sur_plateforme_nusuk: !!data.sur_plateforme_nusuk,
            date_inscription: data.date_inscription || '',
            campagne: data.campagne || new Date().getFullYear(),
            document_url: data.document_url || '',
            photo_url: data.photo_url || '',
            notes: data.notes || ''
          })

          setPrixPackageInput(formatAmount(prixPackage))
          setTotalPayeInput(formatAmount(totalPaye))

          if (data.photo_url) {
            setPhotoPreview(getPassportPublicUrl(data.photo_url))
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        setError("Impossible de charger le pèlerin : " + message)
      } finally {
        setLoading(false)
      }
    }
    getPelerin()
  }, [id])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sessionLocked && formData.sur_plateforme_gouv) {
      setError('La session GOUV est fermée, vous ne pouvez plus activer ce statut.')
      return
    }
    setUpdating(true)
    setError(null)
    
    try {
      let finalDocUrl = formData.document_url
      let finalPhotoUrl = formData.photo_url

      // 1. Upload scan passeport si nouveau fichier
      if (file) {
        const uploaded = await uploadPassportFile(file)
        finalDocUrl = uploaded.path
      }

      // 2. Upload photo d'identité si nouveau fichier
      if (photoFile) {
        const uploadedPhoto = await uploadPassportFile(photoFile)
        finalPhotoUrl = uploadedPhoto.path
      }

      const cleanValue = <T,>(val: T) => (val === '' ? null : val)

      let activeSessionId: string | null = null
      if (formData.sur_plateforme_gouv) {
        const { data: sessionData } = await supabase
          .from('hajj_sessions')
          .select('id')
          .order('date_ouverture', { ascending: false })
          .limit(1)
          .maybeSingle()
        activeSessionId = sessionData?.id ?? null
      }

      const updatePayload = isGouvLocked
        ? {
            nom_package: cleanValue(formData.nom_package),
            prix_package: formData.prix_package,
            total_paye: formData.total_paye,
            document_url: finalDocUrl,
            photo_url: finalPhotoUrl || null,
            notes: cleanValue(formData.notes),
            hajj_session_id: formData.sur_plateforme_gouv ? activeSessionId : null
          }
        : {
            agence_id: formData.agence_id,
            prenom: cleanValue(formData.prenom),
            nom_complet: formData.nom_complet,
            sexe: cleanValue(formData.sexe),
            telephone_pelerin: cleanValue(formData.telephone_pelerin),
            date_naissance: cleanValue(formData.date_naissance),
            num_passeport: formData.num_passeport,
            date_expiration: cleanValue(formData.date_expiration),
            reference: cleanValue(formData.reference),
            agence_ou_personne_associee: cleanValue(formData.agence_ou_personne_associee),
            nom_package: cleanValue(formData.nom_package),
            prix_package: formData.prix_package,
            total_paye: formData.total_paye,
            vacciné: formData.vacciné,
            visite_medicale: formData.visite_medicale,
            formation_suivie: formData.formation_suivie,
            date_formation: cleanValue(formData.date_formation),
            groupe_formation: cleanValue(formData.groupe_formation),
            hotel_mecque: cleanValue(formData.hotel_mecque),
            hotel_medine: cleanValue(formData.hotel_medine),
            hotel_statut: formData.hotel_statut,
            groupe_encadrement: cleanValue(formData.groupe_encadrement),
            date_depart: cleanValue(formData.date_depart),
            date_retour: cleanValue(formData.date_retour),
            visa_obtenu: formData.visa_obtenu,
            sur_plateforme_gouv: formData.sur_plateforme_gouv,
            sur_plateforme_nusuk: formData.sur_plateforme_nusuk,
            date_inscription: cleanValue(formData.date_inscription),
            campagne: formData.campagne || null,
            document_url: finalDocUrl,
            photo_url: finalPhotoUrl || null,
            notes: cleanValue(formData.notes),
            hajj_session_id: formData.sur_plateforme_gouv ? activeSessionId : null
          }

      const { error: updateError } = await supabase
        .from('pelerins')
        .update(updatePayload)
        .eq('id', id)

      if (updateError) throw updateError

      router.push(`/hajj/pelerin?id=${id}`)
      router.refresh()

    } catch (err: unknown) {
      console.error('Erreur lors de la mise à jour :', err)
      const message = err instanceof Error 
        ? err.message 
        : (typeof err === 'object' && err !== null && 'message' in err) 
          ? String((err as { message: string }).message) 
          : 'Erreur lors de la mise à jour'
      
      setError(message)
      setUpdating(false)
    }
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <Loader2 className="animate-spin text-blue-600" size={44} />
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
      <Link href={`/hajj/pelerin?id=${id}`} className="flex items-center gap-2 text-gray-500 hover:text-blue-600 font-bold mb-6 transition group text-sm w-fit">
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Retour au dossier
      </Link>

      <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-xl shadow-blue-900/5 border border-gray-100 p-5 md:p-10">
        <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-8 uppercase tracking-tighter border-b border-gray-100 pb-4">
          Modifier le Pèlerin
        </h2>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 font-bold text-sm">
            <AlertCircle size={20} className="shrink-0" /> {error}
          </div>
        )}

        {isGouvLocked && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            Ce pèlerin est déjà enregistré sur GOUV. Les informations personnelles et opérationnelles sont verrouillées. Seuls les montants financiers, les notes et les documents peuvent être mis à jour.
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-8">
          
          {/* SECTION 1: ÉTAT CIVIL & CONTACT */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
              <User size={16} /> 1. État Civil & Contact
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Prénom</label>
                <input 
                  type="text" value={formData.prenom} onChange={(e) => handleInputChange('prenom', e.target.value)}
                  disabled={isFieldLockedForGouv('prenom')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('prenom') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Nom Complet *</label>
                <input 
                  type="text" value={formData.nom_complet} onChange={(e) => handleInputChange('nom_complet', e.target.value)}
                  disabled={isFieldLockedForGouv('nom_complet')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('nom_complet') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                  required 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Genre / Sexe</label>
                <select 
                  value={formData.sexe} onChange={(e) => handleInputChange('sexe', e.target.value)}
                  disabled={isFieldLockedForGouv('sexe')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm appearance-none ${isFieldLockedForGouv('sexe') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                >
                  <option value="">Non spécifié</option>
                  <option value="HOMME">HOMME</option>
                  <option value="FEMME">FEMME</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Téléphone Pèlerin</label>
                <input 
                  type="tel" value={formData.telephone_pelerin} onChange={(e) => handleInputChange('telephone_pelerin', e.target.value)}
                  disabled={isFieldLockedForGouv('telephone_pelerin')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('telephone_pelerin') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date de Naissance</label>
                <input 
                  type="date" value={formData.date_naissance} onChange={(e) => handleInputChange('date_naissance', e.target.value)}
                  disabled={isFieldLockedForGouv('date_naissance')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_naissance') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date d'inscription administrative</label>
                <input 
                  type="date" value={formData.date_inscription} onChange={(e) => handleInputChange('date_inscription', e.target.value)}
                  disabled={isFieldLockedForGouv('date_inscription')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_inscription') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Campagne</label>
                <select
                  value={formData.campagne}
                  onChange={(e) => handleInputChange('campagne', Number(e.target.value))}
                  disabled={isFieldLockedForGouv('campagne')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm appearance-none ${isFieldLockedForGouv('campagne') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600'}`}
                >
                  {(() => {
                    const start = 2024
                    const end = new Date().getFullYear() + 5
                    const opts: number[] = []
                    for (let y = start; y <= end; y++) opts.push(y)
                    return opts.map(y => <option key={y} value={y}>{y}</option>)
                  })()}
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 2: PIÈCES D'IDENTITÉ, SCAN & PHOTO */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
              <CreditCard size={16} /> 2. Documents & Photo d'identité
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">N° Passeport *</label>
                <input 
                  type="text" value={formData.num_passeport} onChange={(e) => handleInputChange('num_passeport', e.target.value)}
                  disabled={isFieldLockedForGouv('num_passeport')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('num_passeport') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                  required 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date d'expiration Passeport</label>
                <input 
                  type="date" value={formData.date_expiration} onChange={(e) => handleInputChange('date_expiration', e.target.value)}
                  disabled={isFieldLockedForGouv('date_expiration')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_expiration') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Référence Interne</label>
                <input 
                  type="text" value={formData.reference} onChange={(e) => handleInputChange('reference', e.target.value)}
                  disabled={isFieldLockedForGouv('reference')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('reference') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>
            </div>

            {/* UPLOAD SCAN PASSEPORT & PHOTO D'IDENTITÉ CÔTE À CÔTE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Scan Passeport */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Scan du Passeport (Image ou PDF)</label>
                <label className="flex items-center justify-center gap-3 w-full px-5 py-5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-400 cursor-pointer transition-all">
                  {file ? (
                    <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
                      <FileCheck size={20} /> {file.name}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 font-bold italic text-sm">
                      <Upload size={20} /> {formData.document_url ? "Remplacer le scan existant" : "Sélectionner un fichier"}
                    </div>
                  )}
                  <input 
                    type="file" className="hidden" accept="image/*,.pdf" 
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              {/* Photo d'identité Nusuk (moteur de capture intégré) */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                  <span>Photo d'identité Nusuk (200×200)</span>
                  {photoPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoFile(null)
                        setPhotoPreview(null)
                        setCaptureInfo(null)
                        handleInputChange('photo_url', '')
                      }}
                      className="text-red-500 hover:text-red-700 text-[10px] font-bold cursor-pointer"
                    >
                      Supprimer la photo
                    </button>
                  )}
                </label>
                <div className="p-3 bg-gray-50 border-2 border-gray-100 rounded-xl space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shrink-0 relative">
                      {photoPreview ? (
                        <img src={photoPreview} alt="Aperçu identité" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon size={20} className="text-gray-300" />
                      )}
                      {photoPreview && photoFile && (
                        <div className="absolute bottom-0 inset-x-0 bg-emerald-600 text-[8px] font-black text-white text-center py-0.5 uppercase">
                          Nusuk OK
                        </div>
                      )}
                    </div>

                    <div className="flex-1 space-y-1.5">
                      {cropImageSrc && (
                        <button
                          type="button"
                          onClick={openCropEditor}
                          className="w-full py-2 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-center text-[10px] font-black uppercase flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Crop size={13} />
                          <span>Ajuster Photo ID</span>
                        </button>
                      )}

                      <label className="block w-full py-2.5 px-3 bg-white border border-gray-200 hover:border-blue-400 rounded-lg text-center text-xs font-bold text-blue-600 cursor-pointer transition">
                        <Camera size={14} className="inline mr-1.5" />
                        {photoPreview ? "Changer la photo" : "Ajouter une photo"}
                        <input type="file" className="hidden" accept="image/*" onChange={handlePhotoSelect} />
                      </label>
                    </div>
                  </div>

                  {canCaptureFromPassport && (
                    <button
                      type="button"
                      onClick={captureFromPassport}
                      disabled={capturing}
                      className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-center text-[10px] font-black uppercase flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {capturing ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
                      <span>{capturing ? "Extraction en cours..." : file ? "Capturer la photo depuis le nouveau passeport" : "Capturer la photo depuis le passeport enregistré"}</span>
                    </button>
                  )}

                  {captureInfo && (
                    <p className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${captureInfo.type === 'success' ? 'bg-green-100 text-green-700 border-green-200' : captureInfo.type === 'info' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                      {captureInfo.text}
                    </p>
                  )}

                  <p className="text-[9px] text-gray-400 font-medium leading-tight">
                    Format standard : 200×200 pixels JPEG &lt; 100 Ko • Visage isolé sans texte.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: COMPTABILITÉ & FORFAIT */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
              <CreditCard size={16} /> 3. Tarification & Agence
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="md:col-span-2 lg:col-span-2">
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Nom du Package / Offre</label>
                <input 
                  type="text" value={formData.nom_package} onChange={(e) => handleInputChange('nom_package', e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Prix Package (CFA)</label>
                <input 
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9\s]*"
                  value={prixPackageInput}
                  onChange={(e) => {
                    setPrixPackageInput(formatAmount(e.target.value))
                    handleInputChange('prix_package', parseAmount(e.target.value))
                  }}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Total Payé / Acomptes (CFA)</label>
                <input 
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9\s]*"
                  value={totalPayeInput}
                  onChange={(e) => {
                    setTotalPayeInput(formatAmount(e.target.value))
                    handleInputChange('total_paye', parseAmount(e.target.value))
                  }}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-emerald-600 font-bold focus:border-blue-600 focus:bg-white outline-none transition-all text-sm"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-4">
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Agence ou Personne associée</label>
                <input 
                  type="text" value={formData.agence_ou_personne_associee} onChange={(e) => handleInputChange('agence_ou_personne_associee', e.target.value)}
                  disabled={isFieldLockedForGouv('agence_ou_personne_associee')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('agence_ou_personne_associee') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: NOTES & REMARQUES PARTICULIÈRES */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <FileText size={16} className="text-blue-600" /> 4. Notes & Remarques (Optionnel)
            </h3>
            <div>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Régime alimentaire, état de santé particulier, demandes spéciales..."
                className="w-full p-4 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-semibold text-xs outline-none focus:border-blue-600 focus:bg-white transition resize-none"
              />
            </div>
          </div>

          {/* SECTION 5: SUIVI OPÉRATIONNEL & VOLS */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-purple-600 uppercase tracking-widest flex items-center gap-2">
              <Calendar size={16} /> 5. Logistique & Transports (Vols)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date & Heure Vol Aller</label>
                <input 
                  type="datetime-local" value={formData.date_depart} onChange={(e) => handleInputChange('date_depart', e.target.value)}
                  disabled={isFieldLockedForGouv('date_depart')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_depart') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date & Heure Vol Retour</label>
                <input 
                  type="datetime-local" value={formData.date_retour} onChange={(e) => handleInputChange('date_retour', e.target.value)}
                  disabled={isFieldLockedForGouv('date_retour')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_retour') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>
            </div>
          </div>

          {/* SECTION 6: HÉBERGEMENT KSA & FORMATION */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-orange-500 uppercase tracking-widest flex items-center gap-2">
              <Hotel size={16} /> 6. Formations & Hébergements KSA
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Hôtel La Mecque</label>
                <input 
                  type="text" value={formData.hotel_mecque} onChange={(e) => handleInputChange('hotel_mecque', e.target.value)}
                  disabled={isFieldLockedForGouv('hotel_mecque')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('hotel_mecque') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Hôtel Médine</label>
                <input 
                  type="text" value={formData.hotel_medine} onChange={(e) => handleInputChange('hotel_medine', e.target.value)}
                  disabled={isFieldLockedForGouv('hotel_medine')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('hotel_medine') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Guide / Encadreur Assigné</label>
                <input 
                  type="text" value={formData.groupe_encadrement} onChange={(e) => handleInputChange('groupe_encadrement', e.target.value)}
                  disabled={isFieldLockedForGouv('groupe_encadrement')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('groupe_encadrement') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Date de Formation</label>
                <input 
                  type="date" value={formData.date_formation} onChange={(e) => handleInputChange('date_formation', e.target.value)}
                  disabled={isFieldLockedForGouv('date_formation')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('date_formation') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-wider">Groupe de Formation</label>
                <input 
                  type="text" value={formData.groupe_formation} onChange={(e) => handleInputChange('groupe_formation', e.target.value)}
                  disabled={isFieldLockedForGouv('groupe_formation')}
                  className={`w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold outline-none transition-all text-sm ${isFieldLockedForGouv('groupe_formation') ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:border-blue-600 focus:bg-white'}`}
                />
              </div>
            </div>
          </div>

          {/* SECTION 7: JALONS & BOOLEANS */}
          <div className="space-y-4 pt-4 border-t border-gray-50">
            <h3 className="text-xs font-black text-teal-600 uppercase tracking-widest flex items-center gap-2">
              <Syringe size={16} /> 7. Jalons administratifs & Sanitaires
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormToggle 
                label="Carnet Vaccinal Validé" 
                checked={formData.vacciné} 
                onChange={(val) => handleInputChange('vacciné', val)} 
                disabled={isGouvLocked}
              />
              <FormToggle 
                label="Visite Médicale OK" 
                checked={formData.visite_medicale} 
                onChange={(val) => handleInputChange('visite_medicale', val)} 
                disabled={isGouvLocked}
              />
              <FormToggle 
                label="Formation Suivie" 
                checked={formData.formation_suivie} 
                onChange={(val) => handleInputChange('formation_suivie', val)} 
                disabled={isGouvLocked}
              />
              <FormToggle 
                label="Chambres Assignées (Hôtel)" 
                checked={formData.hotel_statut} 
                onChange={(val) => handleInputChange('hotel_statut', val)} 
                disabled={isGouvLocked}
              />
              <FormToggle 
                label="Visa Hajj Obtenu" 
                checked={formData.visa_obtenu} 
                onChange={(val) => handleInputChange('visa_obtenu', val)} 
                disabled={isGouvLocked}
              />
              <div className="space-y-2">
                <FormToggle 
                  label={sessionLocked ? 'GOUV (verrouillé)' : 'Enregistré Gouv.ml'} 
                  checked={formData.sur_plateforme_gouv} 
                  onChange={(val) => handleInputChange('sur_plateforme_gouv', val)} 
                  disabled={sessionLocked || isGouvLocked}
                />
                {sessionLocked && (
                  <p className="text-[11px] font-bold text-amber-700">La session GOUV est fermée, ce statut est verrouillé partout dans l’application Hajj.</p>
                )}
              </div>
              <FormToggle 
                label="Inscrit Nusuk (KSA)" 
                checked={formData.sur_plateforme_nusuk} 
                onChange={(val) => handleInputChange('sur_plateforme_nusuk', val)} 
                disabled={isGouvLocked}
              />
            </div>
          </div>

          {/* BOUTON DE SOUMISSION */}
          <button 
            type="submit" 
            disabled={updating}
            className="w-full flex items-center justify-center gap-3 bg-gray-900 text-white py-4.5 rounded-2xl font-black text-base shadow-xl hover:bg-blue-600 transition-all disabled:bg-gray-200 active:scale-[0.99] mt-8 cursor-pointer"
          >
            {updating ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            {updating ? "ENREGISTREMENT DES DONNÉES..." : "SAUVEGARDER LES MODIFICATIONS"}
          </button>
        </form>
      </div>

      {/* ── 🎯 MODAL : RECADRAGE VISAGE NUSUK (200x200 px) ── */}
      {cropModalOpen && cropImageSrc && (
        <div 
          className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
          onPointerMove={handlePointerMoveContainer}
          onPointerUp={handlePointerUpContainer}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[95vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crop size={18} className="text-emerald-400" />
                <h3 className="font-black text-sm uppercase">Cadrage Visage Nusuk (200×200 px)</h3>
              </div>
              <button 
                type="button"
                onClick={() => setCropModalOpen(false)} 
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer text-slate-300"
              >
                <X size={16} />
              </button>
            </div>

            <p className="px-4 py-2 bg-slate-100 text-[11px] text-slate-600 font-medium">
              Glissez le <strong>cadre vert</strong> sur le visage ou utilisez la <strong>poignée</strong> pour zoomer/recadrer.
            </p>

            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-950/90 select-none">
              <div ref={cropContainerRef} className="relative max-w-full max-h-[55vh] inline-block touch-none">
                <img src={cropImageSrc} alt="Passeport" className="max-h-[55vh] w-auto max-w-full object-contain pointer-events-none block" />
                {(() => {
                  const scalePctX = (cropBox.x / cropImgDims.width) * 100
                  const scalePctY = (cropBox.y / cropImgDims.height) * 100
                  const scalePctW = (cropBox.size / cropImgDims.width) * 100

                  return (
                    <div
                      onPointerDown={handlePointerDownBox}
                      style={{
                        left: `${scalePctX}%`,
                        top: `${scalePctY}%`,
                        width: `${scalePctW}%`,
                        paddingBottom: `${scalePctW}%`,
                      }}
                      className="absolute border-2 border-emerald-400 bg-emerald-400/20 shadow-lg cursor-move rounded-xl touch-none group ring-2 ring-emerald-500/50"
                    >
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                        <Move size={20} className="text-white" />
                      </div>
                      <div
                        onPointerDown={handlePointerDownHandle}
                        className="absolute -right-2 -bottom-2 w-6 h-6 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center cursor-nwse-resize shadow-md touch-none"
                      >
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setCropModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmCropNusuk}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition shadow-sm cursor-pointer"
              >
                <Check size={16} />
                <span>Valider la photo Nusuk</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}