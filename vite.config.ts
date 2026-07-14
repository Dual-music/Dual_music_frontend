import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      workbox: {
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,ico,png,svg,jpg,jpeg,webp,woff,woff2}"],
        navigateFallback: null,
        navigateFallbackDenylist: [/./],
        importScripts: ["/push-sw.js"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
      manifest: {
        name: "Dual Music - Compétition Musicale Interactive",
        short_name: "Dual Music",
        description: "Participez à des duels musicaux en direct, votez pour vos artistes préférés et vivez des expériences uniques.",
        start_url: "/",
        display: "standalone",
        background_color: "#0a0a0f",
        theme_color: "#8b5cf6",
        orientation: "portrait-primary",
        categories: ["music", "entertainment", "social"],
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        screenshots: [],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
