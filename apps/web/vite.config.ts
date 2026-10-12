/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // Reachable from phones on the same Wi-Fi, so printed QR stickers can be scanned in dev.
    host: true,
    proxy: {
      // ws: the realtime socket lives at /api/socket.io.
      '/api': { target: 'http://localhost:3000', ws: true },
      // Stickers point at <this origin>/qr/, as nginx serves it in production.
      '/qr': { target: 'http://localhost:5174', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Whole screens render in these tests; parallel runs on a busy machine need headroom.
    testTimeout: 20_000,
    // Match Testing Library's asyncUtilTimeout (src/test/setup.ts); the 1 s default flakes under load.
    expect: { poll: { timeout: 5000 } },
  },
});
