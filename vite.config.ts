import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

/*
 * Build identity, surfaced in Settings.
 *
 * The commit comes from Vercel when building there and is blank locally,
 * which is enough to tell a deployed build apart from a dev one — and to
 * tell whether a browser is serving a stale service-worker cache.
 */
const APP_VERSION = pkg.version;
const BUILD_SHA = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered by src/pwa/updates.ts instead of the auto-injected script,
      // so we get the registration object and can poll for updates. The
      // injected script never re-checks, which is how a phone stays on an old
      // build indefinitely.
      injectRegister: null,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Journ.ai — AI Travel Planner',
        short_name: 'Journ.ai',
        description: 'Plan multi-day trips with AI assistance',
        theme_color: '#0f0f0f',
        background_color: '#0a0f1a',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        /*
         * Take over immediately instead of waiting for every tab to close.
         * Without this a browser can keep serving the previous build long
         * after a deploy — which is why Chrome held the old layout while
         * Firefox, with no prior worker registered, showed the new one.
         */
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapbox-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
