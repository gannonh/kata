import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const viewerSrcDir = fileURLToPath(new URL('./src/', import.meta.url))
const coreSrcDir = fileURLToPath(new URL('../../packages/core/src/', import.meta.url))
const uiSrcDir = fileURLToPath(new URL('../../packages/ui/src/', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: viewerSrcDir },
      { find: '@craft-agent/core', replacement: `${coreSrcDir}index.ts` },
      { find: /^@craft-agent\/core\/(.*)$/, replacement: `${coreSrcDir}$1` },
      { find: '@craft-agent/ui', replacement: `${uiSrcDir}index.ts` },
      { find: /^@craft-agent\/ui\/(.*)$/, replacement: `${uiSrcDir}$1` },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
