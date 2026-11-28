import {
  UpdateType,
  type PowerSyncBackendConnector,
  type AbstractPowerSyncDatabase,
} from '@powersync/common'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSession } from '@/lib/supabase'

const TOKEN_REFRESH_BUFFER_MS = 60_000

export class SupabaseConnector implements PowerSyncBackendConnector {
  private client: SupabaseClient

  constructor(supabaseClient: SupabaseClient) {
    this.client = supabaseClient
  }

  async fetchCredentials() {
    let {
      data: { session },
      error,
    } = await getSession()
    if (error) throw error
    if (!session) {
      return null
    }

    // Si le JWT expire dans moins de 60 s (ou est déjà expiré), rafraîchir avant de connecter PowerSync
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0
    if (expiresAtMs > 0 && expiresAtMs - Date.now() < TOKEN_REFRESH_BUFFER_MS) {
      try {
        const refreshed = await this.client.auth.refreshSession()
        if (refreshed.data?.session) {
          session = refreshed.data.session
        }
      } catch (refreshErr) {
        console.warn('[PowerSync] Refresh token échoué, tentative avec le jeton actuel :', refreshErr)
      }
    }

    const endpoint = process.env.NEXT_PUBLIC_POWERSYNC_URL
    if (!endpoint) {
      throw new Error('PowerSync: NEXT_PUBLIC_POWERSYNC_URL manquant')
    }

    return {
      endpoint,
      token: session.access_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction()
    if (!transaction) return

    for (const op of transaction.crud) {
      const table = op.table
      const record = op.opData

      try {
        if (op.op === UpdateType.PUT) {
          const { error } = await this.client.from(table).upsert({ id: op.id, ...record })
          if (error) throw error
        } else if (op.op === UpdateType.PATCH) {
          const { error } = await this.client.from(table).update(record).eq('id', op.id)
          if (error) throw error
        } else if (op.op === UpdateType.DELETE) {
          const { error } = await this.client.from(table).delete().eq('id', op.id)
          if (error) throw error
        }
      } catch (error: unknown) {
        console.error(`[PowerSync Upload Error] Table: ${table}, Op: ${op.op}`, error)
        throw error
      }
    }

    await transaction.complete()
  }
}
