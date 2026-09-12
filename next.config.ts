import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

  allowedDevOrigins: ["192.168.1.6"],

  images: {
    unoptimized: true, // Requis en mode export : désactive l'optimisation à la volée côté serveur Node.js
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ui-avatars.com",
      },
    ],
  },
};

export default nextConfig;