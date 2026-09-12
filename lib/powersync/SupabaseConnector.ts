import {
  PowerSyncBackendConnector,
  UpdateType,
  type PowerSyncDatabase
} from '@powersync/web';
import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseConnector implements PowerSyncBackendConnector {
  private client: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.client = supabaseClient;
  }

  async fetchCredentials() {
    // 1. Récupération directe de la session
    let { data: { session }, error } = await this.client.auth.getSession();

    // 2. Si la session est encore en train de se charger depuis le localStorage
    if (!session || error) {
      const authPromise = new Promise<{ session: any }>((resolve) => {
        const { data: authListener } = this.client.auth.onAuthStateChange(
          (_event, currentSession) => {
            if (currentSession) {
              authListener.subscription.unsubscribe();
              resolve({ session: currentSession });
            }
          }
        );
        // Timeout de sécurité au cas où l'utilisateur n'est vraiment pas connecté
        setTimeout(() => {
          authListener.subscription.unsubscribe();
          resolve({ session: null });
        }, 3000);
      });

      const res = await authPromise;
      session = res.session;
    }

    if (!session) {
      console.warn("PowerSync: Aucune session Supabase active trouvée (utilisateur déconnecté)");
      return null;
    }

    const endpoint = process.env.NEXT_PUBLIC_POWERSYNC_URL;
    if (!endpoint) {
      console.error("PowerSync: NEXT_PUBLIC_POWERSYNC_URL n'est pas défini dans .env");
      return null;
    }

    return {
      endpoint,
      token: session.access_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined
    };
  }

  async uploadData(database: PowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    try {
      for (const op of transaction.crud) {
        const table = op.table;
        const record = op.opData;

        if (op.op === UpdateType.PUT) {
          const { error } = await this.client.from(table).upsert({ id: op.id, ...record });
          if (error) throw error;
        } else if (op.op === UpdateType.PATCH) {
          const { error } = await this.client.from(table).update(record).eq('id', op.id);
          if (error) throw error;
        } else if (op.op === UpdateType.DELETE) {
          const { error } = await this.client.from(table).delete().eq('id', op.id);
          if (error) throw error;
        }
      }
      await transaction.complete();
    } catch (error) {
      console.error("Erreur d'upload vers Supabase :", error);
      throw error;
    }
  }
}