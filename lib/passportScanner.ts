import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { mergeMrzResults, parseMrzSmart, type MrzParseResult } from './mrzEngine'
import {
  autoDetectAndCropNusuk,
  compressAndFormatPassportNusuk,
  ensureFaceModelsLoaded,
  ensureUprightPassportOrientation,
  loadHtmlImage,
  readFileAsCleanDataUrl,
  rotateImageDataUrl,
  type AutoCropNusukResult,
  type ImageDiagnostic,
} from './passportFaceNusuk'

export interface MrzBoxRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface CompleteScanOutcome {
  masterPassportDataUrl: string
  rotatedDegrees: 0 | 90 | 180 | 270
  diagnostic?: ImageDiagnostic
  mrzBox: MrzBoxRegion
  passportFile: File | null
  photoResult: AutoCropNusukResult | null
  mrzResult: MrzParseResult | null
  ocrError?: string
}

export function getPassportApiBaseUrl(): string {
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

/**
 * Détecte automatiquement la bande MRZ dans la partie basse du passeport
 * par projection horizontale des gradients verticaux (les 2 lignes OCR-B denses).
 */
export async function detectMrzRegionAuto(imageSrc: string): Promise<{
  region: MrzBoxRegion
  dims: { width: number; height: number }
}> {
  const img = await loadHtmlImage(imageSrc)
  const dims = { width: img.width, height: img.height }

  const fallbackW = Math.round(dims.width * 0.96)
  const fallbackH = Math.round(dims.height * 0.27)
  const fallback: MrzBoxRegion = {
    x: Math.round((dims.width - fallbackW) / 2),
    y: Math.max(0, dims.height - fallbackH - Math.round(dims.height * 0.015)),
    width: fallbackW,
    height: fallbackH,
  }

  try {
    const sampleW = Math.min(640, dims.width)
    const scale = sampleW / dims.width
    const sampleH = Math.max(40, Math.round(dims.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = sampleW
    canvas.height = sampleH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { region: fallback, dims }

    ctx.drawImage(img, 0, 0, sampleW, sampleH)
    const startY = Math.floor(sampleH * 0.52)
    const subH = sampleH - startY
    if (subH < 20) return { region: fallback, dims }

    const data = ctx.getImageData(0, startY, sampleW, subH).data
    const marginX = Math.floor(sampleW * 0.04)
    const rowEnergy = new Float32Array(subH)

    for (let y = 0; y < subH; y++) {
      let energy = 0
      const rowOffset = y * sampleW * 4
      for (let x = marginX; x < sampleW - marginX - 1; x++) {
        const i1 = rowOffset + x * 4
        const i2 = i1 + 4
        const g1 = 0.299 * data[i1] + 0.587 * data[i1 + 1] + 0.114 * data[i1 + 2]
        const g2 = 0.299 * data[i2] + 0.587 * data[i2 + 1] + 0.114 * data[i2 + 2]
        energy += Math.abs(g2 - g1)
      }
      rowEnergy[y] = energy / Math.max(1, sampleW - marginX * 2)
    }

    // Chercher la fenêtre de hauteur ~22% de l'image ayant la plus forte densité de caractères MRZ
    const winH = Math.max(14, Math.round(sampleH * 0.21))
    let bestWinStart = -1
    let bestWinSum = 0

    for (let y = 0; y <= subH - winH; y++) {
      let sum = 0
      for (let k = 0; k < winH; k++) sum += rowEnergy[y + k]
      // Léger bonus vers le bas du document où se situe toujours la MRZ
      const bottomBias = 1 + (y / Math.max(1, subH)) * 0.18
      const weighted = sum * bottomBias
      if (weighted > bestWinSum) {
        bestWinSum = weighted
        bestWinStart = y
      }
    }

    const avgEnergy = bestWinSum / winH
    if (bestWinStart === -1 || avgEnergy < 6.5) {
      return { region: fallback, dims }
    }

    const padTop = Math.round(sampleH * 0.03)
    const padBottom = Math.round(sampleH * 0.035)
    const topPx = Math.max(0, startY + bestWinStart - padTop)
    const bottomPx = Math.min(sampleH, startY + bestWinStart + winH + padBottom)

    const inv = 1 / scale
    const realY = Math.max(0, Math.round(topPx * inv))
    const realH = Math.min(dims.height - realY, Math.round((bottomPx - topPx) * inv))
    const realW = Math.round(dims.width * 0.96)
    const realX = Math.round((dims.width - realW) / 2)

    if (realH < dims.height * 0.12) {
      return { region: fallback, dims }
    }

    return {
      region: { x: realX, y: realY, width: realW, height: realH },
      dims,
    }
  } catch {
    return { region: fallback, dims }
  }
}

/**
 * Génère deux variantes dédiées EXCLUSIVEMENT à l'OCR à partir de la bande MRZ :
 * 1) Contrast-stretched haute netteté (pour OCR.space & Tesseract passe 1)
 * 2) Seuillage adaptatif local Bradley-Roth + bordure blanche calme (immunisé contre ombres/vignettes)
 */
export async function buildMrzOcrVariants(
  imageSrc: string,
  region: MrzBoxRegion
): Promise<{ enhancedBase64: string; binarizedBase64: string }> {
  const img = await loadHtmlImage(imageSrc)

  const srcX = Math.max(0, Math.round(region.x))
  const srcY = Math.max(0, Math.round(region.y))
  const srcW = Math.max(20, Math.min(img.width - srcX, Math.round(region.width)))
  const srcH = Math.max(16, Math.min(img.height - srcY, Math.round(region.height)))

  // Agrandir à ~1600 px de large pour une reconnaissance optimale des glyphes OCR-B
  const targetW = Math.min(2000, Math.max(1400, srcW))
  const scale = targetW / srcW
  const targetH = Math.max(40, Math.round(srcH * scale))
  const border = 24

  // 1. Variante niveaux de gris étirés (2e - 98e centile) + bordure blanche
  const c1 = document.createElement('canvas')
  c1.width = targetW + border * 2
  c1.height = targetH + border * 2
  const ctx1 = c1.getContext('2d', { willReadFrequently: true })
  if (!ctx1) throw new Error('Impossible de préparer la zone MRZ.')

  ctx1.fillStyle = '#FFFFFF'
  ctx1.fillRect(0, 0, c1.width, c1.height)
  ctx1.imageSmoothingEnabled = true
  ctx1.imageSmoothingQuality = 'high'
  ctx1.drawImage(img, srcX, srcY, srcW, srcH, border, border, targetW, targetH)

  const imgData = ctx1.getImageData(border, border, targetW, targetH)
  const d = imgData.data
  const gray = new Uint8Array(targetW * targetH)
  const hist = new Uint32Array(256)

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    gray[p] = g
    hist[g]++
  }

  const totalPx = targetW * targetH
  let low = 0
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= totalPx * 0.02) {
      low = v
      break
    }
  }
  let high = 255
  acc = 0
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]
    if (acc >= totalPx * 0.02) {
      high = v
      break
    }
  }
  const span = Math.max(20, high - low)

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const stretched = Math.max(0, Math.min(255, Math.round(((gray[p] - low) * 255) / span)))
    d[i] = stretched
    d[i + 1] = stretched
    d[i + 2] = stretched
    gray[p] = stretched
  }
  ctx1.putImageData(imgData, border, border)
  const enhancedBase64 = c1.toDataURL('image/jpeg', 0.94)

  // 2. Variante binarisée adaptative (image intégrale Bradley-Roth, insensible aux ombres/dégradés d'éclairage)
  const c2 = document.createElement('canvas')
  c2.width = c1.width
  c2.height = c1.height
  const ctx2 = c2.getContext('2d')
  if (!ctx2) {
    return { enhancedBase64, binarizedBase64: enhancedBase64 }
  }
  ctx2.fillStyle = '#FFFFFF'
  ctx2.fillRect(0, 0, c2.width, c2.height)

  const integral = new Float64Array((targetW + 1) * (targetH + 1))
  const strideI = targetW + 1
  for (let y = 1; y <= targetH; y++) {
    let rowSum = 0
    for (let x = 1; x <= targetW; x++) {
      rowSum += gray[(y - 1) * targetW + (x - 1)]
      integral[y * strideI + x] = integral[(y - 1) * strideI + x] + rowSum
    }
  }

  const binImgData = ctx2.createImageData(targetW, targetH)
  const bd = binImgData.data
  const winRadius = Math.max(12, Math.round(targetH / 7))
  const thresholdRatio = 0.84

  for (let y = 0; y < targetH; y++) {
    const y1 = Math.max(0, y - winRadius)
    const y2 = Math.min(targetH, y + winRadius + 1)
    for (let x = 0; x < targetW; x++) {
      const x1 = Math.max(0, x - winRadius)
      const x2 = Math.min(targetW, x + winRadius + 1)
      const count = (x2 - x1) * (y2 - y1)
      const sum =
        integral[y2 * strideI + x2] -
        integral[y1 * strideI + x2] -
        integral[y2 * strideI + x1] +
        integral[y1 * strideI + x1]
      const val = gray[y * targetW + x] < (sum / count) * thresholdRatio ? 0 : 255
      const o = (y * targetW + x) * 4
      bd[o] = val
      bd[o + 1] = val
      bd[o + 2] = val
      bd[o + 3] = 255
    }
  }
  ctx2.putImageData(binImgData, border, border)
  const binarizedBase64 = c2.toDataURL('image/jpeg', 0.94)

  return { enhancedBase64, binarizedBase64 }
}

// ── Worker local Tesseract.js spécialisé MRZ (`public/model/mrz.traineddata`) ──
type TesseractWorker = import('tesseract.js').Worker
let mrzWorkerInstance: TesseractWorker | null = null
let mrzWorkerPromise: Promise<TesseractWorker | null> | null = null

async function getLocalMrzWorker(): Promise<TesseractWorker | null> {
  if (mrzWorkerInstance) return mrzWorkerInstance
  if (!mrzWorkerPromise) {
    mrzWorkerPromise = (async () => {
      try {
        const Tesseract = await import('tesseract.js')
        const worker = await Tesseract.createWorker('mrz', 1, {
          workerPath: '/tesseract/worker.min.js',
          corePath: '/tesseract',
          langPath: '/model',
          gzip: false,
        })
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
          preserve_interword_spaces: '0',
        })
        mrzWorkerInstance = worker
        return worker
      } catch (e) {
        console.warn('[LocalMRZ] Initialisation Tesseract MRZ ignorée :', e)
        mrzWorkerPromise = null
        return null
      }
    })()
  }
  return mrzWorkerPromise
}

export async function runLocalMrzOcr(
  enhancedBase64: string,
  binarizedBase64: string
): Promise<MrzParseResult | null> {
  const worker = await getLocalMrzWorker()
  if (!worker) return null

  try {
    const r1 = await worker.recognize(binarizedBase64)
    const p1 = r1?.data?.text ? parseMrzSmart(r1.data.text, 'local-mrz-bin') : null
    if (
      p1 &&
      p1.verified.passeport &&
      p1.verified.dateNaissance &&
      p1.verified.dateExpiration &&
      p1.nom &&
      p1.prenom
    ) {
      return p1
    }

    const r2 = await worker.recognize(enhancedBase64)
    const p2 = r2?.data?.text ? parseMrzSmart(r2.data.text, 'local-mrz-gray') : null

    return mergeMrzResults([p1, p2])
  } catch (e) {
    console.warn('[LocalMRZ] Erreur lecture locale :', e)
    return null
  }
}

export interface ServerMrzResponse extends MrzParseResult {
  rotationDegrees?: 0 | 90 | 180 | 270
}

export async function postServerMrzOcr(
  mrzImageBase64: string,
  fullImageBase64?: string
): Promise<ServerMrzResponse> {
  const targetEndpoint = `${getPassportApiBaseUrl()}/api/scan-mrz`
  const payload = fullImageBase64
    ? { fullImageBase64, imageBase64: mrzImageBase64 }
    : { imageBase64: mrzImageBase64 }

  if (Capacitor.isNativePlatform()) {
    const nativeResponse = await CapacitorHttp.post({
      url: targetEndpoint,
      headers: { 'Content-Type': 'application/json' },
      data: payload,
      connectTimeout: 20000,
      readTimeout: 20000,
    })
    if (nativeResponse.status !== 200) {
      throw new Error(
        "Impossible de lire automatiquement ce passeport. Assurez-vous que l'image soit bien nette."
      )
    }
    const raw =
      typeof nativeResponse.data === 'string'
        ? JSON.parse(nativeResponse.data)
        : nativeResponse.data
    return normalizeServerMrzResponse(raw)
  }

  let res: Response
  try {
    res = await fetch(targetEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(18000),
    })
  } catch {
    throw new Error('Impossible de se connecter au serveur de lecture.')
  }

  const rawText = await res.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(rawText)
  } catch {
    throw new Error('La lecture serveur est momentanément indisponible.')
  }
  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : 'Les écritures du passeport ne sont pas assez lisibles.'
    )
  }
  return normalizeServerMrzResponse(data)
}

function normalizeServerMrzResponse(data: Record<string, unknown>): ServerMrzResponse {
  const rotRaw = Number(data?.rotationDegrees || 0)
  const rotationDegrees: 0 | 90 | 180 | 270 =
    rotRaw === 90 || rotRaw === 180 || rotRaw === 270 ? rotRaw : 0

  if (data && typeof data === 'object' && 'verified' in data && 'confidenceScore' in data) {
    return { ...(data as unknown as MrzParseResult), rotationDegrees }
  }
  const nom = String(data.nom || '').trim()
  const prenom = String(data.prenom || '').trim()
  const numPasseport = String(data.numPasseport || '').trim()
  const sexe = data.sexe === 'FEMME' ? 'FEMME' : data.sexe === 'HOMME' ? 'HOMME' : ''
  const dateNaissance = String(data.dateNaissance || '').trim()
  const dateExpiration = String(data.dateExpiration || '').trim()
  return {
    nom,
    prenom,
    numPasseport,
    sexe,
    dateNaissance,
    dateExpiration,
    nationalite: String(data.nationalite || ''),
    paysEmetteur: String(data.paysEmetteur || ''),
    verified: {
      passeport: Boolean(numPasseport),
      dateNaissance: Boolean(dateNaissance),
      dateExpiration: Boolean(dateExpiration),
      composite: false,
      nomPrenom: Boolean(nom && prenom),
    },
    unverifiedFields: [],
    repairedFields: [],
    confidenceScore: 75,
    source: 'server',
    rotationDegrees,
  }
}

/**
 * Prépare une copie légère (~110 Ko, max 1150px) du passeport complet en < 35 ms
 * pour un envoi éclair vers Gemini Vision.
 */
async function buildCompactFullImageForAi(imageSrc: string): Promise<string> {
  try {
    const img = await loadHtmlImage(imageSrc)
    const maxSide = 1150
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return imageSrc
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return imageSrc
  }
}

/**
 * Lecture manuelle ciblée sur une zone MRZ précise (bouton « Cadrer MRZ »).
 */
export async function readMrzHybrid(
  masterDataUrl: string,
  region: MrzBoxRegion
): Promise<MrzParseResult> {
  const { enhancedBase64, binarizedBase64 } = await buildMrzOcrVariants(masterDataUrl, region)
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine

  if (isOnline) {
    try {
      const serverRes = await postServerMrzOcr(enhancedBase64)
      if (serverRes && (serverRes.nom || serverRes.numPasseport)) {
        return serverRes
      }
    } catch (err) {
      console.warn('[MRZ] Serveur indisponible, bascule locale :', err)
    }
  }

  const localRes = await runLocalMrzOcr(enhancedBase64, binarizedBase64).catch(() => null)
  if (localRes && (localRes.nom || localRes.numPasseport)) {
    return localRes
  }

  throw new Error(
    'Impossible de lire la bande MRZ. Évitez les reflets et assurez-vous que les 2 lignes soient nettes.'
  )
}

/**
 * Pipeline TURBO zéro compromis (~1.0 à 1.8 s au lieu de 10-15 s) :
 * 1. ZÉRO blocage avant l'envoi à Gemini : l'image légère (~110 Ko) part vers Gemini à t = 40 ms !
 * 2. Dès que Gemini répond (~0.9s), `onMrzReady` remplit IMMÉDIATEMENT le formulaire à l'écran !
 * 3. Pendant l'appel réseau Gemini, les modèles visage se préparent en parallèle.
 * 4. Si Gemini signale un passeport tourné (90°/180°/270°), l'image maître est redressée instantanément
 *    avant la découpe 68-landmarks en passe unique et la compression < 390 Ko.
 * 5. Le lourd moteur local Tesseract (11.4 Mo) n'est appelé QUE si hors-ligne ou en cas de panne réseau !
 */
export async function scanPassportComplete(
  input: File | string,
  options?: {
    manualMrzBox?: MrzBoxRegion
    onMrzReady?: (mrz: MrzParseResult, elapsedMs: number) => void
  }
): Promise<CompleteScanOutcome & { elapsedMs: number }> {
  const tStart = Date.now()
  let cleanUrl = ''
  let diagnostic: ImageDiagnostic | undefined

  if (typeof input === 'string') {
    cleanUrl = input
  } else {
    const read = await readFileAsCleanDataUrl(input, 1800, false)
    cleanUrl = read.dataUrl
    diagnostic = read.diagnostic
  }

  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine

  // 🚀 LANCEMENT IMMÉDIAT DE GEMINI EN PARALLÈLE DU PRÉCHARGEMENT VISAGE (ZÉRO ATTENTE !)
  const compactAiPromise = buildCompactFullImageForAi(cleanUrl)
  const faceModelWarmup = ensureFaceModelsLoaded().catch(() => null)

  let mrzResult: MrzParseResult | null = null
  let ocrError: string | undefined
  let rotatedDegrees: 0 | 90 | 180 | 270 = 0

  if (isOnline && !options?.manualMrzBox) {
    try {
      const compactImg = await compactAiPromise
      const srv = await postServerMrzOcr(compactImg, compactImg)
      mrzResult = srv
      rotatedDegrees = srv.rotationDegrees || 0
      if (mrzResult && (mrzResult.nom || mrzResult.numPasseport)) {
        options?.onMrzReady?.(mrzResult, Date.now() - tStart)
      }
    } catch (err) {
      ocrError = err instanceof Error ? err.message : String(err)
    }
  }

  // Redressement de l'image maître si Gemini a détecté une rotation (90°/180°/270°),
  // ou détection locale uniquement si hors-ligne et image verticale
  let uprightUrl = cleanUrl
  if (rotatedDegrees !== 0) {
    uprightUrl = await rotateImageDataUrl(cleanUrl, rotatedDegrees)
  } else if (!mrzResult && !options?.manualMrzBox) {
    const localOrient = await ensureUprightPassportOrientation(cleanUrl)
    uprightUrl = localOrient.dataUrl
    rotatedDegrees = localOrient.rotatedDegrees
  }

  await faceModelWarmup

  const mrzBoxPromise = options?.manualMrzBox
    ? Promise.resolve(options.manualMrzBox)
    : detectMrzRegionAuto(uprightUrl).then((r) => r.region)

  // Si hors-ligne ou si l'appel serveur initial a échoué, lecture de secours sur la bande MRZ
  const fallbackMrzPromise: Promise<MrzParseResult | null> = mrzResult
    ? Promise.resolve(mrzResult)
    : mrzBoxPromise.then(async (box) => {
        try {
          const fallbackRes = await readMrzHybrid(uprightUrl, box)
          options?.onMrzReady?.(fallbackRes, Date.now() - tStart)
          return fallbackRes
        } catch (err) {
          ocrError = err instanceof Error ? err.message : String(err)
          return null
        }
      })

  const [mrzBox, passportSettled, faceSettled, finalMrz] = await Promise.all([
    mrzBoxPromise,
    compressAndFormatPassportNusuk(uprightUrl).then(
      (v) => ({ ok: true as const, value: v }),
      () => ({ ok: false as const, value: null })
    ),
    autoDetectAndCropNusuk(uprightUrl).then(
      (v) => ({ ok: true as const, value: v }),
      () => ({ ok: false as const, value: null })
    ),
    fallbackMrzPromise,
  ])

  const passportFile = passportSettled.ok
    ? passportSettled.value.file
    : typeof input !== 'string'
    ? input
    : null

  const photoResult = faceSettled.ok ? faceSettled.value : null

  return {
    masterPassportDataUrl: uprightUrl,
    rotatedDegrees,
    diagnostic,
    mrzBox,
    passportFile,
    photoResult,
    mrzResult: finalMrz,
    ocrError: finalMrz ? undefined : ocrError,
    elapsedMs: Date.now() - tStart,
  }
}
