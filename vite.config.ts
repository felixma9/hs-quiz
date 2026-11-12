import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BG = '#0e0f13';

export default defineConfig({
  plugins: [
    react(),
    // Installable app with offline play. Everything the site ships (code, card
    // data, frames) is cached on first visit; card art and fonts are cached as
    // they're seen. A new deploy is picked up on the next launch, never mid-game.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'HS Quiz',
        short_name: 'HS Quiz',
        description: 'Hearthstone card quizzes: Gauntlet, HSdle and Quickdraw.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: BG,
        theme_color: BG,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webp,json}'],
        // cards.json is about 2 MB, over Workbox's default limit.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Card art: loaded without CORS, so responses are opaque (status 0).
            urlPattern: ({ url }) => url.hostname === 'art.hearthstonejson.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-art',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60, purgeOnQuotaError: true },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'font-css' },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-files',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  base: './',
});
