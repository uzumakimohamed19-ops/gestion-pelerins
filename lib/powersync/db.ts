import { Capacitor } from '@capacitor/core';
import { PowerSyncDatabase } from '@powersync/capacitor';
import { AppSchema } from './schema';

export const powersync = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'gestion_pelerins.db',
    disableSSRWarning: true,
    enableMultiTabs: Capacitor.getPlatform() === 'web'
  }
});

if (typeof window !== 'undefined') {
  (window as any).powersync = powersync;
}