import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './schema';

export const powersync = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'gestion_pelerins.db',
    disableSSRWarning: true,
    enableMultiTabs: true
  }
});

if (typeof window !== 'undefined') {
  (window as any).powersync = powersync;
}