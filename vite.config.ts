/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// Allt som sajten själv installerar (peer) eller som site-kit drar in
// (dependencies) byggs inte in i paketet.
const external = [...Object.keys(pkg.peerDependencies), ...Object.keys(pkg.dependencies)]

// @booqy/brand är inte publicerat: källan ligger i src/vendor/brand (kopia av
// customer-front-end/packages/brand/src) och byggs in i paketet, så att
// src/features kan importera '@booqy/brand' precis som i customer-front-end.
const brand = (path: string) => fileURLToPath(new URL(`./src/vendor/brand/${path}`, import.meta.url))

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@booqy\/brand\/styles\.css$/, replacement: brand('styles/index.css') },
      { find: /^@booqy\/brand$/, replacement: brand('index.ts') },
    ],
  },
  define: { __BRAND_VERSION__: JSON.stringify('vendored') },
  // Inga VITE_-variabler bakas in i paketet: sajten ger sina värden via
  // configureSiteKit.
  envPrefix: 'SITE_KIT_BUILD_',
  cacheDir: mode === 'test' ? 'node_modules/.vitest' : 'node_modules/.vite',
  build: {
    lib: {
      entry: { index: 'src/index.ts', testing: 'src/testing.ts', styles: 'src/vendor/styles.ts' },
      formats: ['es'],
      cssFileName: 'site-kit',
    },
    sourcemap: true,
    rolldownOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
}))
