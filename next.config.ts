import type { NextConfig } from "next";

// Si on builde pour Capacitor/Tauri, on active l'export statique.
// Sur Vercel, on laisse Next.js compiler les fonctions Serverless (/api).
const isStaticExport = process.env.STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: "export" } : {}),

  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

  allowedDevOrigins: ["192.168.1.6"],

  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ui-avatars.com",
      },
    ],
  },
};

export default nextConfig;