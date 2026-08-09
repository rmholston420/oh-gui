/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local Agent Server proxy: keep the browser on Vite's origin and avoid a CORS dependency.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  test: {
    // Default 'node'. jsdom 30 pulls an undici that requires Node >=22.14 and
    // crashes on Node 20 with "webidl.util.markAsUncloneable is not a function".
    // The import-boundary gate needs no DOM, so it must not depend on jsdom.
    // Component tests opt in per-file with:  // @vitest-environment jsdom
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
