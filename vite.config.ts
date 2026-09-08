/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// package.json is the one place the version lives: src-tauri/tauri.conf.json
// points at it, the page gets it here, and the release workflow refuses a
// tag that disagrees with it.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The desktop shell (src-tauri) loads the dev server at a fixed port and
  // shares this terminal with cargo, so the port must not drift and the
  // screen must not be cleared under its output.
  clearScreen: false,
  // cargo writes under src-tauri/target while this server runs; a watch
  // on a DLL mid-write fails with EBUSY and takes the server down with it.
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // The suite shares the machine with the app, a browser, and whatever
    // else is running; contention should slow tests, never fail them.
    testTimeout: 30000,
  },
})
