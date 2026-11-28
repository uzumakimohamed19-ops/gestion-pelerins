"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { PowerSyncContext } from "@powersync/react";
import { powersync } from "@/lib/powersync/db";
import { SupabaseConnector } from "@/lib/powersync/SupabaseConnector";
import { supabase, getSession } from "@/lib/supabase";

export default function ClientPowerSyncWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const connectorRef = useRef<SupabaseConnector | null>(null);
  const isConnectingRef = useRef(false);
  const reconnectTimersRef = useRef<number[]>([]);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);

  useEffect(() => {
    let isMounted = true;
    let databaseInitialized = false;
    let lastSyncSnapshot = "";
    let removeStatusListener: (() => void) | undefined;

    if (!connectorRef.current) {
      connectorRef.current = new SupabaseConnector(supabase);
    }
    const connector = connectorRef.current;

    const clearReconnectTimers = () => {
      reconnectTimersRef.current.forEach((t) => window.clearTimeout(t));
      reconnectTimersRef.current = [];
    };

    const clearRetryTimer = () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const scheduleReconnectRetry = () => {
      if (!isMounted || !databaseInitialized || retryTimerRef.current !== null) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const delay = Math.min(30000, 1000 * 2 ** retryAttemptRef.current);
      retryAttemptRef.current = Math.min(retryAttemptRef.current + 1, 5);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        void connectToPowerSync();
      }, delay);
    };

    const reportSyncStatus = async (status = powersync.currentStatus) => {
      try {
        const queue = await powersync.getUploadQueueStats();
        const snapshot = {
          connected: status.connected,
          uploading: status.uploading,
          pendingOperations: queue.count,
          lastSyncedAt: status.lastSyncedAt?.toISOString() ?? null,
          uploadError: status.uploadError?.message ?? null,
          downloadError: status.downloadError?.message ?? null,
        };
        const serializedSnapshot = JSON.stringify(snapshot);
        if (serializedSnapshot === lastSyncSnapshot) return;
        lastSyncSnapshot = serializedSnapshot;

        if (snapshot.uploadError || snapshot.downloadError) {
          console.error("[PowerSync] État de synchronisation", snapshot);
        } else {
          console.info("[PowerSync] État de synchronisation", snapshot);
        }
      } catch (error) {
        console.warn("[PowerSync] Impossible de lire l'état de synchronisation :", error);
      }
    };

    const connectToPowerSync = async () => {
      if (!isMounted || !databaseInitialized || isConnectingRef.current || powersync.connected) return;

      try {
        isConnectingRef.current = true;
        const { data: { session } } = await getSession();

        if (!session) {
          console.log("🟡 PowerSync : En attente d'une session utilisateur Supabase...");
          return;
        }

        if (typeof navigator !== "undefined" && !navigator.onLine) return;

        console.log("🔵 PowerSync : Connexion en cours avec le token Supabase...");
        await powersync.connect(connector);
        if (powersync.connected) {
          retryAttemptRef.current = 0;
          clearRetryTimer();
          console.log("🟢 PowerSync : Connecté avec succès au Cloud !");
        } else {
          scheduleReconnectRetry();
        }
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === "AbortOperation")) {
          console.error("🔴 Erreur connexion PowerSync :", err);
          scheduleReconnectRetry();
        }
      } finally {
        isConnectingRef.current = false;
      }
    };

    const reconnectAfterNetworkRecovery = () => {
      if (!isMounted || isConnectingRef.current || powersync.connected) return;

      clearRetryTimer();
      retryAttemptRef.current = 0;
      clearReconnectTimers();
      void connectToPowerSync();

      const t1 = window.setTimeout(() => {
        if (isMounted && !powersync.connected) void connectToPowerSync();
      }, 2000);

      const t2 = window.setTimeout(() => {
        if (isMounted && !powersync.connected) void connectToPowerSync();
      }, 6000);

      reconnectTimersRef.current = [t1, t2];
    };

    const init = async () => {
      const initialization = powersync.init();
      try {
        await Promise.race([
          initialization,
          new Promise<void>((resolve) => window.setTimeout(resolve, 8000)),
        ]);
        if (isMounted) setReady(true);
        await initialization;
        if (!isMounted) return;
        databaseInitialized = true;
        removeStatusListener = powersync.registerListener({
          statusChanged: (status) => {
            void reportSyncStatus(status);
          },
        });
        void reportSyncStatus();
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
      if (document.visibilityState === "visible") void connectToPowerSync();
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Écouteur Capacitor sécurisé (seulement sur plateforme native)
    let appStateListener: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) {
      try {
        void App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) reconnectAfterNetworkRecovery();
        }).then((listener) => {
          if (isMounted) {
            appStateListener = listener;
          } else {
            void listener.remove();
          }
        }).catch(() => {
          /* ignore si non supporté */
        });
      } catch {
        /* ignore si non disponible */
      }
    }

    // Écoute des événements d'authentification Supabase
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      console.log(`ℹ️ Supabase Auth Event : ${event}`);

      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        window.setTimeout(() => {
          void connectToPowerSync();
        }, 0);
      } else if (event === "SIGNED_OUT") {
        window.setTimeout(() => {
          if (!isMounted) return;
          clearRetryTimer();
          clearReconnectTimers();
          isConnectingRef.current = false;
          // Déconnecter ET vider SQLite local pour éviter toute fuite entre comptes agences
          void powersync.disconnectAndClear().then(() => {
            console.log("⚪ PowerSync : Déconnecté et cache local vidé");
          }).catch(() => {
            void powersync.disconnect().catch(() => {});
          });
        }, 0);
      }
    });

    return () => {
      isMounted = false;
      clearRetryTimer();
      clearReconnectTimers();
      removeStatusListener?.();
      authListener.subscription.unsubscribe();
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void appStateListener?.remove();
    };
  }, []);

  // Ne jamais bloquer l'écran de connexion /login derrière l'initialisation SQLite
  // Pendant le démarrage, AppLaunchSplash couvre déjà l'écran au-dessus (z-[9998]) :
  // on rend une surface blanche neutre pour éviter tout doublon ou redémarrage d'animation.
  if (!ready && pathname !== "/login") {
    return <div className="fixed inset-0 bg-white" style={{ backgroundColor: "#FFFFFF" }} />;
  }

  return (
    <PowerSyncContext.Provider value={powersync}>
      {children}
    </PowerSyncContext.Provider>
  );
}