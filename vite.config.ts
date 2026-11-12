import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  // Injected into the bundle so the app can tell one build from the next and
  // replay server history once after an update (see services/app-update.ts).
  define: {
    __BUILD_ID__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [solid()],
  server: {
    port: 5173,
    watch: {
      // The upstream reference snapshot is not part of this app and must never
      // be scanned, watched, or transformed.
      ignored: ['**/original source code/**'],
    },
    fs: { deny: ['original source code/**'] },
  },
  optimizeDeps: {
    // Only scan our entry HTML; otherwise Vite globs the whole workspace,
    // finds the upstream plugin sources, and fails on their dependencies.
    entries: ['index.html'],
  },
  build: { target: 'es2022' },
  test: {
    // vite-plugin-solid defaults this to jsdom; our unit tests are pure logic.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'original source code/**'],
  },
});