import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Manifest PWA dynamique sensible à la plateforme :
 * - Sur Android :
 *   • Icônes d'écran d'accueil (maskable 192 & 512) = vrai logo Agence Pro.
 *   • Icône splash screen (any 512) = PNG 512x512 transparent invisible sur fond #ffffff,
 *     afin de supprimer totalement l'apparition du logo carré par défaut de Chrome Android
 *     avant notre splash screen animé personnalisé.
 * - Sur iOS / PC / macOS : icônes standard Agence Pro intactes.
 */
export async function GET(request: NextRequest) {
  const ua = request.headers.get('user-agent') || ''
  const isAndroid = /android/i.test(ua)

  const icons = isAndroid
    ? [
        {
          src: '/icon-192x192.png',
          type: 'image/png',
          sizes: '192x192',
          purpose: 'maskable',
        },
        {
          src: '/icon-512x512.png',
          type: 'image/png',
          sizes: '512x512',
          purpose: 'maskable',
        },
        {
          src: '/splash-blank-512x512.png',
          type: 'image/png',
          sizes: '512x512',
          purpose: 'any',
        },
      ]
    : [
        {
          src: '/icon-192x192.png',
          type: 'image/png',
          sizes: '192x192',
          purpose: 'any',
        },
        {
          src: '/icon-512x512.png',
          type: 'image/png',
          sizes: '512x512',
          purpose: 'any',
        },
        {
          src: '/icon-512x512.png',
          type: 'image/png',
          sizes: '512x512',
          purpose: 'maskable',
        },
      ]

  const manifest = {
    id: '/',
    name: 'Agence Pro — Gestion Hajj & Voyages',
    short_name: 'Agence Pro',
    description: 'Gestion des pèlerins, opérations et suivi de campagne',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons,
  }

  return new NextResponse(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      Vary: 'User-Agent',
    },
  })
}
