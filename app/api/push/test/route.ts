import { NextRequest, NextResponse } from 'next/server'
import {
  buildPushDigest,
  computeAgencyDigestStats,
  type DigestPaymentRow,
  type DigestPelerinRow,
} from '@/lib/pushDigestEngine'
import {
  getAuthenticatedUserFromRequest,
  isVapidConfigured,
  sendWebPushNotification,
  type StoredPushSubscription,
} from '@/lib/pushServer'

export async function POST(request: NextRequest) {
  try {
    if (!isVapidConfigured()) {
      return NextResponse.json(
        {
          error:
            'Clés VAPID non configurées sur le serveur (NEXT_PUBLIC_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY).',
        },
        { status: 500 }
      )
    }

    const auth = await getAuthenticatedUserFromRequest(request.headers.get('authorization'))
    if (!auth) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const endpoint = body?.endpoint ? String(body.endpoint).trim() : null

    let subQuery = auth.userClient
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('enabled', true)

    if (endpoint) {
      subQuery = subQuery.eq('endpoint', endpoint)
    }

    const { data: subs, error: subErr } = await subQuery
    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 })
    }

    const activeSubs = (subs || []) as StoredPushSubscription[]
    if (activeSubs.length === 0) {
      return NextResponse.json(
        { error: 'Aucun appareil abonné. Activez d’abord les notifications.' },
        { status: 400 }
      )
    }

    const { data: profile } = await auth.userClient
      .from('profiles')
      .select('agence_id, agences(nom_agence)')
      .eq('id', auth.userId)
      .maybeSingle()

    const agenceId = profile?.agence_id ?? activeSubs[0]?.agence_id ?? null
    // @ts-expect-error relation join
    const agenceName: string | null = profile?.agences?.nom_agence ?? null

    let pelerins: DigestPelerinRow[] = []
    let paymentsToday: DigestPaymentRow[] = []

    const todayIso = new Date().toISOString().slice(0, 10)
    const pelerinsQuery = auth.userClient
      .from('pelerins')
      .select(
        'id, num_passeport, document_url, prix_package, total_paye, devise, sur_plateforme_gouv, sur_plateforme_nusuk, campagne, created_at'
      )

    if (agenceId) {
      pelerinsQuery.eq('agence_id', agenceId)
    }

    const { data: pelRows } = await pelerinsQuery
    pelerins = (pelRows || []) as DigestPelerinRow[]

    if (pelerins.length > 0) {
      const pelerinIds = pelerins.map((p) => p.id)
      const { data: payRows } = await auth.userClient
        .from('pelerin_payments')
        .select('id, amount, devise, payment_date, created_at')
        .in('pelerin_id', pelerinIds)
        .gte('payment_date', todayIso)

      paymentsToday = (payRows || []) as DigestPaymentRow[]
    }

    const stats = computeAgencyDigestStats({
      pelerins,
      paymentsToday,
      lastSeenAt: activeSubs[0]?.last_seen_at,
    })

    const payload = buildPushDigest({
      slot: 'test',
      agenceName,
      stats,
    })

    let sent = 0
    let lastError = ''

    for (const sub of activeSubs) {
      const result = await sendWebPushNotification(sub, payload)
      if (result.ok) {
        sent++
      } else {
        lastError = result.error
        if (result.expired) {
          await auth.userClient
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id)
        }
      }
    }

    if (sent === 0) {
      return NextResponse.json(
        { error: lastError || 'Échec d’envoi vers l’appareil.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      sent,
      title: payload.title,
      body: payload.body,
      category: payload.category,
    })
  } catch (err: any) {
    console.error('[push/test POST]', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur.' }, { status: 500 })
  }
}
