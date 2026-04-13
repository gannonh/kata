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
    alias: [
      { find: '@', replacement: path.join(rootDir, 'src/renderer') },
      { find: '@shared', replacement: path.join(rootDir, 'src/shared') },
      { find: /^@kata\/core$/, replacement: path.join(rootDir, '../../packages/core/src/index.ts') },
      { find: '@kata/core/', replacement: path.join(rootDir, '../../packages/core/src/') },
      { find: /^@kata\/shared$/, replacement: path.join(rootDir, '../../packages/shared/src/index.ts') },
      { find: '@kata/shared/', replacement: path.join(rootDir, '../../packages/shared/src/') },
      { find: /^@kata\/ui$/, replacement: path.join(rootDir, '../../packages/ui/src/index.ts') },
      { find: '@kata/ui/', replacement: path.join(rootDir, '../../packages/ui/src/') },
      { find: /^@kata\/mermaid$/, replacement: path.join(rootDir, '../../packages/mermaid/src/index.ts') },
      { find: '@kata/mermaid/', replacement: path.join(rootDir, '../../packages/mermaid/src/') },
    ],
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
