import { NextRequest, NextResponse } from 'next/server'
import {
  buildPushDigest,
  computeAgencyDigestStats,
  type DigestPaymentRow,
  type DigestPelerinRow,
  type PushSlot,
} from '@/lib/pushDigestEngine'
import {
  getSupabaseAdminClient,
  isVapidConfigured,
  sendWebPushNotification,
  type StoredPushSubscription,
} from '@/lib/pushServer'

export const dynamic = 'force-dynamic'

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // En dev local sans CRON_SECRET, refuser par sécurité sauf si explicitement défini
    return false
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${secret}`) return true
  const querySecret = request.nextUrl.searchParams.get('secret')
  return querySecret === secret
}

async function runPushCron(request: NextRequest) {
  try {
    if (!isAuthorizedCron(request)) {
      return NextResponse.json({ error: 'Unauthorized cron request.' }, { status: 401 })
    }

    if (!isVapidConfigured()) {
      return NextResponse.json(
        { error: 'Clés VAPID non configurées.' },
        { status: 500 }
      )
    }

    const now = new Date()
    const slotParam = request.nextUrl.searchParams.get('slot')
    const slot: PushSlot =
      slotParam === 'morning' || slotParam === 'evening'
        ? slotParam
        : now.getUTCHours() < 14
        ? 'morning'
        : 'evening'

    const todayIso = now.toISOString().slice(0, 10)
    const slotKey = `${todayIso}-${slot}`
    const slotColumn = slot === 'morning' ? 'morning_enabled' : 'evening_enabled'

    const admin = getSupabaseAdminClient()

    const { data: subRows, error: subError } = await admin
      .from('push_subscriptions')
      .select('*')
      .eq('enabled', true)
      .eq(slotColumn, true)

    if (subError) {
      throw subError
    }

    const allSubs = ((subRows || []) as StoredPushSubscription[]).filter(
      (s) => s.last_slot_sent !== slotKey
    )

    if (allSubs.length === 0) {
      return NextResponse.json({
        ok: true,
        slot: slotKey,
        processed: 0,
        sent: 0,
        expiredRemoved: 0,
      })
    }

    // Grouper les abonnements par utilisateur (chaque utilisateur peut avoir iPhone + Android + PC)
    const subsByUser = new Map<string, StoredPushSubscription[]>()
    for (const sub of allSubs) {
      const list = subsByUser.get(sub.user_id) || []
      list.push(sub)
      subsByUser.set(sub.user_id, list)
    }

    // Cache des données d'agence pour éviter de requêter plusieurs fois la même agence
    const agencyDataCache = new Map<
      string,
      {
        agenceName: string | null
        pelerins: DigestPelerinRow[]
        paymentsToday: DigestPaymentRow[]
      }
    >()

    async function loadAgencyData(agenceId: string) {
      const cached = agencyDataCache.get(agenceId)
      if (cached) return cached

      const [{ data: ag }, { data: pelRows }] = await Promise.all([
        admin.from('agences').select('nom_agence').eq('id', agenceId).maybeSingle(),
        admin
          .from('pelerins')
          .select(
            'id, num_passeport, document_url, prix_package, total_paye, devise, sur_plateforme_gouv, sur_plateforme_nusuk, campagne, created_at'
          )
          .eq('agence_id', agenceId),
      ])

      const pelerins = (pelRows || []) as DigestPelerinRow[]
      let paymentsToday: DigestPaymentRow[] = []

      if (pelerins.length > 0) {
        const ids = pelerins.map((p) => p.id)
        const { data: payRows } = await admin
          .from('pelerin_payments')
          .select('id, amount, devise, payment_date, created_at')
          .in('pelerin_id', ids)
          .gte('payment_date', todayIso)
        paymentsToday = (payRows || []) as DigestPaymentRow[]
      }

      const entry = {
        agenceName: ag?.nom_agence ?? null,
        pelerins,
        paymentsToday,
      }
      agencyDataCache.set(agenceId, entry)
      return entry
    }

    let totalSent = 0
    let expiredRemoved = 0
    let usersNotified = 0

    for (const [userId, userSubs] of subsByUser.entries()) {
      // Résoudre l'agence de l'utilisateur
      let agenceId = userSubs.find((s) => s.agence_id)?.agence_id ?? null
      if (!agenceId) {
        const { data: prof } = await admin
          .from('profiles')
          .select('agence_id')
          .eq('id', userId)
          .maybeSingle()
        agenceId = prof?.agence_id ?? null
      }

      const agencyData = agenceId
        ? await loadAgencyData(agenceId)
        : { agenceName: null, pelerins: [], paymentsToday: [] }

      // Prendre la date d'activité la plus récente parmi tous les appareils de cet utilisateur
      const latestSeen = userSubs
        .map((s) => s.last_seen_at)
        .filter((d): d is string => Boolean(d))
        .sort()
        .at(-1) ?? null

      // Dernière catégorie envoyée à cet utilisateur pour éviter les répétitions
      const { data: lastLog } = await admin
        .from('push_notification_logs')
        .select('category')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const stats = computeAgencyDigestStats({
        pelerins: agencyData.pelerins,
        paymentsToday: agencyData.paymentsToday,
        lastSeenAt: latestSeen,
        now,
      })

      const payload = buildPushDigest({
        slot,
        agenceName: agencyData.agenceName,
        stats,
        lastCategory: lastLog?.category ?? null,
        now,
      })

      let userSentCount = 0
      const succeededIds: string[] = []
      const expiredIds: string[] = []

      for (const sub of userSubs) {
        const res = await sendWebPushNotification(sub, payload)
        if (res.ok) {
          userSentCount++
          totalSent++
          succeededIds.push(sub.id)
        } else if (res.expired) {
          expiredRemoved++
          expiredIds.push(sub.id)
        }
      }

      if (succeededIds.length > 0) {
        usersNotified++
        await admin
          .from('push_subscriptions')
          .update({
            last_notified_at: now.toISOString(),
            last_slot_sent: slotKey,
          })
          .in('id', succeededIds)

        await admin.from('push_notification_logs').insert({
          user_id: userId,
          agence_id: agenceId,
          slot,
          category: payload.category,
          title: payload.title,
          body: payload.body,
          url: payload.url,
          sent_count: userSentCount,
        })
      }

      if (expiredIds.length > 0) {
        await admin.from('push_subscriptions').delete().in('id', expiredIds)
      }
    }

    return NextResponse.json({
      ok: true,
      slot: slotKey,
      usersNotified,
      sent: totalSent,
      expiredRemoved,
    })
  } catch (err: any) {
    console.error('[push/cron]', err)
    return NextResponse.json({ error: err?.message || 'Erreur cron push.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return runPushCron(request)
}

export async function POST(request: NextRequest) {
  return runPushCron(request)
}
