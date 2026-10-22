import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Our own service worker (src/sw.ts) so we can add push handling later.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false, // registered in src/lib/pwa.ts
      manifest: false, // we ship public/manifest.json ourselves
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png,ico,json}'],
        // iOS fetches its own splash screens; no need to precache 11 big PNGs.
        globIgnores: ['icons/splash-*.png', 'icons/icon-1024.png'],
        rollupFormat: 'iife', // classic worker: widest iOS support
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022' },
});
