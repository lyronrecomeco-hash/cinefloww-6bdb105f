import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,webp,woff,woff2}"],
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "tmdb-images",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      manifest: {
        name: "LyneFlix - Filmes e Séries",
        short_name: "LyneFlix",
        description: "Assista filmes e séries online gratuitamente",
        theme_color: "#0f172a",
        background_color: "#0b1120",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        dead_code: true,
        passes: 3,
        booleans_as_integers: true,
        collapse_vars: true,
        reduce_vars: true,
        pure_getters: true,
        unsafe_math: true,
        unsafe_methods: true,
      },
      mangle: {
        toplevel: true,
        properties: {
          regex: /^_private_|^__internal_/,
        },
      },
      format: {
        comments: false,
        ascii_only: true,
      },
    },
    rollupOptions: {
      output: {
        // Split player code into separate chunk for isolation
        manualChunks(id) {
          if (id.includes("usePlayerEngine") || id.includes("EmbedPlayer") || id.includes("UniversalEmbed") || id.includes("PlayerPage") || id.includes("hls.js")) {
            return "player-engine";
          }
        },
        // Hash-based filenames to prevent caching attacks
        chunkFileNames: "assets/[hash:16].js",
        entryFileNames: "assets/[hash:16].js",
        assetFileNames: "assets/[hash:16].[ext]",
      },
    },
    sourcemap: false, // CRITICAL: Never expose source maps in production
  },
}));
