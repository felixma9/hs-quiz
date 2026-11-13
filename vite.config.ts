import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BG = '#0e0f13';

/**
 * A hash of the code and assets that draw cards. Saved miniatures
 * (src/card/mini.ts) are kept until it changes.
 */
function cardDrawVersion(): string {
  const h = createHash('sha1');
  const add = (path: string) => {
    for (const e of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(path, e.name);
      if (e.isDirectory()) add(p);
      else h.update(p).update(readFileSync(p));
    }
  };
  add('src/card');
  add('public/sunwell');
  for (const f of ['src/lib/attributes.ts', 'public/art-crop.json', 'node_modules/sunwell/package.json']) h.update(f).update(readFileSync(f));
  return h.digest('hex').slice(0, 12);
}

export default defineConfig({
  plugins: [
    react(),
    // Installable app with offline play. Everything the site ships (code, card
    // data, frames) is cached on first visit; card art and fonts are cached as
    // they're seen. A new deploy waits until you're on the menu, then reloads
    // into it (src/app/updates.ts), so it never lands mid-game.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'HS Quiz',
        short_name: 'HS Quiz',
        description: 'Hearthstone card quizzes: Gauntlet, Gauntlet PvP, HSdle and CardDB.',
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
        // A new version takes over as soon as it's downloaded (the page decides when to
        // reload into it). The plugin only sets these itself with its own register script.
        skipWaiting: true,
        clientsClaim: true,
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
  resolve: {
    // Sunwell's character splitter is very slow; ours does the same job for card text (src/card/chars.ts).
    alias: { chars: fileURLToPath(new URL('./src/card/chars.ts', import.meta.url)) },
  },
  define: { __CARD_DRAW_VERSION__: JSON.stringify(cardDrawVersion()) },
  base: './',
});
