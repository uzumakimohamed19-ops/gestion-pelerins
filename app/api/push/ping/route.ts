import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserFromRequest } from '@/lib/pushServer'

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserFromRequest(request.headers.get('authorization'))
    if (!auth) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const endpoint = body?.endpoint ? String(body.endpoint).trim() : null
    const nowIso = new Date().toISOString()

    const hasCampagneField = body && Object.prototype.hasOwnProperty.call(body, 'active_campagne')
    const rawCampagne = body?.active_campagne
    const activeCampagne =
      rawCampagne != null && Number.isFinite(Number(rawCampagne)) && Number(rawCampagne) > 2000
        ? Math.round(Number(rawCampagne))
        : null

    const updatePayload: Record<string, any> = { last_seen_at: nowIso }
    if (hasCampagneField) {
      updatePayload.active_campagne = activeCampagne
    }

    let query = auth.userClient
      .from('push_subscriptions')
      .update(updatePayload)
      .eq('user_id', auth.userId)

    if (endpoint) {
      query = query.eq('endpoint', endpoint)
    }

    const { error } = await query
    if (error && hasCampagneField && (error.code === '42703' || String(error.message || '').includes('active_campagne'))) {
      let fallbackQuery = auth.userClient
        .from('push_subscriptions')
        .update({ last_seen_at: nowIso })
        .eq('user_id', auth.userId)
      if (endpoint) fallbackQuery = fallbackQuery.eq('endpoint', endpoint)
      await fallbackQuery
    }

    return NextResponse.json({ ok: true, last_seen_at: nowIso, active_campagne: activeCampagne })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
