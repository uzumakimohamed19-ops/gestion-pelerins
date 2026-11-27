/* eslint-disable @next/next/no-img-element */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  Flashlight,
  Image as ImageIcon,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react'
import { analyzeCanvasQuality } from '@/lib/passportFaceNusuk'

interface PassportCameraModalProps {
  open: boolean
  onClose: () => void
  onCaptureDataUrl: (dataUrl: string) => void
  onPickGalleryFile: (file: File) => void
}

export function PassportCameraModal({
  open,
  onClose,
  onCaptureDataUrl,
  onPickGalleryFile,
}: PassportCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [qualityStatus, setQualityStatus] = useState<'sharp' | 'glare' | 'blurry'>('blurry')

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setVideoReady(false)
    setTorchOn(false)
    setTorchSupported(false)
  }, [])

  const startCamera = useCallback(
    async (mode: 'environment' | 'user') => {
      stopCamera()
      setCameraError(null)

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "L'accès direct à la caméra n'est pas disponible sur cet appareil. Utilisez le bouton Galerie ci-dessous."
        )
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
          },
        })
        streamRef.current = stream

        const track = stream.getVideoTracks()[0]
        if (track) {
          try {
            const caps = track.getCapabilities?.() as Record<string, unknown> | undefined
            if (caps && 'torch' in caps && Boolean(caps.torch)) {
              setTorchSupported(true)
            }
            if (caps && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
              })
            }
          } catch {
            // Focus continu optionnel selon navigateur
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
          setVideoReady(true)
        }
      } catch {
        setCameraError(
          "Autorisez l'accès à la caméra ou choisissez directement une photo depuis votre galerie."
        )
      }
    },
    [stopCamera]
  )

  useEffect(() => {
    if (!open) {
      stopCamera()
      return
    }
    startCamera(facingMode)
    return () => stopCamera()
  }, [open, facingMode, startCamera, stopCamera])

  // Analyse en temps réel de la netteté et des reflets toutes les 450 ms
  useEffect(() => {
    if (!open || !videoReady) return
    const probeCanvas = document.createElement('canvas')
    probeCanvas.width = 360
    probeCanvas.height = 254

    const timer = setInterval(() => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || !video.videoWidth) return
      const ctx = probeCanvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      const vw = video.videoWidth
      const vh = video.videoHeight
      const cropW = vw * 0.84
      const cropH = Math.min(vh * 0.84, cropW / 1.42)
      const sx = (vw - cropW) / 2
      const sy = (vh - cropH) / 2

      ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, probeCanvas.width, probeCanvas.height)
      const diag = analyzeCanvasQuality(ctx, probeCanvas.width, probeCanvas.height)

      if (diag.hasGlare) setQualityStatus('glare')
      else if (diag.sharpnessScore >= 62) setQualityStatus('sharp')
      else setQualityStatus('blurry')
    }, 450)

    return () => clearInterval(timer)
  }, [open, videoReady])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !torchOn
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      setTorchOn(next)
    } catch {
      setTorchSupported(false)
    }
  }

  const handleCapture = () => {
    const video = videoRef.current
    const guide = guideRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return

    const vw = video.videoWidth
    const vh = video.videoHeight
    const videoRect = video.getBoundingClientRect()
    const guideRect = guide?.getBoundingClientRect()

    let sx = 0
    let sy = 0
    let sw = vw
    let sh = vh

    // Calcul précis de la zone cadrée avec `object-cover` + 4 % de marge de sécurité
    if (guideRect && videoRect.width > 0 && videoRect.height > 0) {
      const videoAspect = vw / vh
      const elemAspect = videoRect.width / videoRect.height
      let renderedW = videoRect.width
      let renderedH = videoRect.height
      let offsetX = 0
      let offsetY = 0

      if (videoAspect > elemAspect) {
        renderedH = videoRect.height
        renderedW = renderedH * videoAspect
        offsetX = (renderedW - videoRect.width) / 2
      } else {
        renderedW = videoRect.width
        renderedH = renderedW / videoAspect
        offsetY = (renderedH - videoRect.height) / 2
      }

      const scale = vw / renderedW
      const relLeft = guideRect.left - videoRect.left + offsetX
      const relTop = guideRect.top - videoRect.top + offsetY
      const rawW = guideRect.width * scale
      const rawH = guideRect.height * scale

      const marginX = rawW * 0.045
      const marginY = rawH * 0.055

      sx = Math.max(0, Math.round(relLeft * scale - marginX))
      sy = Math.max(0, Math.round(relTop * scale - marginY))
      sw = Math.min(vw - sx, Math.round(rawW + marginX * 2))
      sh = Math.min(vh - sy, Math.round(rawH + marginY * 2))
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, sw)
    canvas.height = Math.max(1, sh)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.94)
    stopCamera()
    onCaptureDataUrl(dataUrl)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col select-none">
      {/* Barre haute */}
      <div className="shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-black/75 backdrop-blur-md flex items-center justify-between gap-2 z-20">
        <button
          type="button"
          onClick={() => {
            stopCamera()
            onClose()
          }}
          className="w-10 h-10 rounded-full bg-white/15 active:bg-white/25 flex items-center justify-center cursor-pointer"
          aria-label="Fermer la caméra"
        >
          <X size={20} />
        </button>

        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-wider">Scanner Passeport</p>
          <p className="text-[10px] text-slate-300 font-medium">
            Alignez la page photo dans le cadre
          </p>
        </div>

        <div className="flex items-center gap-2">
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer ${
                torchOn ? 'bg-amber-400 text-slate-950' : 'bg-white/15 text-white'
              }`}
              aria-label="Torche"
            >
              <Flashlight size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
            }
            className="w-10 h-10 rounded-full bg-white/15 active:bg-white/25 flex items-center justify-center cursor-pointer"
            aria-label="Changer de caméra"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Zone vidéo + Gabarit ICAO 125x88mm */}
      <div className="relative flex-1 overflow-hidden flex items-center justify-center bg-slate-950 px-4">
        {!cameraError ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Assombrissement extérieur */}
            <div className="relative z-10 w-full max-w-lg flex flex-col items-center gap-3">
              {/* Indicateur de qualité en direct */}
              <div
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-black flex items-center gap-1.5 shadow-lg backdrop-blur-md border transition-colors ${
                  qualityStatus === 'sharp'
                    ? 'bg-emerald-500/90 text-white border-emerald-300/60'
                    : qualityStatus === 'glare'
                    ? 'bg-amber-500/90 text-slate-950 border-amber-200'
                    : 'bg-slate-900/80 text-slate-100 border-white/20'
                }`}
              >
                {qualityStatus === 'sharp' ? (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Netteté optimale • Prêt</span>
                  </>
                ) : qualityStatus === 'glare' ? (
                  <>
                    <TriangleAlert size={14} />
                    <span>Inclinez légèrement pour éviter le reflet</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} className="text-blue-300" />
                    <span>Stabilisez sur la page du passeport…</span>
                  </>
                )}
              </div>

              {/* Cadre Passeport */}
              <div
                ref={guideRef}
                style={{ aspectRatio: '1.42 / 1' }}
                className={`w-full rounded-2xl relative shadow-[0_0_0_9999px_rgba(2,6,23,0.66)] border-2 transition-colors ${
                  qualityStatus === 'sharp'
                    ? 'border-emerald-400'
                    : qualityStatus === 'glare'
                    ? 'border-amber-400'
                    : 'border-white/80'
                }`}
              >
                {/* Coins renforcés */}
                <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl pointer-events-none" />
                <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl pointer-events-none" />
                <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl pointer-events-none" />
                <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl pointer-events-none" />

                {/* Repère Photo à gauche */}
                <div className="absolute left-[5%] top-[16%] w-[25%] h-[53%] rounded-lg border border-dashed border-white/65 bg-white/5 flex flex-col items-center justify-center pointer-events-none">
                  <UserRound size={22} className="text-white/70" />
                  <span className="text-[8px] font-black uppercase tracking-wider text-white/75 mt-1">
                    Photo
                  </span>
                </div>

                {/* Repère Bande MRZ en bas */}
                <div className="absolute inset-x-[3%] bottom-[4%] h-[22%] rounded-lg border border-amber-300/80 bg-amber-400/10 flex flex-col justify-center px-2.5 pointer-events-none">
                  <p className="font-mono text-[9px] sm:text-[10px] tracking-[0.18em] text-amber-200/90 truncate leading-tight">
                    P&lt;MLIDIALLO&lt;&lt;MOHAMED&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;
                  </p>
                  <p className="font-mono text-[9px] sm:text-[10px] tracking-[0.18em] text-amber-200/90 truncate leading-tight mt-0.5">
                    AA0000000&lt;MLI8001018M3201014&lt;&lt;&lt;
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-slate-300 text-center font-medium px-2">
                La photo 480×680 et les informations MRZ seront extraites en 1 seule prise.
              </p>
            </div>
          </>
        ) : (
          <div className="max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center mx-auto">
              <Camera size={24} />
            </div>
            <p className="text-sm font-bold text-white leading-relaxed">{cameraError}</p>
            <label className="w-full h-12 rounded-2xl bg-blue-600 active:bg-blue-700 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer">
              <ImageIcon size={16} />
              <span>Choisir une photo dans la galerie</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) {
                    stopCamera()
                    onPickGalleryFile(f)
                  }
                }}
              />
            </label>
          </div>
        )}
      </div>

      {/* Barre basse de déclenchement */}
      <div className="shrink-0 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-black/85 backdrop-blur-md flex items-center justify-between gap-4 z-20">
        <label className="flex flex-col items-center gap-1 text-slate-200 active:scale-95 transition cursor-pointer min-w-[68px]">
          <div className="w-12 h-12 rounded-2xl bg-white/12 border border-white/15 flex items-center justify-center">
            <ImageIcon size={20} />
          </div>
          <span className="text-[10px] font-bold">Galerie</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) {
                stopCamera()
                onPickGalleryFile(f)
              }
            }}
          />
        </label>

        <button
          type="button"
          disabled={!videoReady}
          onClick={handleCapture}
          aria-label="Prendre la photo du passeport"
          className="w-20 h-20 rounded-full border-4 border-white p-1.5 flex items-center justify-center active:scale-90 transition disabled:opacity-40 cursor-pointer"
        >
          <div
            className={`w-full h-full rounded-full transition-colors ${
              qualityStatus === 'sharp' ? 'bg-emerald-400' : 'bg-white'
            }`}
          />
        </button>

        <div className="min-w-[68px] text-center">
          <span className="text-[10px] font-bold text-slate-400 block">Auto-Nusuk</span>
          <span className="text-[10px] font-black text-emerald-400">480×680</span>
        </div>
      </div>
    </div>
  )
}
