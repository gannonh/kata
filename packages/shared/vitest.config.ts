import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const coreSrcDir = fileURLToPath(new URL('../core/src/', import.meta.url))
const mermaidSrcDir = fileURLToPath(new URL('../mermaid/src/', import.meta.url))
const sharedSrcDir = fileURLToPath(new URL('./src/', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: '@kata/core', replacement: `${coreSrcDir}index.ts` },
      { find: '@kata/mermaid', replacement: `${mermaidSrcDir}index.ts` },
      { find: '@kata/shared', replacement: `${sharedSrcDir}index.ts` },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
