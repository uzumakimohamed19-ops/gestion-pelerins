import { NextRequest, NextResponse } from 'next/server'
import {
  buildPushDigest,
  computeAgencyDigestStats,
  type DigestPaymentRow,
  type DigestPelerinRow,
} from '@/lib/pushDigestEngine'
import {
  isVapidConfigured,
  requireAdminFromRequest,
  sendWebPushNotification,
  type StoredPushSubscription,
} from '@/lib/pushServer'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    if (!isVapidConfigured()) {
      return NextResponse.json({ error: 'Clés VAPID non configurées.' }, { status: 500 })
    }

    const adminAuth = await requireAdminFromRequest(request.headers.get('authorization'))
    if (!adminAuth) {
      return NextResponse.json({ error: 'Accès réservé à l’administrateur.' }, { status: 403 })
    }

    const { adminClient } = adminAuth
    const body = await request.json()
    const mode: 'broadcast' | 'digest_morning' | 'digest_evening' =
      body?.mode === 'digest_morning' || body?.mode === 'digest_evening'
        ? body.mode
        : 'broadcast'
    const targetAgenceId: string | null =
      body?.agence_id && body.agence_id !== 'ALL' ? String(body.agence_id) : null

    // Charger tous les appareils actifs (filtrés par agence si précisé)
    let subQuery = adminClient
      .from('push_subscriptions')
      .select('*')
      .eq('enabled', true)

    if (targetAgenceId) {
      subQuery = subQuery.eq('agence_id', targetAgenceId)
    }

    const { data: subRows, error: subErr } = await subQuery
    if (subErr) throw subErr

    const activeSubs = (subRows || []) as StoredPushSubscription[]
    if (activeSubs.length === 0) {
      return NextResponse.json(
        { error: 'Aucun appareil actif trouvé pour cette cible.' },
        { status: 400 }
      )
    }

    const now = new Date()
    const todayIso = now.toISOString().slice(0, 10)

    // MODE 1 : Broadcast personnalisé rédigé par l'administrateur
    if (mode === 'broadcast') {
      const title = String(body?.title || '').trim()
      const message = String(body?.body || '').trim()
      const url = String(body?.url || '/hajj/dashboard').trim() || '/hajj/dashboard'
      const urgency = body?.urgency === 'normal' ? 'normal' : 'high'

      if (!title || !message) {
        return NextResponse.json(
          { error: 'Veuillez renseigner un titre et un message.' },
          { status: 400 }
        )
      }

      const payload = {
        title,
        body: message,
        url,
        category: 'resume' as const,
        tag: `agencepro-admin-${Date.now()}`,
      }

      let sent = 0
      const succeededIds: string[] = []
      const expiredIds: string[] = []

      for (const sub of activeSubs) {
        const res = await sendWebPushNotification(sub, payload, {
          urgency,
          requireInteraction: urgency === 'high',
        })
        if (res.ok) {
          sent++
          succeededIds.push(sub.id)
        } else if (res.expired) {
          expiredIds.push(sub.id)
        }
      }

      if (succeededIds.length > 0) {
        await adminClient
          .from('push_subscriptions')
          .update({ last_notified_at: now.toISOString() })
          .in('id', succeededIds)

        await adminClient.from('push_notification_logs').insert({
          user_id: adminAuth.userId,
          agence_id: targetAgenceId,
          slot: 'admin',
          category: 'broadcast',
          title,
          body: message,
          url,
          sent_count: sent,
        })
      }

      if (expiredIds.length > 0) {
        await adminClient.from('push_subscriptions').delete().in('id', expiredIds)
      }

      return NextResponse.json({
        ok: true,
        mode,
        sent,
        expiredRemoved: expiredIds.length,
      })
    }

    // MODE 2 : Déclenchement manuel d'un point intelligent (Matin ou Soir) personnalisé par agence
    const slot = mode === 'digest_morning' ? 'morning' : 'evening'
    const subsByUser = new Map<string, StoredPushSubscription[]>()
    for (const s of activeSubs) {
      const list = subsByUser.get(s.user_id) || []
      list.push(s)
      subsByUser.set(s.user_id, list)
    }

    const agencyCache = new Map<
      string,
      {
        agenceName: string | null
        pelerins: DigestPelerinRow[]
        paymentsToday: DigestPaymentRow[]
      }
    >()

    async function loadAgencyData(agenceId: string) {
      const cached = agencyCache.get(agenceId)
      if (cached) return cached

      const [{ data: ag }, { data: pelRows }] = await Promise.all([
        adminClient.from('agences').select('nom_agence').eq('id', agenceId).maybeSingle(),
        adminClient
          .from('pelerins')
          .select(
            'id, num_passeport, document_url, prix_package, total_paye, devise, sur_plateforme_gouv, sur_plateforme_nusuk, campagne, created_at'
          )
          .eq('agence_id', agenceId),
      ])

      const pelerins = (pelRows || []) as DigestPelerinRow[]
      let paymentsToday: DigestPaymentRow[] = []

      if (pelerins.length > 0) {
        const { data: payRows } = await adminClient
          .from('pelerin_payments')
          .select('id, pelerin_id, amount, devise, payment_date, created_at')
          .in(
            'pelerin_id',
            pelerins.map((p) => p.id)
          )
          .gte('payment_date', todayIso)
        paymentsToday = (payRows || []) as DigestPaymentRow[]
      }

      const entry = { agenceName: ag?.nom_agence ?? null, pelerins, paymentsToday }
      agencyCache.set(agenceId, entry)
      return entry
    }

    let totalSent = 0
    let expiredRemoved = 0
    let usersNotified = 0

    for (const [userId, userSubs] of subsByUser.entries()) {
      let agenceId = userSubs.find((s) => s.agence_id)?.agence_id ?? null
      if (!agenceId) {
        const { data: prof } = await adminClient
          .from('profiles')
          .select('agence_id')
          .eq('id', userId)
          .maybeSingle()
        agenceId = prof?.agence_id ?? null
      }

      const agencyData = agenceId
        ? await loadAgencyData(agenceId)
        : { agenceName: null, pelerins: [], paymentsToday: [] }

      const sortedBySeen = [...userSubs].sort((a, b) =>
        String(a.last_seen_at || '').localeCompare(String(b.last_seen_at || ''))
      )
      const mostRecentSub = sortedBySeen.at(-1)
      const latestSeen = mostRecentSub?.last_seen_at ?? null
      const preferredCampagne =
        mostRecentSub?.active_campagne ??
        sortedBySeen.reverse().find((s) => s.active_campagne != null)?.active_campagne ??
        null

      const stats = computeAgencyDigestStats({
        pelerins: agencyData.pelerins,
        paymentsToday: agencyData.paymentsToday,
        preferredCampagne,
        lastSeenAt: latestSeen,
        now,
      })

      const payload = buildPushDigest({
        slot,
        agenceName: agencyData.agenceName,
        stats,
        now,
      })

      let userSent = 0
      const succeededIds: string[] = []
      const expiredIds: string[] = []

      for (const sub of userSubs) {
        const res = await sendWebPushNotification(sub, payload)
        if (res.ok) {
          userSent++
          totalSent++
          succeededIds.push(sub.id)
        } else if (res.expired) {
          expiredRemoved++
          expiredIds.push(sub.id)
        }
      }

      if (succeededIds.length > 0) {
        usersNotified++
        await adminClient
          .from('push_subscriptions')
          .update({ last_notified_at: now.toISOString() })
          .in('id', succeededIds)

        await adminClient.from('push_notification_logs').insert({
          user_id: userId,
          agence_id: agenceId,
          slot,
          category: payload.category,
          title: payload.title,
          body: payload.body,
          url: payload.url,
          sent_count: userSent,
        })
      }

      if (expiredIds.length > 0) {
        await adminClient.from('push_subscriptions').delete().in('id', expiredIds)
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      usersNotified,
      sent: totalSent,
      expiredRemoved,
    })
  } catch (err: any) {
    console.error('[push/admin/send]', err)
    return NextResponse.json({ error: err?.message || 'Erreur lors de l’envoi.' }, { status: 500 })
  }
}
