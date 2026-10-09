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
    try {
      const { data: { session }, error } = await getSession();
      if (error || !session) {
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
    } catch (e) {
      console.error("PowerSync fetchCredentials error:", e);
      return null;
    }
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
          // Utilisation d'un update simple sans bloquer si la ligne est temporairement absente
          const { error } = await this.client
            .from(table)
            .update(record)
            .eq('id', op.id);
          
          if (error) {
            // Si la ligne n'existe pas encore côté Supabase, on fait un upsert de secours
            if (error.code === 'PGRST116') {
              await this.client.from(table).upsert({ id: op.id, ...record });
            } else {
              throw error;
            }
          }

        } else if (op.op === UpdateType.DELETE) {
          const { error } = await this.client
            .from(table)
            .delete()
            .eq('id', op.id);
          if (error) throw error;
        }

      } catch (error: any) {
        console.error(`[PowerSync Upload Error] Table: ${table}, Op: ${op.op}`, error);

        // Si l'erreur est une contrainte PostgreSQL non réparable ou RLS bloquante
        // (ex: colonne inexistante, syntaxe 400, contrainte d'unicité)
        // on abandonne l'opération corrompue pour NE PAS GELER toute la base de données
        if (
          error.code === '42703' || // Undefined column
          error.code === '23502' || // Not null violation
          error.code === '23505' || // Unique violation
          error.status === 400 ||   // Bad request
          error.status === 403      // RLS refusé
        ) {
          console.warn(`[PowerSync] Opération ${op.id} rejetée par Supabase, ignorée pour débloquer le checkpoint :`, error.message);
          continue;
        }

        // Si c'est une perte de connexion réseau réelle, on relance pour réessayer plus tard
        if (!navigator.onLine) {
          throw error;
        }

        // Autre erreur : on continue pour débloquer la file
        continue;
      }
    }

    // Valide obligatoirement la transaction pour libérer le checkpoint
    await transaction.complete();
  }
}