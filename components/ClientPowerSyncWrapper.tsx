"use client";

import React, { useEffect, useState, useRef } from "react";
import { App } from "@capacitor/app";
import { PowerSyncContext } from "@powersync/react";
import { powersync } from "@/lib/powersync/db";
import { SupabaseConnector } from "@/lib/powersync/SupabaseConnector";
import { supabase } from "@/lib/supabase";

export default function PowerSyncProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const connectorRef = useRef<SupabaseConnector | null>(null);
  const isConnectingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    if (!connectorRef.current) {
      connectorRef.current = new SupabaseConnector(supabase);
    }
    const connector = connectorRef.current;

    const connectToPowerSync = async () => {
      if (!isMounted || isConnectingRef.current || powersync.connected) return;

      try {
        isConnectingRef.current = true;
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.log("🟡 PowerSync : En attente d'une session utilisateur Supabase...");
          return;
        }

        if (typeof navigator !== "undefined" && !navigator.onLine) return;

        console.log("🔵 PowerSync : Connexion en cours avec le token Supabase...");
        await powersync.connect(connector);
        console.log("🟢 PowerSync : Connecté avec succès au Cloud !");
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === "AbortOperation")) {
          console.error("🔴 Erreur connexion PowerSync :", err);
        }
      } finally {
        isConnectingRef.current = false;
      }
    };

    const reconnectAfterNetworkRecovery = () => {
      if (!isMounted || isConnectingRef.current || powersync.connected) return;

      // Le réseau natif peut être rétabli avant que le navigateur WebView
      // ne déclenche l'événement "online".
      void connectToPowerSync();
      window.setTimeout(() => void connectToPowerSync(), 1500);
      window.setTimeout(() => void connectToPowerSync(), 5000);
    };

    const init = async () => {
      try {
        await powersync.init();
        if (isMounted) setReady(true);
        void connectToPowerSync();
      } catch (err) {
        console.error("🔴 Erreur initialisation SQLite locale :", err);
        if (isMounted) setReady(true);
      }
    };

    init();

    const handleOnline = () => {
      reconnectAfterNetworkRecovery();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void connectToPowerSync();
    };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let appStateListener: { remove: () => Promise<void> } | undefined;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) reconnectAfterNetworkRecovery();
    }).then((listener) => {
      if (isMounted) {
        appStateListener = listener;
      } else {
        void listener.remove();
      }
    });

    // Écouter INITIAL_SESSION, SIGNED_IN et TOKEN_REFRESHED
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      console.log(`ℹ️ Supabase Auth Event : ${event}`);

      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        await connectToPowerSync();
      } else if (event === "SIGNED_OUT") {
        try {
          await powersync.disconnect();
          console.log("⚪ PowerSync : Déconnecté");
        } catch {
          /* ignore */
        }
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void appStateListener?.remove();
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-600 font-bold">
        Initialisation de la base locale...
      </div>
    );
  }

  return (
    <PowerSyncContext.Provider value={powersync}>
      {children}
    </PowerSyncContext.Provider>
  );
}