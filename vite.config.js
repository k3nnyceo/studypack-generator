import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The API server (server/index.js) holds the Claude API key; the browser
    // only ever talks to /api on the same origin.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
