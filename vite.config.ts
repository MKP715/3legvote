/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
// Deterministic: the same source must always produce the same files, so CI can check that the
// published build at the repository root is up to date. Bump the version in package.json.
const buildStamp = pkg.version;

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Source lives in src/ (src/index.html is the entry). `npm run build` compiles to dist/ and then
// scripts/publish.mjs copies the finished site to the repository root, because GitHub Pages is
// configured to serve the `main` branch root. A relative base keeps it working at any URL.
export default defineConfig({
  root: here('./src'),
  publicDir: here('./public'),
  base: './',
  define: { __APP_VERSION__: JSON.stringify(buildStamp) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Third Legacy Vote',
        short_name: '3rd Legacy',
        description: 'Run A.A. service elections by the Third Legacy Procedure — in person and virtual.',
        theme_color: '#1d4ed8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  build: {
    outDir: here('./dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    fs: { allow: [here('.')] },
  },
  test: {
    root: here('.'),
    include: ['src/**/*.test.ts'],
  },
});
