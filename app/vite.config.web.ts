import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  server: {
    port: 5199,
    strictPort: true
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'strip-csp-frame-ancestors',
      transformIndexHtml(html) {
        return html.replace(/frame-ancestors 'none';?\s*/g, '')
      }
    }
  ]
})
