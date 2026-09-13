import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agencepro.app',
  appName: 'Agence Pro',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      'gestion-pelerins.vercel.app',
      'api.ocr.space'
    ]
  }
};

export default config;