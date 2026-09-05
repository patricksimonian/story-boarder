/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The desktop shell (src-tauri) loads the dev server at a fixed port and
  // shares this terminal with cargo, so the port must not drift and the
  // screen must not be cleared under its output.
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // The suite shares the machine with the app, a browser, and whatever
    // else is running; contention should slow tests, never fail them.
    testTimeout: 30000,
  },
})
