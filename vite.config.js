import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import pkg from './package.json' with { type: 'json' }

// Short commit hash of the build, so the home page footer tells exactly which
// code a device is running (useful for confirming a PWA picked up an update).
// Falls back to 'dev' where git isn't available.
function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appName = env.VITE_APP_NAME || 'MartAdmin';

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_COMMIT__: JSON.stringify(gitCommit()),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          // Precache the build output only. No runtimeCaching entries for
          // Firestore/API calls: inventory data must never be served stale
          // from a Workbox cache — the Firestore SDK already has its own
          // offline persistence for that.
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        },
        manifest: {
          name: appName,
          short_name: appName,
          description: `${appName} inventory management`,
          theme_color: '#863bff',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'firebase';
            }
          },
        },
      },
    },
  };
})
