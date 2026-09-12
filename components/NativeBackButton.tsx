"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export default function NativeBackButton() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // On n'active l'écouteur que sur Android/iOS natif
    if (!Capacitor.isNativePlatform()) return;

    const backListener = App.addListener("backButton", ({ canGoBack }) => {
      // Définir les pages d'accueil où faire retour doit quitter l'appli
      const rootPages = ["/", "/login", "/agence/dashboard", "/hajj/dashboard"];

      if (rootPages.includes(pathname)) {
        // Si on est sur une page principale, on quitte l'application
        App.exitApp();
      } else if (canGoBack || window.history.length > 1) {
        // Sinon, on recule dans l'historique de navigation Next.js
        router.back();
      } else {
        App.exitApp();
      }
    });

    return () => {
      backListener.then((listener) => listener.remove());
    };
  }, [router, pathname]);

  return null;
}