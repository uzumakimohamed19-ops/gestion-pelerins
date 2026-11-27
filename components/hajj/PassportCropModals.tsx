/* eslint-disable @next/next/no-img-element */
'use client'

import { useRef } from 'react'
import {
  Check,
  Crop,
  FileCheck,
  Move,
  RotateCcw,
  RotateCw,
  ScanLine,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { NUSUK_PHOTO_ASPECT } from '@/lib/passportFaceNusuk'

// ── 1. MODALE RECADRAGE PHOTO D'IDENTITÉ NUSUK (480×680) AVEC GABARIT BIOMÉTRIQUE ──
interface NusukPhotoCropModalProps {
  open: boolean
  imageSrc: string | null
  cropBox: { x: number; y: number; size: number }
  imgDims: { width: number; height: number }
  onChangeCropBox: (next: { x: number; y: number; size: number }) => void
  onRotate90: (degrees: 90 | 270) => void
  onCancel: () => void
  onConfirm: () => void
}

type CornerKey = 'nw' | 'ne' | 'sw' | 'se'

export function NusukPhotoCropModal({
  open,
  imageSrc,
  cropBox,
  imgDims,
  onChangeCropBox,
  onRotate90,
  onCancel,
  onConfirm,
}: NusukPhotoCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const dragStateRef = useRef<{
    mode: 'move' | CornerKey | null
    startX: number
    startY: number
    boxX: number
    boxY: number
    boxSize: number
  }>({ mode: null, startX: 0, startY: 0, boxX: 0, boxY: 0, boxSize: 200 })

  if (!open || !imageSrc) return null

  const startGesture = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: 'move' | CornerKey
  ) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStateRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      boxX: cropBox.x,
      boxY: cropBox.y,
      boxSize: cropBox.size,
    }
  }

  const moveGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current
    if (!st.mode || !imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const scaleX = imgDims.width / rect.width
    const scaleY = imgDims.height / rect.height
    const dx = (e.clientX - st.startX) * scaleX
    const dy = (e.clientY - st.startY) * scaleY
    const minSize = Math.max(60, Math.min(imgDims.width, imgDims.height) * 0.08)

    if (st.mode === 'move') {
      const nextX = Math.max(0, Math.min(imgDims.width - st.boxSize, st.boxX + dx))
      const nextY = Math.max(
        0,
        Math.min(imgDims.height - st.boxSize * NUSUK_PHOTO_ASPECT, st.boxY + dy)
      )
      onChangeCropBox({ x: nextX, y: nextY, size: st.boxSize })
      return
    }

    let nextSize = st.boxSize
    let nextX = st.boxX
    let nextY = st.boxY

    if (st.mode === 'se') {
      nextSize = Math.max(
        minSize,
        Math.min(
          imgDims.width - st.boxX,
          (imgDims.height - st.boxY) / NUSUK_PHOTO_ASPECT,
          st.boxSize + dx
        )
      )
    } else if (st.mode === 'sw') {
      const maxGrowLeft = st.boxX
      const maxGrowBottom = (imgDims.height - st.boxY) / NUSUK_PHOTO_ASPECT - st.boxSize
      const delta = Math.max(
        minSize - st.boxSize,
        Math.min(maxGrowLeft, maxGrowBottom, -dx)
      )
      nextSize = st.boxSize + delta
      nextX = st.boxX - delta
    } else if (st.mode === 'ne') {
      const maxGrowRight = imgDims.width - (st.boxX + st.boxSize)
      const maxGrowTop = st.boxY / NUSUK_PHOTO_ASPECT
      const delta = Math.max(
        minSize - st.boxSize,
        Math.min(maxGrowRight, maxGrowTop, dx)
      )
      nextSize = st.boxSize + delta
      nextY = st.boxY - delta * NUSUK_PHOTO_ASPECT
    } else if (st.mode === 'nw') {
      const maxGrowLeft = st.boxX
      const maxGrowTop = st.boxY / NUSUK_PHOTO_ASPECT
      const delta = Math.max(
        minSize - st.boxSize,
        Math.min(maxGrowLeft, maxGrowTop, -dx)
      )
      nextSize = st.boxSize + delta
      nextX = st.boxX - delta
      nextY = st.boxY - delta * NUSUK_PHOTO_ASPECT
    }

    onChangeCropBox({ x: nextX, y: nextY, size: nextSize })
  }

  const endGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.mode) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
    }
    dragStateRef.current.mode = null
  }

  const adjustZoom = (factor: number) => {
    const cx = cropBox.x + cropBox.size / 2
    const cy = cropBox.y + (cropBox.size * NUSUK_PHOTO_ASPECT) / 2
    const maxS = Math.min(imgDims.width, imgDims.height / NUSUK_PHOTO_ASPECT)
    const minS = Math.max(60, maxS * 0.1)
    const nextSize = Math.max(minS, Math.min(maxS, cropBox.size * factor))
    const nextX = Math.max(0, Math.min(imgDims.width - nextSize, cx - nextSize / 2))
    const nextY = Math.max(
      0,
      Math.min(
        imgDims.height - nextSize * NUSUK_PHOTO_ASPECT,
        cy - (nextSize * NUSUK_PHOTO_ASPECT) / 2
      )
    )
    onChangeCropBox({ x: nextX, y: nextY, size: nextSize })
  }

  const pctX = (cropBox.x / Math.max(1, imgDims.width)) * 100
  const pctY = (cropBox.y / Math.max(1, imgDims.height)) * 100
  const pctW = (cropBox.size / Math.max(1, imgDims.width)) * 100
  const pctH = ((cropBox.size * NUSUK_PHOTO_ASPECT) / Math.max(1, imgDims.height)) * 100

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Crop size={18} className="text-emerald-400 shrink-0" />
            <h3 className="font-black text-xs sm:text-sm uppercase truncate">
              Cadrage Photo Nusuk (480×680)
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onRotate90(270)}
              title="Pivoter à gauche"
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              onClick={() => onRotate90(90)}
              title="Pivoter à droite"
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
            >
              <RotateCw size={15} />
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between gap-2 shrink-0">
          <p className="text-[11px] text-emerald-900 font-semibold leading-snug">
            Placez les yeux sur la <strong>ligne pointillée</strong> et la tête dans l&apos;ovale.
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => adjustZoom(0.88)}
              title="Zoomer sur le visage"
              className="w-8 h-8 rounded-lg bg-white border border-emerald-200 text-emerald-800 flex items-center justify-center active:scale-95 cursor-pointer"
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              onClick={() => adjustZoom(1.14)}
              title="Élargir le cadre"
              className="w-8 h-8 rounded-lg bg-white border border-emerald-200 text-emerald-800 flex items-center justify-center active:scale-95 cursor-pointer"
            >
              <ZoomOut size={15} />
            </button>
          </div>
        </div>

        {/* Zone d'image */}
        <div className="p-3 sm:p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-950 select-none">
          <div className="relative inline-block max-w-full max-h-[58vh] touch-none">
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Source photo"
              className="max-h-[58vh] w-auto max-w-full object-contain pointer-events-none block"
            />

            <div
              onPointerDown={(e) => startGesture(e, 'move')}
              onPointerMove={moveGesture}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              style={{
                left: `${pctX}%`,
                top: `${pctY}%`,
                width: `${pctW}%`,
                height: `${pctH}%`,
              }}
              className="absolute border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.58)] cursor-move rounded-lg touch-none"
            >
              {/* Gabarit biométrique ovale + ligne des yeux à 43.5% */}
              <svg
                viewBox="0 0 100 142"
                className="absolute inset-0 w-full h-full pointer-events-none opacity-65"
              >
                <ellipse
                  cx="50"
                  cy="62"
                  rx="31"
                  ry="42"
                  fill="none"
                  stroke="#6ee7b7"
                  strokeWidth="1.4"
                  strokeDasharray="4 3"
                />
                <line
                  x1="14"
                  y1="61.5"
                  x2="86"
                  y2="61.5"
                  stroke="#fde047"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
                <path
                  d="M16 138 Q22 110 50 110 Q78 110 84 138"
                  fill="none"
                  stroke="#6ee7b7"
                  strokeWidth="1.3"
                  strokeDasharray="4 3"
                />
              </svg>

              {/* 4 poignées tactiles larges (44x44 zone de touch) */}
              {(
                [
                  ['nw', '-top-5 -left-5 cursor-nwse-resize'],
                  ['ne', '-top-5 -right-5 cursor-nesw-resize'],
                  ['sw', '-bottom-5 -left-5 cursor-nesw-resize'],
                  ['se', '-bottom-5 -right-5 cursor-nwse-resize'],
                ] as const
              ).map(([corner, posCls]) => (
                <div
                  key={corner}
                  onPointerDown={(e) => startGesture(e, corner)}
                  onPointerMove={moveGesture}
                  onPointerUp={endGesture}
                  onPointerCancel={endGesture}
                  className={`absolute ${posCls} w-10 h-10 flex items-center justify-center touch-none`}
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-500 border-2 border-white shadow-md" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition shadow-sm cursor-pointer"
          >
            <Check size={16} />
            <span>Valider la photo 480×680</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 2. MODALE RECTANGLE LIBRE (PASSEPORT COMPLET OU BANDE MRZ MANUELLE) ──
interface FreeRectCropModalProps {
  open: boolean
  mode: 'passport' | 'mrz'
  imageSrc: string | null
  rectBox: { x: number; y: number; width: number; height: number }
  imgDims: { width: number; height: number }
  onChangeRectBox: (next: { x: number; y: number; width: number; height: number }) => void
  onRotate90: (degrees: 90 | 270) => void
  onCancel: () => void
  onConfirm: () => void
}

export function FreeRectCropModal({
  open,
  mode,
  imageSrc,
  rectBox,
  imgDims,
  onChangeRectBox,
  onRotate90,
  onCancel,
  onConfirm,
}: FreeRectCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{
    kind: 'move' | CornerKey | null
    startX: number
    startY: number
    x: number
    y: number
    w: number
    h: number
  }>({ kind: null, startX: 0, startY: 0, x: 0, y: 0, w: 100, h: 50 })

  if (!open || !imageSrc) return null

  const isMrz = mode === 'mrz'
  const minW = isMrz ? 120 : 160
  const minH = isMrz ? 32 : 110

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, kind: 'move' | CornerKey) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      x: rectBox.x,
      y: rectBox.y,
      w: rectBox.width,
      h: rectBox.height,
    }
  }

  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current
    if (!st.kind || !imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const scaleX = imgDims.width / rect.width
    const scaleY = imgDims.height / rect.height
    const dx = (e.clientX - st.startX) * scaleX
    const dy = (e.clientY - st.startY) * scaleY

    if (st.kind === 'move') {
      const nx = Math.max(0, Math.min(imgDims.width - st.w, st.x + dx))
      const ny = Math.max(0, Math.min(imgDims.height - st.h, st.y + dy))
      onChangeRectBox({ x: nx, y: ny, width: st.w, height: st.h })
      return
    }

    let left = st.x
    let top = st.y
    let right = st.x + st.w
    let bottom = st.y + st.h

    if (st.kind === 'nw' || st.kind === 'sw') {
      left = Math.max(0, Math.min(right - minW, st.x + dx))
    }
    if (st.kind === 'ne' || st.kind === 'se') {
      right = Math.min(imgDims.width, Math.max(left + minW, st.x + st.w + dx))
    }
    if (st.kind === 'nw' || st.kind === 'ne') {
      top = Math.max(0, Math.min(bottom - minH, st.y + dy))
    }
    if (st.kind === 'sw' || st.kind === 'se') {
      bottom = Math.min(imgDims.height, Math.max(top + minH, st.y + st.h + dy))
    }

    onChangeRectBox({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    })
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.kind) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
    }
    dragRef.current.kind = null
  }

  const pctX = (rectBox.x / Math.max(1, imgDims.width)) * 100
  const pctY = (rectBox.y / Math.max(1, imgDims.height)) * 100
  const pctW = (rectBox.width / Math.max(1, imgDims.width)) * 100
  const pctH = (rectBox.height / Math.max(1, imgDims.height)) * 100

  const borderCls = isMrz ? 'border-amber-400' : 'border-blue-400'
  const handleDotCls = isMrz ? 'bg-amber-500' : 'bg-blue-600'

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isMrz ? (
              <ScanLine size={18} className="text-amber-400 shrink-0" />
            ) : (
              <FileCheck size={18} className="text-blue-400 shrink-0" />
            )}
            <h3 className="font-black text-xs sm:text-sm uppercase truncate">
              {isMrz ? 'Cadrer les 2 lignes MRZ du bas' : 'Recadrer la copie du passeport'}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onRotate90(270)}
              title="Pivoter à gauche"
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              onClick={() => onRotate90(90)}
              title="Pivoter à droite"
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
            >
              <RotateCw size={15} />
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <p
          className={`px-4 py-2 text-[11px] font-semibold border-b shrink-0 ${
            isMrz
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : 'bg-blue-50 text-blue-900 border-blue-100'
          }`}
        >
          {isMrz ? (
            <>
              Entourez uniquement les <strong>2 lignes de codes P&lt;...</strong> en bas du passeport
              (utilisez les boutons de rotation en haut si le passeport est de côté).
            </>
          ) : (
            <>Ajustez les 4 coins pour entourer proprement toute la page du passeport.</>
          )}
        </p>

        {/* Image */}
        <div className="p-3 sm:p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-950 select-none">
          <div className="relative inline-block max-w-full max-h-[58vh] touch-none">
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Passeport"
              className="max-h-[58vh] w-auto max-w-full object-contain pointer-events-none block"
            />

            <div
              onPointerDown={(e) => startDrag(e, 'move')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{
                left: `${pctX}%`,
                top: `${pctY}%`,
                width: `${pctW}%`,
                height: `${pctH}%`,
              }}
              className={`absolute border-2 ${borderCls} shadow-[0_0_0_9999px_rgba(2,6,23,0.58)] cursor-move rounded-lg touch-none`}
            >
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                <Move size={20} className="text-white" />
              </div>

              {(
                [
                  ['nw', '-top-5 -left-5 cursor-nwse-resize'],
                  ['ne', '-top-5 -right-5 cursor-nesw-resize'],
                  ['sw', '-bottom-5 -left-5 cursor-nesw-resize'],
                  ['se', '-bottom-5 -right-5 cursor-nwse-resize'],
                ] as const
              ).map(([corner, posCls]) => (
                <div
                  key={corner}
                  onPointerDown={(e) => startDrag(e, corner)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className={`absolute ${posCls} w-10 h-10 flex items-center justify-center touch-none`}
                >
                  <div
                    className={`w-5 h-5 rounded-full ${handleDotCls} border-2 border-white shadow-md`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white font-black text-xs transition shadow-sm cursor-pointer ${
              isMrz ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isMrz ? <ScanLine size={16} /> : <Check size={16} />}
            <span>{isMrz ? 'Relancer la lecture MRZ' : 'Valider le passeport'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
