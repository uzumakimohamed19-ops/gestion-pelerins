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

    let query = auth.userClient
      .from('push_subscriptions')
      .update({ last_seen_at: nowIso })
      .eq('user_id', auth.userId)

    if (endpoint) {
      query = query.eq('endpoint', endpoint)
    }

    await query
    return NextResponse.json({ ok: true, last_seen_at: nowIso })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
