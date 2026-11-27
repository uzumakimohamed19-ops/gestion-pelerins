export const NUSUK_PHOTO_W = 480
export const NUSUK_PHOTO_H = 680
export const NUSUK_PHOTO_ASPECT = NUSUK_PHOTO_H / NUSUK_PHOTO_W
export const NUSUK_PHOTO_MAX_BYTES = 95 * 1024

export interface NusukPhotoQuality {
  width: number
  height: number
  sizeBytes: number
  sizeOk: boolean
  faceDetected: boolean
  landmarksAligned: boolean
  tiltCorrectedDeg: number
}

export interface AutoCropNusukResult {
  file: File
  dataUrl: string
  cropBox: { x: number; y: number; size: number }
  dims: { width: number; height: number }
  detected: boolean
  quality: NusukPhotoQuality
}

export interface ImageDiagnostic {
  width: number
  height: number
  sharpnessScore: number
  isBlurry: boolean
  glarePercent: number
  hasGlare: boolean
}

type FaceApiModule = typeof import('@vladmandic/face-api')

let faceApiRef: FaceApiModule | null = null
let modelsLoaded = false
let modelsLoadingPromise: Promise<FaceApiModule> | null = null

export async function ensureFaceModelsLoaded(): Promise<FaceApiModule> {
  if (modelsLoaded && faceApiRef) return faceApiRef
  if (!modelsLoadingPromise) {
    modelsLoadingPromise = (async () => {
      const mod = await import('@vladmandic/face-api')
      faceApiRef = mod
      await Promise.all([
        mod.nets.ssdMobilenetv1.loadFromUri('/models'),
        mod.nets.faceLandmark68Net.loadFromUri('/models'),
        mod.nets.tinyFaceDetector.loadFromUri('/models'),
      ])
      modelsLoaded = true
      return mod
    })().catch((err) => {
      modelsLoadingPromise = null
      throw err
    })
  }
  return modelsLoadingPromise
}

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Impossible de charger l'image sélectionnée."))
    img.src = src
  })
}

export function readFileAsCleanDataUrl(
  file: File,
  maxDimension = 1800,
  runQualityProbe = false
): Promise<{
  dataUrl: string
  diagnostic: ImageDiagnostic
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const rawUrl = reader.result as string
      try {
        const img = await loadHtmlImage(rawUrl)
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))

        if (scale >= 1 && !runQualityProbe) {
          resolve({
            dataUrl: rawUrl,
            diagnostic: {
              width: img.width,
              height: img.height,
              sharpnessScore: 100,
              isBlurry: false,
              glarePercent: 0,
              hasGlare: false,
            },
          })
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: runQualityProbe })
        if (!ctx) {
          resolve({
            dataUrl: rawUrl,
            diagnostic: {
              width: img.width,
              height: img.height,
              sharpnessScore: 100,
              isBlurry: false,
              glarePercent: 0,
              hasGlare: false,
            },
          })
          return
        }

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, w, h)

        const diagnostic = runQualityProbe
          ? analyzeCanvasQuality(ctx, w, h)
          : {
              width: w,
              height: h,
              sharpnessScore: 100,
              isBlurry: false,
              glarePercent: 0,
              hasGlare: false,
            }
        const outUrl = scale < 1 ? canvas.toDataURL('image/jpeg', 0.92) : rawUrl
        resolve({ dataUrl: outUrl, diagnostic })
      } catch {
        resolve({
          dataUrl: rawUrl,
          diagnostic: {
            width: 0,
            height: 0,
            sharpnessScore: 100,
            isBlurry: false,
            glarePercent: 0,
            hasGlare: false,
          },
        })
      }
    }
    reader.onerror = () => reject(new Error('Impossible de lire le fichier sélectionné.'))
    reader.readAsDataURL(file)
  })
}

/**
 * Mesure rapide de la netteté (variance du Laplacien) et des reflets (zones brûlées > 250)
 */
export function analyzeCanvasQuality(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): ImageDiagnostic {
  const sampleMax = 480
  const scale = Math.min(1, sampleMax / Math.max(width, height))
  const sw = Math.max(8, Math.round(width * scale))
  const sh = Math.max(8, Math.round(height * scale))

  let data: Uint8ClampedArray
  if (scale < 1) {
    const sc = document.createElement('canvas')
    sc.width = sw
    sc.height = sh
    const sctx = sc.getContext('2d', { willReadFrequently: true })
    if (!sctx) {
      return {
        width,
        height,
        sharpnessScore: 100,
        isBlurry: false,
        glarePercent: 0,
        hasGlare: false,
      }
    }
    sctx.drawImage(ctx.canvas, 0, 0, sw, sh)
    data = sctx.getImageData(0, 0, sw, sh).data
  } else {
    data = ctx.getImageData(0, 0, sw, sh).data
  }

  const gray = new Float32Array(sw * sh)
  let brightPixels = 0
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    gray[p] = 0.299 * r + 0.587 * g + 0.114 * b
    if (r > 250 && g > 250 && b > 250) brightPixels++
  }

  let sumLap = 0
  let sumLapSq = 0
  let count = 0
  for (let y = 1; y < sh - 1; y++) {
    const row = y * sw
    for (let x = 1; x < sw - 1; x++) {
      const idx = row + x
      const lap =
        4 * gray[idx] -
        gray[idx - 1] -
        gray[idx + 1] -
        gray[idx - sw] -
        gray[idx + sw]
      sumLap += lap
      sumLapSq += lap * lap
      count++
    }
  }

  const mean = count > 0 ? sumLap / count : 0
  const variance = count > 0 ? sumLapSq / count - mean * mean : 100
  const glarePercent = Number(((brightPixels / (sw * sh)) * 100).toFixed(1))

  return {
    width,
    height,
    sharpnessScore: Math.round(variance),
    isBlurry: variance < 55,
    glarePercent,
    hasGlare: glarePercent > 18,
  }
}

export async function rotateImageDataUrl(
  imageSrc: string,
  degrees: 90 | 180 | 270
): Promise<string> {
  const img = await loadHtmlImage(imageSrc)
  const canvas = document.createElement('canvas')
  if (degrees === 90 || degrees === 270) {
    canvas.width = img.height
    canvas.height = img.width
  } else {
    canvas.width = img.width
    canvas.height = img.height
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return imageSrc

  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  ctx.restore()

  return canvas.toDataURL('image/jpeg', 0.94)
}

function buildRotatedThumbnail(
  img: HTMLImageElement,
  degrees: 0 | 90 | 180 | 270,
  maxSide = 760
): HTMLCanvasElement {
  const baseW = degrees === 90 || degrees === 270 ? img.height : img.width
  const baseH = degrees === 90 || degrees === 270 ? img.width : img.height
  const scale = Math.min(1, maxSide / Math.max(baseW, baseH))
  const cw = Math.max(1, Math.round(baseW * scale))
  const ch = Math.max(1, Math.round(baseH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.save()
  ctx.translate(cw / 2, ch / 2)
  ctx.rotate((degrees * Math.PI) / 180)
  const drawW = degrees === 90 || degrees === 270 ? ch : cw
  const drawH = degrees === 90 || degrees === 270 ? cw : ch
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
  ctx.restore()
  return canvas
}

/**
 * Détecte automatiquement si la photo du passeport a été prise à l'envers (180°)
 * ou verticalement (90° / 270°) et la remet à l'endroit avant la découpe et l'OCR !
 */
export async function ensureUprightPassportOrientation(imageSrc: string): Promise<{
  dataUrl: string
  rotatedDegrees: 0 | 90 | 180 | 270
}> {
  try {
    const [faceapi, img] = await Promise.all([
      ensureFaceModelsLoaded(),
      loadHtmlImage(imageSrc),
    ])

    const thumb0 = buildRotatedThumbnail(img, 0, 860)
    const det0 = await faceapi.detectAllFaces(
      thumb0,
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.42, maxResults: 4 })
    )

    const best0Score = det0.reduce((m, d) => Math.max(m, d.score), 0)
    // Si un visage net est trouvé à 0° et que le passeport est déjà en paysage (ou portrait d'identité), aucune rotation nécessaire
    if (best0Score >= 0.52 && img.width >= img.height * 0.95) {
      return { dataUrl: imageSrc, rotatedDegrees: 0 }
    }
    if (best0Score >= 0.68) {
      return { dataUrl: imageSrc, rotatedDegrees: 0 }
    }

    // Tester 90°, 270° et 180° (ex: photo prise téléphone vertical)
    const candidateAngles: Array<90 | 270 | 180> =
      img.height > img.width ? [270, 90, 180] : [180, 270, 90]

    let bestAngle: 0 | 90 | 180 | 270 = 0
    let bestScore = best0Score

    for (const angle of candidateAngles) {
      const thumb = buildRotatedThumbnail(img, angle, 720)
      const dets = await faceapi.detectAllFaces(
        thumb,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.42 })
      )
      if (dets.length > 0) {
        // Confirmation précise avec SSD MobileNetV1 sur le candidat prometteur
        const ssdDets = await faceapi.detectAllFaces(
          thumb,
          new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45, maxResults: 3 })
        )
        const top = ssdDets.reduce((m, d) => Math.max(m, d.score), 0)
        if (top > bestScore + 0.1) {
          bestScore = top
          bestAngle = angle
          if (top >= 0.78) break
        }
      }
    }

    if (bestAngle !== 0) {
      const rotated = await rotateImageDataUrl(imageSrc, bestAngle)
      return { dataUrl: rotated, rotatedDegrees: bestAngle }
    }

    return { dataUrl: imageSrc, rotatedDegrees: 0 }
  } catch {
    return { dataUrl: imageSrc, rotatedDegrees: 0 }
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Impossible de créer la photo.'))),
      'image/jpeg',
      quality
    )
  })
}

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

/**
 * Accentuation douce (amount ~ 0.18) évitant les halos blancs et la trame moirée des passeports
 */
function sharpenCanvasGentle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount = 0.18
) {
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
        const diff =
          s[k] * 4 - (s[k - 4] + s[k + 4] + s[k - stride] + s[k + stride])
        // Seuil anti-bruit : n'accentue pas le grain plat de fond
        if (Math.abs(diff) > 10) {
          out[k] = s[k] * center - amount * (s[k - 4] + s[k + 4] + s[k - stride] + s[k + stride])
        }
      }
    }
  }
  imgData.data.set(out)
  ctx.putImageData(imgData, 0, 0)
}

export async function encodeNusukCanvasToFile(
  canvas: HTMLCanvasElement,
  prefix = 'photo_nusuk'
): Promise<{ file: File; dataUrl: string; sizeBytes: number }> {
  let quality = 0.94
  let blob = await canvasToJpegBlob(canvas, quality)
  while (blob.size > NUSUK_PHOTO_MAX_BYTES && quality > 0.48) {
    quality = Number((quality - 0.05).toFixed(2))
    blob = await canvasToJpegBlob(canvas, quality)
  }

  const file = new File([blob], `${prefix}_${Date.now()}.jpg`, { type: 'image/jpeg' })
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onloadend = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('Erreur encodage aperçu'))
    r.readAsDataURL(blob)
  })
  return { file, dataUrl, sizeBytes: blob.size }
}

export async function renderNusukPhoto(
  img: HTMLImageElement,
  cropX: number,
  cropY: number,
  size: number,
  options?: {
    leftCut?: number
    rightCut?: number
    topCut?: number
    bottomCut?: number
    deskewRad?: number
    pivotX?: number
    pivotY?: number
  }
): Promise<{ file: File; dataUrl: string; sizeBytes: number }> {
  const leftCut = options?.leftCut ?? -Infinity
  const rightCut = options?.rightCut ?? Infinity
  const topCut = options?.topCut ?? -Infinity
  const bottomCut = options?.bottomCut ?? Infinity
  const deskewRad = options?.deskewRad ?? 0

  let workingSource: HTMLImageElement | HTMLCanvasElement = img

  // Redressement horizontal de la ligne des yeux si légèrement penchée
  if (Math.abs(deskewRad) >= 0.012 && Math.abs(deskewRad) <= 0.32) {
    const px = options?.pivotX ?? cropX + size / 2
    const py = options?.pivotY ?? cropY + (size * NUSUK_PHOTO_ASPECT) / 2
    const rotCanvas = document.createElement('canvas')
    rotCanvas.width = img.width
    rotCanvas.height = img.height
    const rctx = rotCanvas.getContext('2d')
    if (rctx) {
      rctx.fillStyle = '#FFFFFF'
      rctx.fillRect(0, 0, rotCanvas.width, rotCanvas.height)
      rctx.save()
      rctx.translate(px, py)
      rctx.rotate(-deskewRad)
      rctx.drawImage(img, -px, -py)
      rctx.restore()
      workingSource = rotCanvas
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = NUSUK_PHOTO_W
  canvas.height = NUSUK_PHOTO_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Impossible de préparer la photo.')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, NUSUK_PHOTO_W, NUSUK_PHOTO_H)

  const cropH = size * NUSUK_PHOTO_ASPECT
  const ratio = NUSUK_PHOTO_W / size
  const srcLeft = Math.max(cropX, 0, leftCut)
  const srcRight = Math.min(cropX + size, img.width, rightCut)
  const srcTop = Math.max(cropY, 0, topCut)
  const srcBottom = Math.min(cropY + cropH, img.height, bottomCut)

  if (srcRight > srcLeft && srcBottom > srcTop) {
    const srcW = Math.max(1, Math.round(srcRight - srcLeft))
    const srcH = Math.max(1, Math.round(srcBottom - srcTop))

    const region = document.createElement('canvas')
    region.width = srcW
    region.height = srcH
    const rctx = region.getContext('2d')
    if (!rctx) throw new Error('Impossible de recadrer la photo.')
    rctx.drawImage(
      workingSource,
      Math.round(srcLeft),
      Math.round(srcTop),
      srcW,
      srcH,
      0,
      0,
      srcW,
      srcH
    )

    const dw = Math.max(1, Math.round(srcW * ratio))
    const dh = Math.max(1, Math.round(srcH * ratio))
    const dx = Math.round((srcLeft - cropX) * ratio)
    const dy = Math.round((srcTop - cropY) * ratio)

    const resized = resizeHighQuality(region, dw, dh)
    ctx.drawImage(resized, dx, dy)
  }

  sharpenCanvasGentle(ctx, NUSUK_PHOTO_W, NUSUK_PHOTO_H, 0.18)

  return encodeNusukCanvasToFile(canvas, 'photo_nusuk')
}

export async function formatNusukSquare(
  imageSrc: string
): Promise<{ file: File; dataUrl: string }> {
  const img = await loadHtmlImage(imageSrc)
  const cropW = Math.min(img.width, img.height / NUSUK_PHOTO_ASPECT)
  const cropH = cropW * NUSUK_PHOTO_ASPECT
  const x = (img.width - cropW) / 2
  const y = (img.height - cropH) / 2
  const res = await renderNusukPhoto(img, x, y, cropW)
  return { file: res.file, dataUrl: res.dataUrl }
}

function meanPoint(pts: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (!pts.length) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  for (const p of pts) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / pts.length, y: sy / pts.length }
}

/**
 * Moteur biométrique haute précision :
 * - Détection SSD MobileNetV1 + filtrage anti-photo fantôme (hologramme droite)
 * - Extraction des 68 points du visage (yeux, nez, menton, mâchoire)
 * - Redressement automatique de l'inclinaison de la ligne des yeux
 * - Cadrage ICAO / Nusuk 480x680 respectant hijabs, foulards, turbans et barbes
 */
export async function autoDetectAndCropNusuk(
  imageSrc: string
): Promise<AutoCropNusukResult> {
  const img = await loadHtmlImage(imageSrc)
  const dims = { width: img.width, height: img.height }
  const isPassportPage = dims.width > dims.height * 1.12

  let cropX = 0
  let cropY = 0
  let size = 200
  let faceFound = false
  let landmarksAligned = false
  let tiltCorrectedDeg = 0

  let leftCut = -Infinity
  let rightCut = Infinity
  let topCut = -Infinity
  let bottomCut = Infinity
  let deskewRad = 0
  let pivotX = dims.width / 2
  let pivotY = dims.height / 2

  try {
    const faceapi = await ensureFaceModelsLoaded()

    // Passe unique ultra-rapide (960px max) : détecte visages + 68 landmarks simultanément (3x plus rapide !)
    const maxSide = 960
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

    const fullDetections = await faceapi
      .detectAllFaces(
        detectInput,
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.32, maxResults: 6 })
      )
      .withFaceLandmarks()

    // Pondération biométrique : favorise la vraie photo 35x45 mm (gauche du passeport) et écarte l'image fantôme à droite
    const bestEntry = fullDetections.length
      ? fullDetections.reduce((best, cur) => {
          const scoreCandidate = (entry: (typeof fullDetections)[number]) => {
            const d = entry.detection
            const area = d.box.width * d.box.height
            const cxNorm = (d.box.x + d.box.width / 2) / (detectInput.width || 1)
            const cyNorm = (d.box.y + d.box.height / 2) / (detectInput.height || 1)
            let layoutBonus = 1.0
            if (isPassportPage) {
              if (cxNorm >= 0.03 && cxNorm <= 0.43 && cyNorm >= 0.14 && cyNorm <= 0.80) {
                layoutBonus = 1.75
              } else if (cxNorm > 0.54) {
                layoutBonus = 0.28
              }
            }
            return area * Math.pow(d.score, 0.7) * layoutBonus
          }
          return scoreCandidate(cur) > scoreCandidate(best) ? cur : best
        })
      : null

    if (bestEntry) {
      const bestDet = bestEntry.detection
      const faceX = bestDet.box.x * inv
      const faceY = bestDet.box.y * inv
      const faceW = bestDet.box.width * inv
      const faceH = bestDet.box.height * inv

      let eyeCx = faceX + faceW / 2
      let eyeCy = faceY + faceH * 0.38
      let eyeToChin = faceH * 0.56
      let jawWidth = faceW

      if (bestEntry.landmarks) {
        const pts = bestEntry.landmarks.positions.map((p) => ({
          x: p.x * inv,
          y: p.y * inv,
        }))
        const leftEye = meanPoint(pts.slice(36, 42))
        const rightEye = meanPoint(pts.slice(42, 48))
        const chin = pts[8]
        const jawL = pts[0]
        const jawR = pts[16]

        const interEyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y)
        if (interEyeDist > 8) {
          eyeCx = (leftEye.x + rightEye.x) / 2
          eyeCy = (leftEye.y + rightEye.y) / 2
          pivotX = eyeCx
          pivotY = eyeCy

          const rawAngle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)
          const deg = (rawAngle * 180) / Math.PI
          if (Math.abs(deg) >= 0.8 && Math.abs(deg) <= 16) {
            deskewRad = rawAngle
            tiltCorrectedDeg = Number(deg.toFixed(1))
          }

          const measuredEyeToChin = Math.hypot(chin.x - eyeCx, chin.y - eyeCy)
          if (measuredEyeToChin > interEyeDist * 0.7) {
            eyeToChin = measuredEyeToChin
          }
          const measuredJaw = Math.hypot(jawR.x - jawL.x, jawR.y - jawL.y)
          if (measuredJaw > interEyeDist * 1.2) {
            jawWidth = measuredJaw
          }
          landmarksAligned = true
        }
      }

      // Fenêtre latérale : protège contre l'apparition des textes "Nom / Prénom" à droite de la photo sur le passeport
      if (isPassportPage) {
        const halfWindow = Math.max(jawWidth * 1.06, faceW * 1.02)
        leftCut = Math.max(0, eyeCx - halfWindow)
        rightCut = Math.min(dims.width, eyeCx + halfWindow)
        // Bloque la bande MRZ en bas du passeport
        bottomCut = Math.min(dims.height * 0.77, eyeCy + eyeToChin * 2.15)
        // Bloque l'en-tête "RÉPUBLIQUE / PASSPORT" tout en laissant toute la place au hijab/foulard/bonnet !
        topCut = Math.max(dims.height * 0.095, eyeCy - Math.max(eyeToChin * 1.45, faceH * 0.82))
      }

      const windowW = isPassportPage ? rightCut - leftCut : dims.width

      // Proportions biométriques officielles ICAO / Nusuk (480x680) :
      // Hauteur anatomique tête complète ≈ 2.25 * eyeToChin ; cadre idéal ≈ 3.18 * eyeToChin (tête + cou/haut épaules)
      let idealFrameH = Math.max(faceH / 0.74, eyeToChin * 3.18)

      if (isPassportPage) {
        const layoutPhotoW = dims.width * 0.248
        const faceVsLayout = faceW / layoutPhotoW
        if (faceVsLayout >= 0.34 && faceVsLayout <= 0.88) {
          const layoutPhotoH = layoutPhotoW * (45 / 35)
          idealFrameH = Math.max(faceH / 0.78, Math.min(layoutPhotoH * 1.04, idealFrameH))
        }
      }

      size = Math.round(
        Math.min(
          idealFrameH / NUSUK_PHOTO_ASPECT,
          windowW,
          dims.width,
          dims.height / NUSUK_PHOTO_ASPECT
        )
      )

      const actualFrameH = size * NUSUK_PHOTO_ASPECT

      // Ligne des yeux placée à ~43.5 % du haut du portrait (standard biométrique international + marge coiffe/hijab)
      cropX = Math.round(eyeCx - size / 2)
      cropX = Math.max(0, Math.min(dims.width - size, cropX))

      const targetY = landmarksAligned
        ? eyeCy - actualFrameH * 0.435
        : faceY - faceH * 0.2
      cropY = Math.round(Math.max(0, Math.min(dims.height - actualFrameH, targetY)))

      faceFound = true
    }
  } catch (err) {
    console.warn('[NusukFace] Détection IA non disponible, cadrage géométrique de secours :', err)
  }

  if (!faceFound) {
    if (dims.width > dims.height) {
      size = Math.round(Math.min((dims.height * 0.58) / NUSUK_PHOTO_ASPECT, dims.width * 0.24))
      cropX = Math.round(dims.width * 0.05)
      cropY = Math.round(dims.height * 0.18)
    } else {
      size = Math.round(Math.min(dims.width * 0.85, (dims.height * 0.85) / NUSUK_PHOTO_ASPECT))
      cropX = Math.round((dims.width - size) / 2)
      cropY = Math.round(Math.max(0, (dims.height - size * NUSUK_PHOTO_ASPECT) / 2))
    }
  }

  const safeX = Math.round(Math.max(0, Math.min(dims.width - size, cropX)))
  const safeY = Math.round(
    Math.max(0, Math.min(dims.height - size * NUSUK_PHOTO_ASPECT, cropY))
  )

  const rendered = await renderNusukPhoto(img, safeX, safeY, size, {
    leftCut,
    rightCut,
    topCut,
    bottomCut,
    deskewRad,
    pivotX,
    pivotY,
  })

  return {
    file: rendered.file,
    dataUrl: rendered.dataUrl,
    cropBox: { x: safeX, y: safeY, size },
    dims,
    detected: faceFound,
    quality: {
      width: NUSUK_PHOTO_W,
      height: NUSUK_PHOTO_H,
      sizeBytes: rendered.sizeBytes,
      sizeOk: rendered.sizeBytes <= 100 * 1024,
      faceDetected: faceFound,
      landmarksAligned,
      tiltCorrectedDeg,
    },
  }
}

/**
 * Option 1-clic "Fond blanc pur (Nusuk)" : supprime les motifs/filigranes du passeport
 * derrière le pèlerin et pose le portrait sur un fond #FFFFFF pur 480x680 < 95 Ko.
 */
export async function applyPureWhiteBackgroundNusuk(
  nusukDataUrl: string
): Promise<{ file: File; dataUrl: string; sizeBytes: number }> {
  const { removeBackground } = await import('@imgly/background-removal')
  const fgBlob = await removeBackground(nusukDataUrl, {
    output: { format: 'image/png', quality: 0.95 },
  })
  const fgUrl = URL.createObjectURL(fgBlob)
  try {
    const fgImg = await loadHtmlImage(fgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = NUSUK_PHOTO_W
    canvas.height = NUSUK_PHOTO_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Impossible de composer le fond blanc.')

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, NUSUK_PHOTO_W, NUSUK_PHOTO_H)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(fgImg, 0, 0, NUSUK_PHOTO_W, NUSUK_PHOTO_H)

    return await encodeNusukCanvasToFile(canvas, 'photo_nusuk_blanc')
  } finally {
    URL.revokeObjectURL(fgUrl)
  }
}

/**
 * Compression fidèle de la copie complète du passeport (< 390 Ko garanti pour Nusuk)
 * sans altération des couleurs.
 */
export function compressAndFormatPassportNusuk(
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

      let targetW = Math.max(1, Math.round(sw))
      let targetH = Math.max(1, Math.round(sh))

      if (targetW > 1800) {
        const sc = 1800 / targetW
        targetW = 1800
        targetH = Math.round(targetH * sc)
      }

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error("Impossible de préparer l'image du passeport."))

      const renderToCanvas = (w: number, h: number) => {
        canvas.width = w
        canvas.height = h
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, w, h)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
      }

      renderToCanvas(targetW, targetH)

      const generateBlob = (q: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Impossible de compresser l'image du passeport."))
            if (blob.size > 390 * 1024) {
              if (q > 0.48) {
                generateBlob(Number((q - 0.08).toFixed(2)))
                return
              }
              if (targetW > 1150) {
                targetW = Math.round(targetW * 0.85)
                targetH = Math.round(targetH * 0.85)
                renderToCanvas(targetW, targetH)
                generateBlob(0.76)
                return
              }
            }
            const file = new File([blob], `passport_nusuk_${Date.now()}.jpg`, {
              type: 'image/jpeg',
            })
            const reader = new FileReader()
            reader.onloadend = () => {
              resolve({ file, dataUrl: reader.result as string })
            }
            reader.readAsDataURL(blob)
          },
          'image/jpeg',
          q
        )
      }

      generateBlob(0.86)
    }
    img.onerror = () => reject(new Error("Impossible de charger l'image du passeport."))
    img.src = imageSrc
  })
}
