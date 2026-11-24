import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/pushServer'

export async function PATCH(request: NextRequest) {
  try {
    const adminAuth = await requireAdminFromRequest(request.headers.get('authorization'))
    if (!adminAuth) {
      return NextResponse.json({ error: 'Accès réservé à l’administrateur.' }, { status: 403 })
    }

    const { adminClient } = adminAuth
    const body = await request.json()

    // 1. Actions sur un appareil spécifique
    if (body?.action === 'toggle_device' && body?.subscription_id) {
      const { error } = await adminClient
        .from('push_subscriptions')
        .update({ enabled: Boolean(body.enabled) })
        .eq('id', String(body.subscription_id))

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    if (body?.action === 'delete_device' && body?.subscription_id) {
      const { error } = await adminClient
        .from('push_subscriptions')
        .delete()
        .eq('id', String(body.subscription_id))

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // 2. Mise à jour de la configuration globale
    const updates: Record<string, any> = {
      id: 1,
      updated_at: new Date().toISOString(),
    }

    if (typeof body?.global_enabled === 'boolean') updates.global_enabled = body.global_enabled
    if (typeof body?.morning_enabled === 'boolean') updates.morning_enabled = body.morning_enabled
    if (typeof body?.evening_enabled === 'boolean') updates.evening_enabled = body.evening_enabled
    if (typeof body?.inactivity_days_threshold === 'number') {
      updates.inactivity_days_threshold = Math.max(1, Math.min(30, Math.round(body.inactivity_days_threshold)))
    }

    const { data, error } = await adminClient
      .from('push_global_settings')
      .upsert(updates, { onConflict: 'id' })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json(
        {
          error:
            error.code === '42P01'
              ? 'Exécutez la mise à jour de supabase/push_notifications.sql dans Supabase pour créer push_global_settings.'
              : error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, settings: data })
  } catch (err: any) {
    console.error('[push/admin/settings]', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur.' }, { status: 500 })
  }
}
