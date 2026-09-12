"use client";

import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    let isMounted = true;
    const connector = new SupabaseConnector(supabase);

    const initPowerSync = async () => {
      try {
        await powersync.init();
        
        // Vérifier si une session est déjà là
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await powersync.connect(connector);
        }

        if (isMounted) setReady(true);
      } catch (err) {
        console.error("Erreur init PowerSync :", err);
        if (isMounted) setReady(true);
      }
    };

    initPowerSync();

    // Reconnexion automatique dès que l'utilisateur s'authentifie
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        try {
          await powersync.connect(connector);
        } catch (e) {
          console.error("Erreur connexion PowerSync sur event auth :", e);
        }
      } else if (event === "SIGNED_OUT") {
        await powersync.disconnect();
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
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