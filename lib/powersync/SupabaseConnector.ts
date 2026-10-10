import {
  UpdateType,
  type PowerSyncBackendConnector,
  type AbstractPowerSyncDatabase
} from '@powersync/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/supabase';

export class SupabaseConnector implements PowerSyncBackendConnector {
  private client: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.client = supabaseClient;
  }

  async fetchCredentials() {
    const { data: { session }, error } = await getSession();
    if (error) throw error;
    if (!session) {
      console.warn("PowerSync: Aucune session active");
      return null;
    }

    const endpoint = process.env.NEXT_PUBLIC_POWERSYNC_URL;
    if (!endpoint) {
      throw new Error("PowerSync: NEXT_PUBLIC_POWERSYNC_URL manquant");
    }

    return {
      endpoint,
      token: session.access_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    for (const op of transaction.crud) {
      const table = op.table;
      const record = op.opData;

      try {
        if (op.op === UpdateType.PUT) {
          const { error } = await this.client
            .from(table)
            .upsert({ id: op.id, ...record });
          if (error) throw error;

        } else if (op.op === UpdateType.PATCH) {
          const { error } = await this.client
            .from(table)
            .update(record)
            .eq('id', op.id);
          if (error) throw error;

        } else if (op.op === UpdateType.DELETE) {
          const { error } = await this.client
            .from(table)
            .delete()
            .eq('id', op.id);
          if (error) throw error;
        }

      } catch (error: any) {
        console.error(`[PowerSync Upload Error] Table: ${table}, Op: ${op.op}`, error);
        throw error;
      }
    }

    // N'acquitter la transaction qu'après la réussite de toutes ses opérations.
    await transaction.complete();
  }
}