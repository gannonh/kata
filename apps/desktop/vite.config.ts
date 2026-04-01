import { fileURLToPath } from 'node:url'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: path.join(rootDir, 'src/renderer'),
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src/renderer'),
      '@shared': path.join(rootDir, 'src/shared'),
      '@kata-ui': path.join(rootDir, '../../packages/ui/src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: path.join(rootDir, 'dist/renderer'),
    emptyOutDir: true,
  },
})
