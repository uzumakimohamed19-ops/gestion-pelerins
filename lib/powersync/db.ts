import { Capacitor } from '@capacitor/core'
import { PowerSyncDatabase } from '@powersync/capacitor'
import { AppSchema } from './schema'
import {
  OfflineWriteBlockedError,
  isAppOffline,
  notifyOfflineWriteBlocked,
} from '@/lib/offlineGuard'

export const powersync = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'gestion_pelerins.db',
    disableSSRWarning: true,
    enableMultiTabs: typeof window !== 'undefined' && Capacitor.getPlatform() === 'web',
  },
})

function isUserMutatingSql(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase()
  const isMutation =
    trimmed.startsWith('INSERT') ||
    trimmed.startsWith('UPDATE') ||
    trimmed.startsWith('DELETE') ||
    trimmed.startsWith('REPLACE')
  if (!isMutation) return false
  // Ne jamais bloquer les tables techniques internes PowerSync (ps_*)
  if (/\bPS_[A-Z0-9_]+/.test(trimmed)) return false
  return true
}

// Garde universelle lecture-seule hors-ligne sur SQLite (modèle WhatsApp) :
// 100 % des lectures (SELECT / useQuery) fonctionnent hors-ligne, mais aucun enregistrement sans réseau.
const originalExecute = powersync.execute.bind(powersync)
powersync.execute = (async (sql: string, parameters?: any[]) => {
  if (isAppOffline() && isUserMutatingSql(sql)) {
    notifyOfflineWriteBlocked('Connectez-vous pour enregistrer')
    throw new OfflineWriteBlockedError()
  }
  return originalExecute(sql, parameters)
}) as typeof powersync.execute

const originalWriteTransaction = powersync.writeTransaction.bind(powersync)
powersync.writeTransaction = (async (callback: any, options?: any) => {
  if (isAppOffline()) {
    notifyOfflineWriteBlocked('Connectez-vous pour enregistrer')
    throw new OfflineWriteBlockedError()
  }
  return originalWriteTransaction(callback, options)
}) as typeof powersync.writeTransaction

if (typeof window !== 'undefined') {
  ;(window as unknown as { powersync: PowerSyncDatabase }).powersync = powersync
}
