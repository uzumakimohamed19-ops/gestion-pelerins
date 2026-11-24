import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserFromRequest } from '@/lib/pushServer'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserFromRequest(request.headers.get('authorization'))
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
    }

    const endpoint = request.nextUrl.searchParams.get('endpoint')
    let query = auth.userClient
      .from('push_subscriptions')
      .select('id, enabled, morning_enabled, evening_enabled, platform, last_seen_at')
      .eq('user_id', auth.userId)

    if (endpoint) {
      query = query.eq('endpoint', endpoint)
    }

    const { data, error } = await query.limit(1).maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({
        enabled: false,
        morning_enabled: true,
        evening_enabled: true,
      })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[push/subscribe GET]', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserFromRequest(request.headers.get('authorization'))
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
    }

    const body = await request.json()
    const endpoint = String(body?.endpoint || '').trim()
    const p256dh = String(body?.p256dh || '').trim()
    const authKey = String(body?.auth || '').trim()

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json(
        { error: 'Paramètres d’abonnement push invalides.' },
        { status: 400 }
      )
    }

    const allowedPlatforms = new Set(['ios-pwa', 'android-pwa', 'android-web', 'desktop', 'web'])
    const platform = allowedPlatforms.has(body?.platform) ? body.platform : 'web'
    const morningEnabled = body?.morning_enabled !== false
    const eveningEnabled = body?.evening_enabled !== false
    const timezone = String(body?.timezone || 'Africa/Bamako').slice(0, 64)
    const userAgent = body?.user_agent ? String(body.user_agent).slice(0, 240) : null
    const rawCampagne = body?.active_campagne
    const activeCampagne =
      rawCampagne != null && Number.isFinite(Number(rawCampagne)) && Number(rawCampagne) > 2000
        ? Math.round(Number(rawCampagne))
        : null

    // Récupérer l'agence rattachée au profil utilisateur
    const { data: profile } = await auth.userClient
      .from('profiles')
      .select('agence_id')
      .eq('id', auth.userId)
      .maybeSingle()

    const nowIso = new Date().toISOString()

    const basePayload = {
      user_id: auth.userId,
      agence_id: profile?.agence_id ?? null,
      endpoint,
      p256dh,
      auth: authKey,
      platform,
      user_agent: userAgent,
      enabled: true,
      morning_enabled: morningEnabled,
      evening_enabled: eveningEnabled,
      timezone,
      last_seen_at: nowIso,
    }

    let { data, error } = await auth.userClient
      .from('push_subscriptions')
      .upsert(
        { ...basePayload, active_campagne: activeCampagne },
        { onConflict: 'endpoint' }
      )
      .select('id, enabled, morning_enabled, evening_enabled, platform')
      .single()

    // Repli si la colonne active_campagne n'a pas encore été ajoutée dans Supabase
    if (error && (error.code === '42703' || String(error.message || '').includes('active_campagne'))) {
      const retry = await auth.userClient
        .from('push_subscriptions')
        .upsert(basePayload, { onConflict: 'endpoint' })
        .select('id, enabled, morning_enabled, evening_enabled, platform')
        .single()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error('[push/subscribe POST]', error)
      return NextResponse.json(
        {
          error:
            error.code === '42P01'
              ? 'La table push_subscriptions n’existe pas encore. Exécutez supabase/push_notifications.sql dans Supabase.'
              : error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, ...data })
  } catch (err: any) {
    console.error('[push/subscribe POST]', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserFromRequest(request.headers.get('authorization'))
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const endpoint = String(body?.endpoint || '').trim()

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint manquant.' }, { status: 400 })
    }

    const { error } = await auth.userClient
      .from('push_subscriptions')
      .delete()
      .eq('user_id', auth.userId)
      .eq('endpoint', endpoint)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[push/subscribe DELETE]', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur.' }, { status: 500 })
  }
}
