import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Production builds use relative URLs so the same dist/ works at any path,
  // e.g. GitHub Pages (https://<user>.github.io/emu8086-web/) or `npm run preview`.
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/conformance/**/*.test.ts'],
    environment: 'node',
    testTimeout: 600000,
  },
}));
