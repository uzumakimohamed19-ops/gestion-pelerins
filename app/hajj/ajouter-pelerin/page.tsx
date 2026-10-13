'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@powersync/react'
import { supabase, getUser } from '@/lib/supabase'
import { 
  ScanLine, Loader2, Save, Upload, RotateCcw, Smartphone, 
  CalendarDays, UserRound, FileText, Camera, Image as ImageIcon, 
  Crop, Check, X, Move, Keyboard, Radio, FileCheck, Printer
} from 'lucide-react'
import { uploadPassportFile } from '@/lib/hajjPassport'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import * as faceapi from '@vladmandic/face-api'

function isRunningInTauri(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    window.location.protocol.startsWith('tauri') ||
    window.location.origin.includes('tauri.localhost')
  )
}

function getApiUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return 'https://gestion-pelerins.vercel.app'
  }

  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    const protocol = window.location.protocol

    const isTauriEnv =
      protocol.startsWith('tauri') ||
      origin.includes('tauri.localhost') ||
      '__TAURI_INTERNALS__' in window ||
      '__TAURI__' in window

    if (
      isTauriEnv ||
      protocol.startsWith('capacitor') ||
      (origin.includes('localhost') && !origin.includes('localhost:3000'))
    ) {
      return 'https://gestion-pelerins.vercel.app'
    }
  }

  return process.env.NEXT_PUBLIC_API_URL || ''
}

// 🎯 Gestion du modèle IA Face-API (chargement unique, même en appels simultanés)
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

function preparePassportImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve(reader.result as string)
          return
        }

        const targetWidth = Math.min(1800, Math.max(1400, img.width))
        const scale = targetWidth / img.width
        const targetHeight = Math.round(img.height * scale)

        canvas.width = targetWidth
        canvas.height = targetHeight

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

        const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight)
        const d = imgData.data
        const contrast = 35
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))

        // Table de correspondance : 256 calculs au lieu de millions
        const lut = new Uint8ClampedArray(256)
        for (let v = 0; v < 256; v++) {
          lut[v] = factor * (v - 128) + 128
        }

        for (let i = 0; i < d.length; i += 4) {
          d[i] = lut[d[i]]
          d[i + 1] = lut[d[i + 1]]
          d[i + 2] = lut[d[i + 2]]
        }
        ctx.putImageData(imgData, 0, 0)

        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => resolve(reader.result as string)
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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

// 🎯 Compression du passeport en gardant la dimension originale intacte (< 400 Ko pour Nusuk)
function compressAndFormatPassportNusuk(
  imageSrc: string, 
  cropRegion?: { x: number; y: number; width: number; height: number }
): Promise<{ file: File; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const sx = cropRegion ? cropRegion.x : 0
      const sy = cropRegion ? cropRegion.y : 0
      const sw = cropRegion ? cropRegion.width : img.width
      const sh = cropRegion ? cropRegion.height : img.height

      const targetW = Math.round(sw)
      const targetH = Math.round(sh)

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Erreur canvas'))

      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, targetW, targetH)
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH)

      let quality = 0.85
      const generateBlob = (q: number) => {
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Erreur blob'))
          if (blob.size > 390 * 1024 && q > 0.45) {
            generateBlob(q - 0.1)
            return
          }
          const file = new File([blob], `passport_nusuk_${Date.now()}.jpg`, { type: 'image/jpeg' })
          const dataUrl = canvas.toDataURL('image/jpeg', q)
          resolve({ file, dataUrl })
        }, 'image/jpeg', q)
      }

      generateBlob(quality)
    }
    img.onerror = reject
    img.src = imageSrc
  })
}

// 🎯 Découpage précis de la bande MRZ sélectionnée avant l'OCR
function extractMrzRegionBase64(
  imageSrc: string,
  region: { x: number; y: number; width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(10, Math.round(region.width))
      canvas.height = Math.max(10, Math.round(region.height))
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Erreur canvas'))

      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(
        img,
        region.x, region.y, region.width, region.height,
        0, 0, canvas.width, canvas.height
      )
      resolve(canvas.toDataURL('image/jpeg', 0.95))
    }
    img.onerror = reject
    img.src = imageSrc
  })
}

async function formatNusukSquare(imageSrc: string): Promise<{ file: File; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 200
      canvas.height = 200
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Erreur canvas'))

      const size = Math.min(img.width, img.height)
      const x = (img.width - size) / 2
      const y = (img.height - size) / 2

      ctx.drawImage(img, x, y, size, size, 0, 0, 200, 200)

      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Erreur blob'))
        const file = new File([blob], `photo_nusuk_${Date.now()}.jpg`, { type: 'image/jpeg' })
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
        resolve({ file, dataUrl })
      }, 'image/jpeg', 0.88)
    }
    img.onerror = reject
    img.src = imageSrc
  })
}

// 🎯 Rendu haute qualité de la photo Nusuk (200x200) : réduction progressive + netteté, JPEG < 100 Ko
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

// 🎯 DÉTECTION ET DÉCOUPE FACIALE : visage centré (~75% du carré), aucun texte à droite, pas de vide à gauche
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

function parseMrzRawLines(rawInput: string | string[]) {
  const fullText = Array.isArray(rawInput) ? rawInput.join('\n') : String(rawInput || '')
  if (!fullText || fullText.trim().length < 8) return null

  if (fullText.includes('LNM') || fullText.includes('PNM') || fullText.includes('FNM')) {
    const getTag = (tag: string) => {
      const match = fullText.match(new RegExp(`(?:^|,)${tag}([^,\r\n]+)`, 'i'))
      return match ? match[1].trim() : ''
    }

    const nom = getTag('LNM').replace(/</g, ' ').trim()
    const prenom = getTag('FNM').replace(/</g, ' ').trim()
    const numPasseport = getTag('PNM').replace(/</g, '').trim()

    const rawSex = getTag('SEX').toUpperCase()
    let sexe = ''
    if (rawSex.startsWith('F')) sexe = 'FEMME'
    else if (rawSex.startsWith('M')) sexe = 'HOMME'

    const cleanDate = (dStr: string) => {
      if (!dStr) return ''
      const dmyMatch = dStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/)
      if (dmyMatch) {
        const dd = dmyMatch[1].padStart(2, '0')
        const mm = dmyMatch[2].padStart(2, '0')
        let yy = parseInt(dmyMatch[3], 10)
        if (yy < 100) {
          const currentYearShort = new Date().getFullYear() % 100
          yy = yy > currentYearShort ? 1900 + yy : 2000 + yy
        }
        return `${yy}-${mm}-${dd}`
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr
      const digits = dStr.replace(/\D/g, '')
      if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
      if (digits.length === 6) {
        const yy = parseInt(digits.slice(0, 2), 10)
        const fullY = yy > (new Date().getFullYear() % 100) ? 1900 + yy : 2000 + yy
        return `${fullY}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
      }
      return ''
    }

    const dateNaissance = cleanDate(getTag('DOB'))
    const dateExpiration = cleanDate(getTag('EDT'))

    if (nom || numPasseport || prenom) {
      return { nom, prenom, numPasseport, sexe, dateNaissance, dateExpiration }
    }
  }

  const lines = fullText
    .split(/\r?\n/)
    .map(l => l.trim().toUpperCase().replace(/[^A-Z0-9<]/g, ''))
    .filter(l => l.length >= 25)

  let l1 = ''
  let l2 = ''

  if (lines.length >= 2) {
    l1 = lines[lines.length - 2]
    l2 = lines[lines.length - 1]
  } else {
    const cleanContinuous = fullText.toUpperCase().replace(/[^A-Z0-9<]/g, '')
    const pIdx = cleanContinuous.search(/P[A-Z0-9<]/)
    if (pIdx !== -1) {
      const mrzPart = cleanContinuous.slice(pIdx)
      if (mrzPart.length >= 70) {
        l1 = mrzPart.slice(0, 44)
        l2 = mrzPart.slice(44)
      }
    }
  }

  if (!l1 && fullText.includes('<<')) {
    const rawClean = fullText.replace(/[^A-Z0-9<]/gi, '')
    l1 = rawClean.slice(0, 44)
    l2 = rawClean.slice(44)
  }

  if (!l1 && !l2) return null

  let nom = ''
  let prenom = ''
  if (l1) {
    const nameSection = l1.length >= 5 ? l1.slice(5) : l1
    const parts = nameSection.split('<<').filter(Boolean)
    nom = (parts[0] || '').replace(/</g, ' ').trim()
    prenom = (parts[1] || '').replace(/</g, ' ').trim()
  }

  let numPasseport = ''
  let dateNaissance = ''
  let sexe = ''
  let dateExpiration = ''

  if (l2 && l2.length >= 9) {
    numPasseport = l2.slice(0, 9).replace(/</g, '').trim()
    const afterNum = l2.slice(9)
    const dobMatch = afterNum.match(/([0-9]{6})([0-9<])([MF<])([0-9]{6})/i)

    if (dobMatch) {
      const rawDob = dobMatch[1]
      const rawSexChar = dobMatch[3].toUpperCase()
      const rawExp = dobMatch[4]

      const yy = parseInt(rawDob.slice(0, 2), 10)
      const mm = rawDob.slice(2, 4)
      const dd = rawDob.slice(4, 6)
      const currentYearShort = new Date().getFullYear() % 100
      const fullYear = yy > currentYearShort ? 1900 + yy : 2000 + yy
      dateNaissance = `${fullYear}-${mm}-${dd}`

      sexe = rawSexChar === 'F' ? 'FEMME' : rawSexChar === 'M' ? 'HOMME' : ''

      const expYy = parseInt(rawExp.slice(0, 2), 10)
      const expMm = rawExp.slice(2, 4)
      const expDd = rawExp.slice(4, 6)
      dateExpiration = `${2000 + expYy}-${expMm}-${expDd}`
    } else {
      if (l2.length >= 19) {
        const rawDob = l2.slice(13, 19)
        if (/^\d{6}$/.test(rawDob)) {
          const yy = parseInt(rawDob.slice(0, 2), 10)
          const mm = rawDob.slice(2, 4)
          const dd = rawDob.slice(4, 6)
          const fullYear = yy > (new Date().getFullYear() % 100) ? 1900 + yy : 2000 + yy
          dateNaissance = `${fullYear}-${mm}-${dd}`
        }
      }
      if (l2.length >= 21) {
        const charSex = l2.charAt(20).toUpperCase()
        sexe = charSex === 'F' ? 'FEMME' : charSex === 'M' ? 'HOMME' : ''
      }
      if (l2.length >= 27) {
        const rawExp = l2.slice(21, 27)
        if (/^\d{6}$/.test(rawExp)) {
          const yy = parseInt(rawExp.slice(0, 2), 10)
          dateExpiration = `${2000 + yy}-${rawExp.slice(2, 4)}-${rawExp.slice(4, 6)}`
        }
      }
    }
  }

  if (nom || numPasseport || prenom) {
    return { nom, prenom, numPasseport, sexe, dateNaissance, dateExpiration }
  }

  return null
}

export default function AjouterPelerin() {
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [reference, setReference] = useState('')
  const [passeport, setPasseport] = useState('')
  const [phone, setPhone] = useState('')
  const [sexe, setSexe] = useState('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [dateExpiration, setDateExpiration] = useState('')
  const [dateInscription, setDateInscription] = useState(new Date().toISOString().split('T')[0])
  const [campagne, setCampagne] = useState<number | null>(new Date().getFullYear())
  const [associe, setAssocie] = useState('')
  const [total, setTotal] = useState(0)
  const [totalInput, setTotalInput] = useState('')
  const [paye, setPaye] = useState(0)
  const [payeInput, setPayeInput] = useState('')
  const [nomPackage, setNomPackage] = useState('')
  const [notes, setNotes] = useState('')

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [showPhysicalScannerInput, setShowPhysicalScannerInput] = useState(false)
  const [mrzBuffer, setMrzBuffer] = useState('')
  const physicalInputRef = useRef<HTMLInputElement>(null)
  const mrzTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [isTwainScanning, setIsTwainScanning] = useState(false)
  const [isFullPageConnected, setIsFullPageConnected] = useState(false)
  const [isFullPageListening, setIsFullPageListening] = useState(false)
  const fullPageWsRef = useRef<WebSocket | null>(null)

  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; size: number }>({ x: 0, y: 0, size: 200 })
  const [cropImgDims, setCropImgDims] = useState<{ width: number; height: number }>({ width: 1, height: 1 })
  const cropContainerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const isResizingRef = useRef(false)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; boxX: number; boxY: number; boxSize: number }>({ mouseX: 0, mouseY: 0, boxX: 0, boxY: 0, boxSize: 0 })

  const [passportCropModalOpen, setPassportCropModalOpen] = useState(false)
  const [passportCropBox, setPassportCropBox] = useState<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 400, height: 300 })
  const [passportImgDims, setPassportImgDims] = useState<{ width: number; height: number }>({ width: 1, height: 1 })
  const passportContainerRef = useRef<HTMLDivElement>(null)
  const isPassportDraggingRef = useRef(false)
  const isPassportResizingRef = useRef(false)
  const passportDragStartRef = useRef<{ mouseX: number; mouseY: number; boxX: number; boxY: number; boxW: number; boxH: number }>({ mouseX: 0, mouseY: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 })

  const [mrzPreviewModalOpen, setMrzPreviewModalOpen] = useState(false)
  const [mrzPreviewImageSrc, setMrzPreviewImageSrc] = useState<string | null>(null)
  const [mrzCropBox, setMrzCropBox] = useState<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 100, height: 50 })
  const [mrzImgDims, setMrzImgDims] = useState<{ width: number; height: number }>({ width: 1, height: 1 })
  const mrzContainerRef = useRef<HTMLDivElement>(null)
  const isMrzDraggingRef = useRef(false)
  const isMrzResizingRef = useRef(false)
  const mrzDragStartRef = useRef<{ mouseX: number; mouseY: number; boxX: number; boxY: number; boxW: number; boxH: number }>({ mouseX: 0, mouseY: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 })
  const pendingScanFileRef = useRef<File | null>(null)

  const [fileToUpload, setFileToUpload] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })

  const [agenceId, setAgenceId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [profileReady, setProfileReady] = useState(false)

  const { data: localProfiles } = useQuery<{ agence_id: string | null }>(
    'SELECT agence_id FROM profiles WHERE id = ?',
    [userId ?? ''],
  )

  useEffect(() => {
    async function fetchUserAgence() {
      try {
        const { data: { user } } = await getUser()
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
        setProfileReady(true)
      } finally {
        setProfileReady(true)
      }
    }
    fetchUserAgence()
  }, [])

  // 🚀 Préchargement du modèle IA en arrière-plan : le premier scan n'attend plus
  useEffect(() => {
    loadFaceModel().catch(() => {})
  }, [])

  useEffect(() => {
    const localAgenceId = localProfiles?.[0]?.agence_id
    if (localAgenceId) setAgenceId(localAgenceId)
  }, [localProfiles])

  const processScannedPassportImage = async (fullDataUrl: string) => {
    setCropImageSrc(fullDataUrl)

    const formatted = await compressAndFormatPassportNusuk(fullDataUrl)
    setFileToUpload(formatted.file)

    try {
      const autoCrop = await autoDetectAndCropNusuk(fullDataUrl)
      setPhotoFile(autoCrop.file)
      setPhotoPreview(autoCrop.dataUrl)
      setCropBox(autoCrop.cropBox)
      setCropImgDims(autoCrop.dims)
    } catch {}

    const targetEndpoint = `${getApiUrl()}/api/scan-mrz`
    try {
      const ocrRes = await fetch(targetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: fullDataUrl })
      })

      if (ocrRes.ok) {
        const ocrData = await ocrRes.json()
        if (ocrData.nom) setNom(ocrData.nom)
        if (ocrData.prenom) setPrenom(ocrData.prenom)
        if (ocrData.numPasseport) setPasseport(ocrData.numPasseport)
        if (ocrData.sexe) setSexe(ocrData.sexe)
        if (ocrData.dateNaissance) setDateNaissance(ocrData.dateNaissance)
        if (ocrData.dateExpiration) setDateExpiration(ocrData.dateExpiration)
      }
    } catch (e) {
      console.warn("Échec OCR en arrière-plan :", e)
    }
  }

  const triggerTwainScan = async () => {
    setIsTwainScanning(true)
    setMessage({ text: '⚡ Numérisation en cours sur le scanner USB...', type: 'info' })

    if (isRunningInTauri()) {
      try {
        // @ts-expect-error Tauri API globale
        const tauriInvoke = window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke
        if (typeof tauriInvoke === 'function') {
          const rawResult: string = await tauriInvoke('scan_passport')
          if (rawResult) {
            const dataUrl = rawResult.startsWith('data:') ? rawResult : `data:image/jpeg;base64,${rawResult}`
            await processScannedPassportImage(dataUrl)
            setMessage({ text: '✅ Document numérisé via Tauri, visage extrait et champs remplis !', type: 'success' })
            setIsTwainScanning(false)
            return
          }
        }
      } catch (tauriErr) {
        console.warn("Bascule vers la passerelle locale :", tauriErr)
      }
    }

    try {
      const res = await fetch('http://127.0.0.1:18622/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'jpg', quality: 90, resolution: 300 })
      }).catch(async () => {
        return await fetch('http://127.0.0.1:9090/scan', { method: 'POST' })
      })

      if (!res || !res.ok) {
        throw new Error("Impossible de communiquer avec le service de numérisation local.")
      }

      const data = await res.json()
      const rawImageBase64 = data.imageBase64 || data.image || data.data

      if (!rawImageBase64) {
        throw new Error("Aucune image renvoyée par le scanner.")
      }

      const fullDataUrl = rawImageBase64.startsWith('data:') 
        ? rawImageBase64 
        : `data:image/jpeg;base64,${rawImageBase64}`

      await processScannedPassportImage(fullDataUrl)
      setMessage({ text: '✅ Document numérisé, visage extrait et champs pré-remplis !', type: 'success' })
    } catch (err: unknown) {
      console.error(err)
      const errMsg = err instanceof Error ? err.message : String(err)
      setMessage({ text: `⚠️ ${errMsg}`, type: 'error' })
    } finally {
      setIsTwainScanning(false)
    }
  }

  const toggleFullPageScanner = async () => {
    if (isFullPageListening) {
      if (fullPageWsRef.current) fullPageWsRef.current.close()
      setIsFullPageListening(false)
      setIsFullPageConnected(false)
      setMessage({ text: 'Scanner pleine page arrêté.', type: 'info' })
      return
    }

    if (isRunningInTauri()) {
      try {
        // @ts-expect-error Tauri API globale
        const tauriInvoke = window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke
        if (typeof tauriInvoke === 'function') {
          setMessage({ text: '⚡ Détection via Tauri : posez le passeport...', type: 'info' })
          const res: any = await tauriInvoke('scan_full_page')
          if (res) {
            if (res.nom) setNom(res.nom)
            if (res.prenom) setPrenom(res.prenom)
            if (res.numPasseport) setPasseport(res.numPasseport)
            if (res.sexe) setSexe(res.sexe)
            if (res.dateNaissance) setDateNaissance(res.dateNaissance)
            if (res.dateExpiration) setDateExpiration(res.dateExpiration)

            if (res.photoBase64) {
              const rawDataUrl = res.photoBase64.startsWith('data:') 
                ? res.photoBase64 
                : `data:image/jpeg;base64,${res.photoBase64}`
              const nusuk = await formatNusukSquare(rawDataUrl)
              setPhotoFile(nusuk.file)
              setPhotoPreview(nusuk.dataUrl)
            }

            if (res.pageFullBase64) {
              const fullDataUrl = res.pageFullBase64.startsWith('data:') 
                ? res.pageFullBase64 
                : `data:image/jpeg;base64,${res.pageFullBase64}`
              const fullFile = base64ToFile(fullDataUrl, `scan_complet_${res.numPasseport || Date.now()}.jpg`)
              setFileToUpload(fullFile)
            }

            setMessage({ text: '✅ Passeport et photo capturés directement via Tauri !', type: 'success' })
            return
          }
        }
      } catch (e) {
        console.warn("Invoke plein page Tauri non disponible, passage en WebSocket standard :", e)
      }
    }

    const wsUrl = 'ws://127.0.0.1:9090'
    setMessage({ text: 'Connexion au scanner pleine page...', type: 'info' })

    try {
      const ws = new WebSocket(wsUrl)
      fullPageWsRef.current = ws

      ws.onopen = () => {
        setIsFullPageConnected(true)
        setIsFullPageListening(true)
        setMessage({ text: '🟢 SCANNER PLEINE PAGE PRÊT : Déposez le passeport sur la vitre.', type: 'success' })
      }

      ws.onmessage = async (event) => {
        try {
          const res = JSON.parse(event.data)
          if (res.nom) setNom(res.nom)
          if (res.prenom) setPrenom(res.prenom)
          if (res.numPasseport) setPasseport(res.numPasseport)
          if (res.sexe) setSexe(res.sexe)
          if (res.dateNaissance) setDateNaissance(res.dateNaissance)
          if (res.dateExpiration) setDateExpiration(res.dateExpiration)

          if (res.photoBase64) {
            const rawDataUrl = res.photoBase64.startsWith('data:') 
              ? res.photoBase64 
              : `data:image/jpeg;base64,${res.photoBase64}`
            const nusuk = await formatNusukSquare(rawDataUrl)
            setPhotoFile(nusuk.file)
            setPhotoPreview(nusuk.dataUrl)
          }

          if (res.pageFullBase64) {
            const fullDataUrl = res.pageFullBase64.startsWith('data:') 
              ? res.pageFullBase64 
              : `data:image/jpeg;base64,${res.pageFullBase64}`
            const fullFile = base64ToFile(fullDataUrl, `scan_complet_${res.numPasseport || Date.now()}.jpg`)
            setFileToUpload(fullFile)
          }

          setMessage({ text: '✅ Passeport et photo capturés depuis le scanner pleine page !', type: 'success' })
        } catch (e) {
          console.error(e)
        }
      }

      ws.onerror = () => {
        setIsFullPageConnected(false)
        setIsFullPageListening(false)
        setMessage({ text: '⚠️ Pilote du scanner introuvable sur 127.0.0.1:9090.', type: 'error' })
      }

      ws.onclose = () => {
        setIsFullPageConnected(false)
        setIsFullPageListening(false)
      }
    } catch {
      setIsFullPageConnected(false)
      setIsFullPageListening(false)
    }
  }

  const resetForm = () => {
    setNom(''); setPrenom(''); setReference(''); setPasseport(''); setPhone(''); setSexe(''); setDateNaissance('')
    setDateExpiration(''); setDateInscription(new Date().toISOString().split('T')[0])
    setCampagne(new Date().getFullYear())
    setAssocie(''); setTotal(0); setTotalInput(''); setPaye(0); setPayeInput(''); setNomPackage(''); setFileToUpload(null)
    setNotes(''); setPhotoFile(null); setPhotoPreview(null); setCropImageSrc(null); setMrzBuffer('')
    setMessage({ text: '', type: '' })
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

  const evaluateMrzBuffer = (buffer: string) => {
    const parsed = parseMrzRawLines(buffer)
    if (parsed && (parsed.nom || parsed.numPasseport || parsed.prenom)) {
      if (parsed.nom) setNom(parsed.nom)
      if (parsed.prenom) setPrenom(parsed.prenom)
      if (parsed.numPasseport) setPasseport(parsed.numPasseport)
      if (parsed.sexe) setSexe(parsed.sexe)
      if (parsed.dateNaissance) setDateNaissance(parsed.dateNaissance)
      if (parsed.dateExpiration) setDateExpiration(parsed.dateExpiration)

      const isIncomplete = !parsed.nom || !parsed.numPasseport || !parsed.dateNaissance
      if (isIncomplete) {
        setMessage({ 
          text: "⚠️ Données injectées ! Vérifiez et corrigez les éventuels champs manquants si nécessaire.", 
          type: 'info' 
        })
      } else {
        setMessage({ text: "✅ Passeport lu avec succès ! Vérifiez les informations.", type: 'success' })
      }

      setShowPhysicalScannerInput(false)
      setMrzBuffer('')
    }
  }

  const handlePhysicalScanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value
    setMrzBuffer(newVal)

    if (mrzTimeoutRef.current) clearTimeout(mrzTimeoutRef.current)
    if (newVal.length >= 15) {
      mrzTimeoutRef.current = setTimeout(() => {
        evaluateMrzBuffer(newVal)
      }, 100)
    }
  }

  const handlePhysicalScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (mrzTimeoutRef.current) clearTimeout(mrzTimeoutRef.current)
      mrzTimeoutRef.current = setTimeout(() => {
        evaluateMrzBuffer(mrzBuffer)
      }, 50)
    }
  }

  // 🎯 QUAND L'UTILISATEUR SÉLECTIONNE/UPLOAD SON FICHIER PASSEPORT -> DÉTECTION FACIALE ÉQUILIBRÉE ET SERRÉE
  const handlePassportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result as string
        setCropImageSrc(dataUrl)

        // 1. Sauvegarde et compression originale pour Nusuk (< 400 Ko)
        try {
          const formatted = await compressAndFormatPassportNusuk(dataUrl)
          setFileToUpload(formatted.file)
        } catch {
          setFileToUpload(selectedFile)
        }

        // 2. 🎯 DÉTECTION FACIALE NATURELLE REVISITÉE SANS VIDE À GAUCHE NI TEXTE À DROITE
        try {
          const result = await autoDetectAndCropNusuk(dataUrl)
          setPhotoFile(result.file)
          setPhotoPreview(result.dataUrl)
          setCropBox(result.cropBox)
          setCropImgDims(result.dims)

          if (result.detected) {
            setMessage({ text: "✅ Visage cadré avec précision au format officiel Nusuk !", type: 'success' })
          } else {
            setMessage({ text: "✅ Document passeport chargé ! Ajustez le cadrage si besoin.", type: 'success' })
          }
        } catch {
          setCropModalOpen(true)
        }
      }
      reader.readAsDataURL(selectedFile)
    } else {
      setFileToUpload(selectedFile)
    }
  }

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      setCropImageSrc(dataUrl)

      try {
        const autoCrop = await autoDetectAndCropNusuk(dataUrl)
        setPhotoFile(autoCrop.file)
        setPhotoPreview(autoCrop.dataUrl)
        setCropBox(autoCrop.cropBox)
        setCropImgDims(autoCrop.dims)
        setMessage({ text: "✅ Photo d'identité chargée et cadrée aux normes Nusuk (200×200px) !", type: 'success' })
      } catch {
        setCropModalOpen(true)
      }
    }
    reader.readAsDataURL(file)
  }

  const openPassportCropper = () => {
    if (!cropImageSrc) return
    const img = new Image()
    img.onload = () => {
      setPassportImgDims({ width: img.width, height: img.height })
      setPassportCropBox({
        x: 0,
        y: 0,
        width: img.width,
        height: img.height
      })
      setPassportCropModalOpen(true)
    }
    img.src = cropImageSrc
  }

  const handleConfirmPassportCrop = async () => {
    if (!cropImageSrc) return
    try {
      const formatted = await compressAndFormatPassportNusuk(cropImageSrc, passportCropBox)
      setFileToUpload(formatted.file)
      setPassportCropModalOpen(false)
      setMessage({ text: "✅ Passeport recadré et compressé avec succès pour Nusuk (< 400 Ko) !", type: 'success' })
    } catch {
      setMessage({ text: "Erreur lors du recadrage du passeport.", type: 'error' })
    }
  }

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
        setMessage({ text: "✅ Photo du pèlerin ajustée aux normes Nusuk (200×200px) !", type: 'success' })
      } catch {
        setMessage({ text: "Erreur lors du recadrage de la photo.", type: 'error' })
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

  const handlePassportPointerDownBox = (e: React.PointerEvent) => {
    e.stopPropagation()
    isPassportDraggingRef.current = true
    passportDragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, boxX: passportCropBox.x, boxY: passportCropBox.y, boxW: passportCropBox.width, boxH: passportCropBox.height }
  }
  const handlePassportPointerDownHandle = (e: React.PointerEvent) => {
    e.stopPropagation()
    isPassportResizingRef.current = true
    passportDragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, boxX: passportCropBox.x, boxY: passportCropBox.y, boxW: passportCropBox.width, boxH: passportCropBox.height }
  }
  const handlePassportPointerMoveContainer = (e: React.PointerEvent) => {
    if (!passportContainerRef.current) return
    const rect = passportContainerRef.current.getBoundingClientRect()
    const scaleX = passportImgDims.width / rect.width

    if (isPassportDraggingRef.current) {
      const deltaX = (e.clientX - passportDragStartRef.current.mouseX) * scaleX
      const deltaY = (e.clientY - passportDragStartRef.current.mouseY) * scaleX
      const nextX = Math.max(0, Math.min(passportImgDims.width - passportCropBox.width, passportDragStartRef.current.boxX + deltaX))
      const nextY = Math.max(0, Math.min(passportImgDims.height - passportCropBox.height, passportDragStartRef.current.boxY + deltaY))
      setPassportCropBox(prev => ({ ...prev, x: nextX, y: nextY }))
    } else if (isPassportResizingRef.current) {
      const deltaX = (e.clientX - passportDragStartRef.current.mouseX) * scaleX
      const nextW = Math.max(150, Math.min(passportImgDims.width - passportCropBox.x, passportDragStartRef.current.boxW + deltaX))
      const nextH = Math.max(100, Math.min(passportImgDims.height - passportCropBox.y, passportDragStartRef.current.boxH + ((e.clientY - passportDragStartRef.current.mouseY) * scaleX)))
      setPassportCropBox(prev => ({ ...prev, width: nextW, height: nextH }))
    }
  }
  const handlePassportPointerUpContainer = () => {
    isPassportDraggingRef.current = false
    isPassportResizingRef.current = false
  }

  const handleMrzPointerDownBox = (e: React.PointerEvent) => {
    e.stopPropagation()
    isMrzDraggingRef.current = true
    mrzDragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, boxX: mrzCropBox.x, boxY: mrzCropBox.y, boxW: mrzCropBox.width, boxH: mrzCropBox.height }
  }
  const handleMrzPointerDownHandle = (e: React.PointerEvent) => {
    e.stopPropagation()
    isMrzResizingRef.current = true
    mrzDragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, boxX: mrzCropBox.x, boxY: mrzCropBox.y, boxW: mrzCropBox.width, boxH: mrzCropBox.height }
  }
  const handleMrzPointerMoveContainer = (e: React.PointerEvent) => {
    if (!mrzContainerRef.current) return
    const rect = mrzContainerRef.current.getBoundingClientRect()
    const scaleX = mrzImgDims.width / rect.width

    if (isMrzDraggingRef.current) {
      const deltaX = (e.clientX - mrzDragStartRef.current.mouseX) * scaleX
      const deltaY = (e.clientY - mrzDragStartRef.current.mouseY) * scaleX
      const nextX = Math.max(0, Math.min(mrzImgDims.width - mrzCropBox.width, mrzDragStartRef.current.boxX + deltaX))
      const nextY = Math.max(0, Math.min(mrzImgDims.height - mrzCropBox.height, mrzDragStartRef.current.boxY + deltaY))
      setMrzCropBox(prev => ({ ...prev, x: nextX, y: nextY }))
    } else if (isMrzResizingRef.current) {
      const deltaX = (e.clientX - mrzDragStartRef.current.mouseX) * scaleX
      const deltaY = (e.clientY - mrzDragStartRef.current.mouseY) * scaleX
      const nextW = Math.max(100, Math.min(mrzImgDims.width - mrzCropBox.x, mrzDragStartRef.current.boxW + deltaX))
      const nextH = Math.max(30, Math.min(mrzImgDims.height - mrzCropBox.y, mrzDragStartRef.current.boxH + deltaY))
      setMrzCropBox(prev => ({ ...prev, width: nextW, height: nextH }))
    }
  }
  const handleMrzPointerUpContainer = () => {
    isMrzDraggingRef.current = false
    isMrzResizingRef.current = false
  }

  const handleAutoFill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const scanFile = e.target.files?.[0]
    if (!scanFile) return

    pendingScanFileRef.current = scanFile
    setMessage({ text: "Chargement de l'aperçu du passeport...", type: 'info' })

    try {
      const optimizedImageUrl = await preparePassportImage(scanFile)
      setMrzPreviewImageSrc(optimizedImageUrl)

      const img = new Image()
      img.onload = () => {
        setMrzImgDims({ width: img.width, height: img.height })
        
        const defaultW = Math.round(img.width * 0.94)
        const defaultH = Math.round(img.height * 0.25)
        const defaultX = Math.round((img.width - defaultW) / 2)
        const defaultY = Math.round(img.height - defaultH - (img.height * 0.03))

        setMrzCropBox({
          x: Math.max(0, defaultX),
          y: Math.max(0, defaultY),
          width: defaultW,
          height: defaultH
        })

        setMrzPreviewModalOpen(true)
        setMessage({ text: '', type: '' })
      }
      img.src = optimizedImageUrl
    } catch (err: unknown) {
      console.error(err)
      setMessage({ text: "Erreur lors du chargement de l'image.", type: 'error' })
    }
  }

  const handleConfirmAndRunMrzScan = async () => {
    if (!mrzPreviewImageSrc) return
    setMrzPreviewModalOpen(false)
    setIsScanning(true)
    setMessage({ text: "⚡ SCAN OCR DE LA ZONE MRZ EN COURS...", type: 'info' })

    const fullImageUrl = mrzPreviewImageSrc
    setCropImageSrc(fullImageUrl)

    // 🚀 Lancées tout de suite, elles tournent pendant l'attente réseau de l'OCR
    const filePromise: Promise<File | null> = compressAndFormatPassportNusuk(fullImageUrl)
      .then((f) => f.file)
      .catch(() => pendingScanFileRef.current)
    const facePromise = autoDetectAndCropNusuk(fullImageUrl).catch(() => null)

    try {
      const mrzOnlyBase64 = await extractMrzRegionBase64(fullImageUrl, mrzCropBox)

      const baseUrl = getApiUrl()
      const targetEndpoint = `${baseUrl}/api/scan-mrz`

      let data: any

      if (Capacitor.isNativePlatform()) {
        const nativeResponse = await CapacitorHttp.post({
          url: targetEndpoint,
          headers: { 'Content-Type': 'application/json' },
          data: { imageBase64: mrzOnlyBase64 },
          connectTimeout: 30000,
          readTimeout: 30000,
        })

        if (nativeResponse.status !== 200) {
          const errData = typeof nativeResponse.data === 'object' ? nativeResponse.data : {}
          throw new Error(errData?.error || `Erreur serveur (${nativeResponse.status})`)
        }

        data = typeof nativeResponse.data === 'string' ? JSON.parse(nativeResponse.data) : nativeResponse.data
      } else {
        let res: Response
        try {
          res = await fetch(targetEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: mrzOnlyBase64 }),
          })
        } catch {
          throw new Error("Impossible de joindre le serveur de scan.")
        }

        const rawText = await res.text()
        try {
          data = JSON.parse(rawText)
        } catch {
          throw new Error(`Réponse inattendue du serveur (${res.status}).`)
        }

        if (!res.ok) throw new Error(data.error || 'Échec de la lecture du passeport.')
      }

      // Les champs s'affichent dès que l'OCR répond
      if (data.nom) setNom(data.nom)
      if (data.prenom) setPrenom(data.prenom)
      if (data.numPasseport) setPasseport(data.numPasseport)
      if (data.sexe) setSexe(data.sexe)
      if (data.dateNaissance) setDateNaissance(data.dateNaissance)
      if (data.dateExpiration) setDateExpiration(data.dateExpiration)

      // Fichier Nusuk + visage : généralement déjà prêts
      const [nusukFile, autoCrop] = await Promise.all([filePromise, facePromise])

      if (nusukFile) setFileToUpload(nusukFile)

      if (autoCrop) {
        setPhotoFile(autoCrop.file)
        setPhotoPreview(autoCrop.dataUrl)
        setCropBox(autoCrop.cropBox)
        setCropImgDims(autoCrop.dims)
        setMessage({ text: "✅ Passeport lu et photo du visage extraite sans aucun texte !", type: 'success' })
      } else {
        setMessage({ text: "✅ Passeport lu avec succès !", type: 'success' })
      }

    } catch (err: unknown) {
      console.error(err)
      const errMsg = err instanceof Error ? err.message : String(err)
      setMessage({ text: `❌ ERREUR LORS DU SCAN : ${errMsg}`, type: 'error' })
    } finally {
      setIsScanning(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (!agenceId) {
      setMessage({ text: profileReady ? "❌ ERREUR : AUCUNE AGENCE LIÉE À VOTRE COMPTE." : "⏳ CHARGEMENT DU PROFIL EN COURS...", type: 'error' })
      return
    }
    setLoading(true)
    try {
      let fileUrl = ''
      if (fileToUpload) {
        const uploaded = await uploadPassportFile(fileToUpload)
        fileUrl = uploaded.path
      }

      let photoUrl = ''
      if (photoFile) {
        const uploadedPhoto = await uploadPassportFile(photoFile)
        photoUrl = uploadedPhoto.path
      }

      const { error } = await supabase.from('pelerins').insert({
        id: crypto.randomUUID(),
        nom_complet: nom.trim(),
        prenom: prenom.trim(),
        reference: reference.trim() || null,
        num_passeport: passeport.trim() || null,
        telephone_pelerin: phone.trim() || null,
        sexe: sexe || null,
        date_naissance: dateNaissance || null,
        date_expiration: dateExpiration || null,
        date_inscription: dateInscription || null,
        campagne: campagne || null,
        prix_package: total,
        total_paye: paye,
        nom_package: nomPackage.trim() || null,
        document_url: fileUrl || null,
        photo_url: photoUrl || null,
        notes: notes.trim() || null,
        agence_id: agenceId,
        agence_ou_personne_associee: associe.trim() || null,
        created_at: new Date().toISOString(),
      })
      if (error) throw error

      setMessage({ text: "✅ PÈLERIN ENREGISTRÉ SUR SUPABASE.", type: 'success' })
      setTimeout(resetForm, 2000)
    } catch (err: unknown) {
      console.error(err)
      const errObj = err as { message?: string; details?: string }
      const errMsg = errObj?.message || errObj?.details || 'Erreur inconnue'
      setMessage({ text: `❌ ERREUR : ${errMsg}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-0 md:p-6 lg:p-8">
      <div className="w-full max-w-6xl">
        <div className="bg-white md:rounded-[2.5rem] shadow-xl border border-gray-100 p-5 md:p-10 min-h-screen md:min-h-0">
          
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-4xl font-black text-gray-900 uppercase tracking-tighter">Nouveau Dossier</h2>
            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1 italic">Gestion Immédiate & Compatibilité Scanner</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* BLOC GAUCHE */}
            <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">
              
              {/* OPTIONS DE SCAN */}
              <div className="p-5 bg-blue-50/70 rounded-3xl border-2 border-dashed border-blue-200 shadow-inner space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-blue-900 uppercase italic flex items-center gap-2">
                    <Smartphone size={14} /> 1. Mode de Scan Passeport
                  </label>
                  {(isScanning || isTwainScanning) && <Loader2 className="animate-spin text-blue-600" size={18} />}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl border border-blue-100 cursor-pointer hover:border-blue-300 active:scale-95 transition shadow-xs text-center">
                    <ScanLine className="text-blue-600 mb-1" size={18} />
                    <span className="text-[9px] font-black text-blue-900 uppercase leading-tight">
                      {isScanning ? "Analyse..." : "Scan Photo / OCR"}
                    </span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleAutoFill} disabled={isScanning} />
                  </label>

                  <button
                    type="button"
                    onClick={triggerTwainScan}
                    disabled={isTwainScanning}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl border bg-blue-600 hover:bg-blue-700 text-white border-blue-600 transition cursor-pointer active:scale-95 text-center shadow-xs disabled:opacity-50"
                  >
                    {isTwainScanning ? <Loader2 size={18} className="animate-spin mb-1" /> : <Printer size={18} className="mb-1" />}
                    <span className="text-[9px] font-black uppercase leading-tight">Numériser (TWAIN)</span>
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
                    <Radio size={18} className={isFullPageListening ? 'text-white mb-1 animate-pulse' : 'text-emerald-600 mb-1'} />
                    <span className="text-[9px] font-black uppercase leading-tight">Pleine Page</span>
                    <span className="text-[7.5px] opacity-75">{isFullPageListening ? 'Actif' : 'Vitre USB'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPhysicalScannerInput(true)
                      setTimeout(() => physicalInputRef.current?.focus(), 100)
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition cursor-pointer active:scale-95 ${
                      showPhysicalScannerInput 
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                        : 'bg-white text-slate-800 border-blue-100 hover:border-blue-300 shadow-xs'
                    }`}
                  >
                    <Keyboard size={18} className={showPhysicalScannerInput ? "text-emerald-400 mb-1" : "text-blue-600 mb-1"} />
                    <span className="text-[9px] font-black uppercase leading-tight">
                      Douchette MRZ
                    </span>
                    <span className="text-[7.5px] opacity-75">Clavier</span>
                  </button>
                </div>

                {showPhysicalScannerInput && (
                  <div className="p-3 bg-white rounded-2xl border-2 border-emerald-400 shadow-sm animate-in fade-in space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-black text-emerald-800 uppercase">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block mr-1" />
                        Prêt pour douchette physique
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setShowPhysicalScannerInput(false)}
                        className="text-slate-400 hover:text-slate-600"
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
                      placeholder="Glissez le passeport dans la douchette..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* SECTION PHOTO D'IDENTITÉ AVEC DÉTECTION FACIALE IA AUTOMATIQUE */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-700 uppercase flex items-center gap-1.5">
                    <Camera size={14} className="text-blue-600" /> Photo d'identité Nusuk (200×200)
                  </span>
                  {photoPreview && (
                    <button
                      type="button"
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                      className="text-[9px] font-bold text-red-500 hover:text-red-700 uppercase cursor-pointer"
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-inner relative">
                    {photoPreview ? (
                      <img src={photoPreview} alt="Aperçu Nusuk" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={24} className="text-gray-300" />
                    )}
                    {photoPreview && (
                      <div className="absolute bottom-0 inset-x-0 bg-emerald-600 text-[8px] font-black text-white text-center py-0.5 uppercase">
                        Nusuk OK
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-1.5">
                    {cropImageSrc && (
                      <button
                        type="button"
                        onClick={() => setCropModalOpen(true)}
                        className="w-full py-2 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-center text-[10px] font-black uppercase flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Crop size={13} />
                        <span>Ajuster Photo ID</span>
                      </button>
                    )}

                    <label className="block w-full py-2 px-2.5 bg-white border border-gray-200 hover:border-blue-300 rounded-xl text-center text-[10px] font-bold text-gray-700 cursor-pointer transition shadow-2xs">
                      {photoFile ? "Remplacer la photo" : "Importer une photo"}
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handlePhotoFileChange} 
                      />
                    </label>
                  </div>
                </div>

                <p className="text-[9px] text-gray-400 font-medium leading-tight">
                  Format standard : 200×200 pixels JPEG &lt; 100 Ko • Visage isolé sans texte.
                </p>
              </div>

              {/* SECTION PIÈCE JOINTE PASSEPORT */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-700 uppercase flex items-center gap-1.5">
                    <FileCheck size={14} className="text-blue-600" /> Document Passeport (Nusuk &lt; 400 Ko)
                  </span>
                  {fileToUpload && (
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                      {(fileToUpload.size / 1024).toFixed(0)} Ko (Conforme)
                    </span>
                  )}
                </div>

                <label className="flex items-center px-4 py-3 bg-white rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 transition cursor-pointer shadow-xs">
                  <Upload size={16} className="text-blue-600 mr-2.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-700 truncate">
                      {fileToUpload ? fileToUpload.name : "Joindre le fichier du passeport"}
                    </p>
                    <p className="text-[9px] text-gray-400">
                      Extraction faciale automatique vers la photo d'identité • Compression Nusuk (&lt; 400 Ko)
                    </p>
                  </div>
                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={handlePassportFileChange} />
                </label>

                {cropImageSrc && (
                  <button
                    type="button"
                    onClick={openPassportCropper}
                    className="w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-center text-[10px] font-black uppercase flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Crop size={13} className="text-blue-600" />
                    <span>Redimensionner / Recadrer manuellement</span>
                  </button>
                )}
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between px-4">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter italic">2. Formulaire Client</p>
                <button type="button" onClick={resetForm} className="text-[9px] font-black text-red-500 hover:text-red-700 flex items-center gap-1 uppercase bg-white px-3 py-1.5 rounded-xl border border-gray-200/60 shadow-sm transition-all active:scale-95 cursor-pointer">
                  <RotateCcw size={10} /> Réinitialiser
                </button>
              </div>
            </div>

            {/* BLOC DROIT : FORMULAIRE */}
            <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-5">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Nom (Obligatoire)</label>
                  <input 
                    type="text" value={nom} onChange={(e) => setNom(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-base font-bold focus:border-blue-600 outline-none transition-all uppercase"
                    placeholder="NOM" required 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Prénom (Obligatoire)</label>
                  <input 
                    type="text" value={prenom} onChange={(e) => setPrenom(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-base font-bold focus:border-blue-600 outline-none transition-all uppercase"
                    placeholder="PRÉNOM" required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-blue-600 uppercase ml-4 mb-1 flex items-center gap-1">
                    <CalendarDays size={12}/> Date d'inscription (Optionnel)
                  </label>
                  <input 
                    type="date" value={dateInscription} onChange={(e) => setDateInscription(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-blue-50 bg-blue-50/30 text-gray-900 font-bold focus:border-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Campagne (Optionnel)</label>
                  <select
                    value={campagne ?? ''}
                    onChange={(e) => setCampagne(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none appearance-none"
                  >
                    <option value="">SÉLECTIONNER</option>
                    {(() => {
                      const start = 2024
                      const end = new Date().getFullYear() + 100
                      const opts = [] as number[]
                      for (let y = start; y <= end; y++) opts.push(y)
                      return opts.map(y => <option key={y} value={y}>{y}</option>)
                    })()}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 flex items-center gap-1">
                    <UserRound size={12}/> Sexe (Optionnel)
                  </label>
                  <select
                    value={sexe}
                    onChange={(e) => setSexe(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'6 9 12 15 18 9\'></polyline></svg>")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1.25rem center', backgroundSize: '1rem' }}
                  >
                    <option value="">SÉLECTIONNER</option>
                    <option value="HOMME">HOMME</option>
                    <option value="FEMME">FEMME</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Référence (Optionnel)</label>
                  <input 
                    type="text" value={reference} onChange={(e) => setReference(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none uppercase"
                    placeholder="GRP-A"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">N° Passeport (Optionnel)</label>
                  <input 
                    type="text" value={passeport} onChange={(e) => setPasseport(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none"
                    placeholder="A000000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Intermédiaire / Agence (Optionnel)</label>
                  <input 
                    type="text" value={associe} onChange={(e) => setAssocie(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none uppercase"
                    placeholder="NOM DE L'ASSOCIÉ" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Téléphone (Optionnel)</label>
                  <input 
                    type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold focus:border-blue-600 outline-none"
                    placeholder="70 00 00 00" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Naissance (Optionnel)</label>
                  <input 
                    type="date" value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Exp. Passeport (Optionnel)</label>
                  <input 
                    type="date" value={dateExpiration} onChange={(e) => setDateExpiration(e.target.value)}
                    className="w-full px-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-bold text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900 p-4 rounded-2xl shadow-inner">
                  <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block">Prix Total (Obligatoire)</label>
                  <input 
                    type="text" inputMode="numeric" pattern="[0-9\s]*" value={totalInput}
                    onChange={(e) => {
                      setTotalInput(formatAmount(e.target.value))
                      setTotal(parseAmount(e.target.value))
                    }}
                    className="w-full bg-transparent text-white font-black text-lg outline-none" required 
                  />
                </div>
                <div className="bg-green-600 p-4 rounded-2xl shadow-inner">
                  <label className="text-[9px] font-black text-green-200 uppercase mb-1 block">Acompte (Optionnel)</label>
                  <input 
                    type="text" inputMode="numeric" pattern="[0-9\s]*" value={payeInput}
                    onChange={(e) => {
                      setPayeInput(formatAmount(e.target.value))
                      setPaye(parseAmount(e.target.value))
                    }}
                    className="w-full bg-transparent text-white font-black text-lg outline-none" 
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">Nom du Package (Optionnel)</label>
                <input 
                  type="text" value={nomPackage} onChange={(e) => setNomPackage(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 text-base font-bold focus:border-blue-600 outline-none transition-all uppercase"
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
                  placeholder="Observations médicales, demandes particulières, régime alimentaire, statut spécial..."
                  className="w-full px-5 py-3.5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-900 font-semibold text-sm focus:border-blue-600 outline-none transition-all resize-none"
                />
              </div>

              <div className="flex justify-between items-center px-5 py-4 bg-gray-100 rounded-2xl border border-gray-200/50 shadow-sm">
                 <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Reste à payer :</span>
                 <span className="font-black text-lg text-gray-900">{(total - paye).toLocaleString()} CFA</span>
              </div>

              <button 
                type="submit" disabled={loading || !agenceId || !profileReady}
                className={`w-full py-5 rounded-2xl text-white font-black text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 ${loading || !agenceId || !profileReady ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'}`}
              >
                {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                {loading ? "ENREGISTREMENT..." : !profileReady ? "CHARGEMENT DU PROFIL..." : "VALIDER LE DOSSIER"}
              </button>

              {message.text && (
                <div className={`p-4 rounded-2xl text-center font-bold text-[10px] uppercase tracking-wider shadow-sm border ${message.type === 'success' ? 'bg-green-100 text-green-700 border-green-200' : message.type === 'info' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                  {message.text}
                </div>
              )}
            </form>

          </div>

        </div>
      </div>

      {/* ── MODAL APERÇU ET CADRAGE MRZ AVANT OCR ── */}
      {mrzPreviewModalOpen && mrzPreviewImageSrc && (
        <div 
          className="fixed inset-0 z-[9999] bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
          onPointerMove={handleMrzPointerMoveContainer}
          onPointerUp={handleMrzPointerUpContainer}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[95vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine size={18} className="text-amber-400" />
                <h3 className="font-black text-sm uppercase">Aperçu & Cadrage de la zone MRZ</h3>
              </div>
              <button 
                type="button"
                onClick={() => setMrzPreviewModalOpen(false)} 
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer text-slate-300"
              >
                <X size={16} />
              </button>
            </div>

            <p className="px-4 py-2 bg-amber-50 text-[11px] text-amber-800 font-medium border-b border-amber-200">
              Vérifiez l'aperçu. Déplacez ou redimensionnez le <strong>cadre jaune</strong> pour entourer exactement les deux lignes MRZ au bas du passeport.
            </p>

            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-950/90 select-none">
              <div ref={mrzContainerRef} className="relative max-w-full max-h-[55vh] inline-block touch-none">
                <img src={mrzPreviewImageSrc} alt="Aperçu passeport" className="max-h-[55vh] w-auto max-w-full object-contain pointer-events-none block" />
                {(() => {
                  const scalePctX = (mrzCropBox.x / mrzImgDims.width) * 100
                  const scalePctY = (mrzCropBox.y / mrzImgDims.height) * 100
                  const scalePctW = (mrzCropBox.width / mrzImgDims.width) * 100
                  const scalePctH = (mrzCropBox.height / mrzImgDims.height) * 100

                  return (
                    <div
                      onPointerDown={handleMrzPointerDownBox}
                      style={{
                        left: `${scalePctX}%`,
                        top: `${scalePctY}%`,
                        width: `${scalePctW}%`,
                        height: `${scalePctH}%`,
                      }}
                      className="absolute border-2 border-amber-400 bg-amber-400/20 shadow-lg cursor-move rounded-xl touch-none ring-2 ring-amber-500/50"
                    >
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                        <Move size={20} className="text-white" />
                      </div>
                      <div
                        onPointerDown={handleMrzPointerDownHandle}
                        className="absolute -right-2.5 -bottom-2.5 w-6 h-6 bg-amber-500 border-2 border-white rounded-full flex items-center justify-center cursor-nwse-resize shadow-md touch-none"
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
                onClick={() => setMrzPreviewModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmAndRunMrzScan}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs transition shadow-sm cursor-pointer"
              >
                <ScanLine size={16} />
                <span>Lancer le scan OCR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 🎯 MODAL 1 : RECADRAGE VISAGE NUSUK (200x200 px) ── */}
      {cropModalOpen && cropImageSrc && (
        <div 
          className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
          onPointerMove={handlePointerMoveContainer}
          onPointerUp={handlePointerUpContainer}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[95vh]">
            <div className="p-4 bg-slate-955 text-white flex items-center justify-between">
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

      {/* ── 🎯 MODAL 2 : RECADRAGE PASSEPORT COMPLET NUSUK (< 400 Ko) ── */}
      {passportCropModalOpen && cropImageSrc && (
        <div 
          className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
          onPointerMove={handlePassportPointerMoveContainer}
          onPointerUp={handlePassportPointerUpContainer}
        >
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[95vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck size={18} className="text-blue-400" />
                <h3 className="font-black text-sm uppercase">Recadrage Passeport Complet Nusuk (&lt; 400 Ko)</h3>
              </div>
              <button 
                type="button"
                onClick={() => setPassportCropModalOpen(false)} 
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer text-slate-300"
              >
                <X size={16} />
              </button>
            </div>

            <p className="px-4 py-2 bg-slate-100 text-[11px] text-slate-600 font-medium">
              Ajustez le <strong>cadre bleu</strong> pour englober la page complète du passeport (avec les zones MRZ). Le fichier sera automatiquement compressé pour Nusuk tout en préservant la résolution.
            </p>

            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-950/90 select-none">
              <div ref={passportContainerRef} className="relative max-w-full max-h-[55vh] inline-block touch-none">
                <img src={cropImageSrc} alt="Passeport complet" className="max-h-[55vh] w-auto max-w-full object-contain pointer-events-none block" />
                {(() => {
                  const scalePctX = (passportCropBox.x / passportImgDims.width) * 100
                  const scalePctY = (passportCropBox.y / passportImgDims.height) * 100
                  const scalePctW = (passportCropBox.width / passportImgDims.width) * 100
                  const scalePctH = (passportCropBox.height / passportImgDims.height) * 100

                  return (
                    <div
                      onPointerDown={handlePassportPointerDownBox}
                      style={{
                        left: `${scalePctX}%`,
                        top: `${scalePctY}%`,
                        width: `${scalePctW}%`,
                        height: `${scalePctH}%`,
                      }}
                      className="absolute border-2 border-blue-400 bg-blue-400/20 shadow-lg cursor-move rounded-xl touch-none ring-2 ring-blue-500/50"
                    >
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                        <Move size={24} className="text-white" />
                      </div>
                      <div
                        onPointerDown={handlePassportPointerDownHandle}
                        className="absolute -right-2.5 -bottom-2.5 w-6 h-6 bg-blue-600 border-2 border-white rounded-full flex items-center justify-center cursor-nwse-resize shadow-md touch-none"
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
                onClick={() => setPassportCropModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmPassportCrop}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition shadow-sm cursor-pointer"
              >
                <Check size={16} />
                <span>Valider le passeport Nusuk</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}