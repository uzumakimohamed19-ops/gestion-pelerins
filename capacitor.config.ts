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
  },
  plugins: {
    StatusBar: {
      // Permet à l'arrière-plan du header de monter jusqu'en haut de l'écran sans bande blanche
      overlaysWebView: true,
    }
  }
};

export default config;