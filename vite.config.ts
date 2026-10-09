import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' damit der Build auch aus einem Unterordner / per file-Server läuft
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: { host: true, port: 5173 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
