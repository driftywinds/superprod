import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 5173,
    watch: {
      // The upstream reference snapshot is not part of this app and must never
      // be scanned, watched, or transformed.
      ignored: ['**/original source code/**'],
    },
    fs: {
      deny: ['original source code/**'],
    },
  },
  optimizeDeps: {
    // Only scan our entry HTML; otherwise Vite globs the whole workspace,
    // finds the upstream plugin sources, and fails on their dependencies.
    entries: ['index.html'],
  },
  build: { target: 'es2022' },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'original source code/**'],
  },
});