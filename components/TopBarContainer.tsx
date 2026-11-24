'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

type RGB = { r: number; g: number; b: number; a: number }

let probeCtx: CanvasRenderingContext2D | null = null

function getProbeCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!probeCtx) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    probeCtx = canvas.getContext('2d', { willReadFrequently: true })
  }
  return probeCtx
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => clampByte(v).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function getLuminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/**
 * Résout n'importe quelle couleur CSS moderne (Tailwind v4 oklch/oklab/color,
 * rgb/rgba, hsl, #hex) en composantes RGBA exactes via un canvas 1×1 natif.
 */
function parseAnyCssColor(raw: string | null | undefined): RGB | null {
  if (!raw) return null
  const str = raw.trim()
  if (!str || str === 'transparent' || str === 'none' || str === 'rgba(0, 0, 0, 0)') return null

  const ctx = getProbeCtx()
  if (!ctx) return null

  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = 'rgba(0,0,0,0)'
  ctx.fillStyle = str
  ctx.fillRect(0, 0, 1, 1)
  const data = ctx.getImageData(0, 0, 1, 1).data
  const a = data[3] / 255
  if (a <= 0.01) return null
  return { r: data[0], g: data[1], b: data[2], a }
}

function extractGradientTopColor(bgImage: string | null | undefined): RGB | null {
  if (!bgImage || bgImage === 'none' || !bgImage.includes('gradient')) return null
  const colorMatch = bgImage.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]+\)|#[0-9a-fA-F]{3,8}/)
  if (!colorMatch) return null
  return parseAnyCssColor(colorMatch[0])
}

function compositeOver(top: RGB, bottom: RGB): RGB {
  const a = top.a + bottom.a * (1 - top.a)
  if (a <= 0) return { r: 255, g: 255, b: 255, a: 0 }
  return {
    r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
    g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
    b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
    a,
  }
}

function getSafeAreaTopPx(): number {
  if (typeof window === 'undefined') return 0
  const probe = document.querySelector<HTMLElement>('[data-status-bar-guard="true"]')
  if (probe) {
    const h = probe.getBoundingClientRect().height
    if (h > 0 && h < 100) return h
  }
  return 0
}

function isAppDarkMode(pathname: string | null): boolean {
  if (typeof document === 'undefined') return false
  const clean = (pathname || '/').replace(/\/+$/, '') || '/'
  if (clean.startsWith('/agence')) {
    return typeof window !== 'undefined' && localStorage.getItem('compta_theme_dark') === 'true'
  }
  return document.documentElement.classList.contains('dark')
}

function isSystemDarkMode(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Couleur de fond réelle du CORPS de la page (jamais le bleu de l'en-tête),
 * afin d'éviter toute bande bleue parasite en bas de page lors du scroll.
 */
function getPageBodyBg(pathname: string | null): string {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/'
  const appDark = isAppDarkMode(pathname)
  if (clean.startsWith('/agence')) {
    return appDark ? '#000000' : '#fbfbfb'
  }
  if (appDark) {
    return '#202124'
  }
  return '#f8fafc'
}

function getRouteFallbackHeaderColor(pathname: string | null): string {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/'
  const appDark = isAppDarkMode(pathname)
  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768

  if (clean === '/hajj' || clean === '/hajj/dashboard' || clean === '/hajj/dash') {
    return '#2563eb'
  }
  if ((clean === '/hajj/comptabilite' || clean === '/hajj/repartition-hotels') && isMobileViewport) {
    return '#2563eb'
  }
  if (clean === '/agence' || clean === '/agence/dashboard') {
    return appDark ? '#161618' : '#1e293b'
  }
  if (clean.startsWith('/agence') && appDark) {
    return '#000000'
  }
  if (appDark) {
    return '#303134'
  }
  return '#ffffff'
}

/**
 * Détecte automatiquement la couleur réelle de l'en-tête visible tout en haut
 * de la page active (fond uni, dégradé Tailwind v4/oklch ou overlay de modale).
 */
function detectVisibleHeaderColor(fallbackHex: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallbackHex
  if (!document.elementsFromPoint) return fallbackHex

  const safeTop = getSafeAreaTopPx()
  const sampleY = Math.min(window.innerHeight - 1, Math.max(4, Math.round(safeTop + 14)))
  const sampleXs = [
    Math.floor(window.innerWidth * 0.5),
    Math.floor(window.innerWidth * 0.18),
  ]

  for (const sampleX of sampleXs) {
    const stack = document.elementsFromPoint(sampleX, sampleY)
    let acc: RGB = { r: 0, g: 0, b: 0, a: 0 }

    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue
      if (node.dataset.statusBarGuard === 'true') continue
      if (node.tagName === 'HTML' || node.tagName === 'BODY') continue

      const style = window.getComputedStyle(node)
      const opacity = parseFloat(style.opacity || '1')
      if (style.visibility === 'hidden' || opacity <= 0.02) continue

      const gradColor = extractGradientTopColor(style.backgroundImage)
      const solidColor = parseAnyCssColor(style.backgroundColor)
      const layer = gradColor ?? solidColor

      if (layer && layer.a > 0.02) {
        const effective: RGB = { ...layer, a: Math.min(1, layer.a * opacity) }
        acc = acc.a > 0 ? compositeOver(acc, effective) : effective
        if (acc.a >= 0.96) {
          return rgbToHex(acc.r, acc.g, acc.b)
        }
      }
    }

    if (acc.a > 0.15) {
      const base = parseAnyCssColor(fallbackHex) ?? { r: 255, g: 255, b: 255, a: 1 }
      const merged = compositeOver(acc, base)
      return rgbToHex(merged.r, merged.g, merged.b)
    }
  }

  return fallbackHex
}

export default function TopBarContainer() {
  const pathname = usePathname()
  const lastAppliedRef = useRef<{ statusColor: string; bodyBg: string; isDark: boolean } | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const applyColors = (rawHeaderHex: string) => {
      const parsedHeader = parseAnyCssColor(rawHeaderHex) ?? { r: 255, g: 255, b: 255, a: 1 }
      const headerLuminance = getLuminance(parsedHeader.r, parsedHeader.g, parsedHeader.b)
      const sysDark = isSystemDarkMode()
      const appDark = isAppDarkMode(pathname)

      // 🛡️ GARDE-FOU CONTRASTE MODE SOMBRE SMARTPHONE :
      // Si l'appareil est en mode sombre (prefers-color-scheme: dark) mais que la page active
      // a un en-tête très clair/blanc (ex: État Général, Dossiers...), certains smartphones
      // Android/MIUI/Samsung/iOS conservent des icônes système blanches qui deviennent invisibles
      // sur un fond blanc. On bascule alors la barre de statut en ardoise sombre (#0f172a)
      // avec icônes blanches garantissant 100 % de lisibilité.
      let statusColor = rgbToHex(parsedHeader.r, parsedHeader.g, parsedHeader.b)
      let isDarkBar = headerLuminance < 0.58

      if (sysDark && !appDark && headerLuminance >= 0.82) {
        statusColor = '#0f172a'
        isDarkBar = true
      }

      // 🛡️ FOND DU CORPS DE PAGE SÉPARÉ DE L'EN-TÊTE :
      // html et body prennent TOUJOURS le fond neutre du corps de page (#f8fafc ou sombre),
      // jamais la couleur bleue de l'en-tête → aucune bande bleue en bas de page !
      const bodyBg = getPageBodyBg(pathname)

      if (
        lastAppliedRef.current &&
        lastAppliedRef.current.statusColor === statusColor &&
        lastAppliedRef.current.bodyBg === bodyBg &&
        lastAppliedRef.current.isDark === isDarkBar
      ) {
        return
      }
      lastAppliedRef.current = { statusColor, bodyBg, isDark: isDarkBar }

      // 1. Variable CSS consommée uniquement par la bande haute safe-area (top: 0)
      document.documentElement.style.setProperty('--status-bar-bg', statusColor)

      // 2. Fond neutre du document (jamais le bleu de l'en-tête -> pied de page propre)
      document.documentElement.style.colorScheme = appDark ? 'dark' : 'light'
      document.documentElement.style.setProperty('background-color', bodyBg, 'important')
      document.body.style.setProperty('background-color', bodyBg, 'important')

      // 3. Balise <meta name="theme-color"> unique et propre (Chrome Android / Safari iOS)
      const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]'))
      if (metas.length === 0) {
        const meta = document.createElement('meta')
        meta.name = 'theme-color'
        meta.content = statusColor
        document.head.appendChild(meta)
      } else {
        metas[0].removeAttribute('media')
        metas[0].setAttribute('content', statusColor)
        for (let i = 1; i < metas.length; i++) {
          metas[i].remove()
        }
      }

      // 4. Balise iOS PWA
      let appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      if (!appleMeta) {
        appleMeta = document.createElement('meta')
        appleMeta.setAttribute('name', 'apple-mobile-web-app-status-bar-style')
        document.head.appendChild(appleMeta)
      }
      appleMeta.setAttribute('content', isDarkBar ? 'black-translucent' : 'default')

      // 5. Barre de statut native Capacitor (Android & iOS)
      if (Capacitor.isNativePlatform()) {
        const platform = Capacitor.getPlatform()
        ;(async () => {
          try {
            if (platform === 'android') {
              await StatusBar.setOverlaysWebView({ overlay: false })
              await StatusBar.setBackgroundColor({ color: statusColor })
            }
            // Style.Dark => icônes blanches (fond sombre/bleu)
            // Style.Light => icônes noires (fond clair en mode clair)
            await StatusBar.setStyle({
              style: isDarkBar ? Style.Dark : Style.Light,
            })
          } catch {
            // ignore on unsupported environments
          }
        })()
      }
    }

    const syncFromDom = () => {
      const fallback = getRouteFallbackHeaderColor(pathname)
      const detected = detectVisibleHeaderColor(fallback)
      applyColors(detected)
    }

    const scheduleSync = (delay = 60) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        requestAnimationFrame(syncFromDom)
      }, delay)
    }

    // Application immédiate basée sur la route (0ms, zéro flash)
    applyColors(getRouteFallbackHeaderColor(pathname))

    // Détection réelle de l'en-tête peint (+ revérification après chargement async)
    const rafId = requestAnimationFrame(syncFromDom)
    const t1 = window.setTimeout(syncFromDom, 150)
    const t2 = window.setTimeout(syncFromDom, 450)

    const htmlObserver = new MutationObserver(() => scheduleSync(40))
    htmlObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    const bodyObserver = new MutationObserver(() => scheduleSync(80))
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })

    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onSystemThemeChange = () => {
      lastAppliedRef.current = null
      scheduleSync(30)
    }
    mq?.addEventListener?.('change', onSystemThemeChange)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastAppliedRef.current = null
        scheduleSync(30)
      }
    }

    const onResize = () => scheduleSync(80)
    const onThemeEvent = () => {
      lastAppliedRef.current = null
      scheduleSync(40)
    }

    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('theme-change', onThemeEvent)
    window.addEventListener('storage', onThemeEvent)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(rafId)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      htmlObserver.disconnect()
      bodyObserver.disconnect()
      mq?.removeEventListener?.('change', onSystemThemeChange)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('theme-change', onThemeEvent)
      window.removeEventListener('storage', onThemeEvent)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pathname])

  return null
}
