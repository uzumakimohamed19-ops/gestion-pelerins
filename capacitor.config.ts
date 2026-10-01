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
      // Épouse le haut de l'écran sans créer d'espace blanc artificiel
      overlaysWebView: true,
    },
    NavigationBar: {
      // Empêche le bas de l'application de passer sous les boutons virtuels Android
      overlay: false,
    }
  }
};

export default config;