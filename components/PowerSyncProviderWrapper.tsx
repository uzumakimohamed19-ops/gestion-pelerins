"use client";

import React, { useEffect, useState, useRef } from "react";
import { PowerSyncContext } from "@powersync/react";
import { powersync } from "@/lib/powersync/db";
import { SupabaseConnector } from "@/lib/powersync/SupabaseConnector";
import { supabase, getSession } from "@/lib/supabase";
import { Lock } from "lucide-react";

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
        const { data: { session } } = await getSession();

        if (!session) {
          return;
        }

        if (typeof navigator !== "undefined" && !navigator.onLine) return;

        await powersync.connect(connector);
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === "AbortOperation")) {
          console.error("🔴 Erreur connexion PowerSync :", err);
        }
      } finally {
        isConnectingRef.current = false;
      }
    };

    const initPowerSync = async () => {
      try {
        // Timeout de sécurité : débloque l'UI au bout de 7s max même si SQLite tarde
        await Promise.race([
          powersync.init(),
          new Promise<void>((resolve) => window.setTimeout(resolve, 7000)),
        ]);

        if (isMounted) setReady(true);
        void connectToPowerSync();
      } catch (err) {
        console.error("Erreur init PowerSync :", err);
        if (isMounted) setReady(true);
      }
    };

    void initPowerSync();

    // Reconnexion intelligente au retour du réseau ou de l'onglet
    const handleOnline = () => {
      void connectToPowerSync();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void connectToPowerSync();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    // Écoute des événements d'authentification Supabase
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        await connectToPowerSync();
      } else if (event === "SIGNED_OUT") {
        isConnectingRef.current = false;
        try {
          await powersync.disconnect();
        } catch {
          /* ignore */
        }
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  if (!ready) {
    return (
      <main className="fixed inset-0 z-50 bg-[#F4F6F8] flex flex-col items-center justify-center p-6 select-none">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-blue-500/15 blur-2xl animate-pulse" />

          <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-dashed border-blue-200 animate-[spin_8s_linear_infinite] flex items-center justify-center">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-600 shadow-lg shadow-blue-600/50" />
            <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-400" />
            <div className="absolute -bottom-1.5 left-1/3 w-3 h-3 rounded-full bg-blue-500" />
            <div className="absolute top-1/3 -left-1.5 w-2 h-2 rounded-full bg-blue-300" />
          </div>

          <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-t-blue-600 border-r-blue-400 border-b-transparent border-l-transparent animate-[spin_1.5s_linear_infinite]" />
          <div className="absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-blue-400/40 animate-ping opacity-60" />

          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white shadow-xl shadow-blue-900/10 border border-blue-50 flex items-center justify-center">
            <Lock className="text-blue-600 animate-pulse" size={24} />
            <div className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
          </div>
        </div>

        <p className="mt-8 text-xs font-black uppercase tracking-widest text-slate-500">
          Vérification de session...
        </p>

        <div className="mt-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
        </div>
      </main>
    );
  }

  return (
    <PowerSyncContext.Provider value={powersync}>
      {children}
    </PowerSyncContext.Provider>
  );
}