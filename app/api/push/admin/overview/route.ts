import { NextRequest, NextResponse } from 'next/server'
import {
  getGlobalPushSettings,
  isVapidConfigured,
  requireAdminFromRequest,
  type StoredPushSubscription,
} from '@/lib/pushServer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const adminAuth = await requireAdminFromRequest(request.headers.get('authorization'))
    if (!adminAuth) {
      return NextResponse.json({ error: 'Accès réservé à l’administrateur.' }, { status: 403 })
    }

    const { adminClient } = adminAuth

    const [settings, subsRes, profilesRes, agencesRes, logsRes] = await Promise.all([
      getGlobalPushSettings(adminClient),
      adminClient
        .from('push_subscriptions')
        .select('*')
        .order('updated_at', { ascending: false }),
      adminClient.from('profiles').select('id, full_name, role, agence_id'),
      adminClient.from('agences').select('id, nom_agence').order('nom_agence', { ascending: true }),
      adminClient
        .from('push_notification_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40),
    ])

    const subs = (subsRes.data || []) as StoredPushSubscription[]
    const profilesMap = new Map(
      (profilesRes.data || []).map((p: any) => [p.id, p])
    )
    const agencesMap = new Map(
      (agencesRes.data || []).map((a: any) => [a.id, a.nom_agence])
    )

    const enrichedSubs = subs.map((s) => {
      const prof = profilesMap.get(s.user_id)
      const effectiveAgenceId = s.agence_id || prof?.agence_id || null
      return {
        id: s.id,
        user_id: s.user_id,
        user_name: prof?.full_name || 'Utilisateur',
        user_role: prof?.role || 'staff',
        agence_id: effectiveAgenceId,
        agence_name: effectiveAgenceId ? agencesMap.get(effectiveAgenceId) || 'Agence' : 'Sans agence',
        platform: s.platform,
        enabled: s.enabled,
        morning_enabled: s.morning_enabled,
        evening_enabled: s.evening_enabled,
        active_campagne: s.active_campagne ?? null,
        last_seen_at: s.last_seen_at,
        last_notified_at: s.last_notified_at,
        last_slot_sent: s.last_slot_sent,
      }
    })

    const activeSubs = enrichedSubs.filter((s) => s.enabled)
    const coveredAgences = new Set(activeSubs.map((s) => s.agence_id).filter(Boolean)).size
    const iosCount = activeSubs.filter((s) => s.platform === 'ios-pwa').length
    const androidCount = activeSubs.filter(
      (s) => s.platform === 'android-pwa' || s.platform === 'android-web'
    ).length
    const desktopCount = activeSubs.filter(
      (s) => s.platform === 'desktop' || s.platform === 'web'
    ).length

    const logs = (logsRes.data || []).map((l: any) => ({
      id: l.id,
      slot: l.slot,
      category: l.category,
      title: l.title,
      body: l.body,
      url: l.url,
      sent_count: l.sent_count,
      created_at: l.created_at,
      agence_name: l.agence_id ? agencesMap.get(l.agence_id) || 'Agence' : 'Global',
      user_name: l.user_id ? profilesMap.get(l.user_id)?.full_name || 'Utilisateur' : 'Diffusion',
    }))

    return NextResponse.json({
      vapidConfigured: isVapidConfigured(),
      settings,
      stats: {
        totalDevices: enrichedSubs.length,
        activeDevices: activeSubs.length,
        coveredAgences,
        iosCount,
        androidCount,
        desktopCount,
      },
      subscriptions: enrichedSubs,
      agences: agencesRes.data || [],
      logs,
    })
  } catch (err: any) {
    console.error('[push/admin/overview]', err)
    return NextResponse.json({ error: err?.message || 'Erreur serveur.' }, { status: 500 })
  }
}
