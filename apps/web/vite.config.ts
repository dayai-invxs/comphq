import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // One .env.local at the repo root already serves the tools, the migrations
  // and the Edge Functions. Vite looks next to the app, so it is pointed at
  // the root rather than the file being kept in two places.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
