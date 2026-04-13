import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const coreSrcDir = fileURLToPath(new URL('../core/src/', import.meta.url))
const mermaidSrcDir = fileURLToPath(new URL('../mermaid/src/', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: '@craft-agent/core', replacement: `${coreSrcDir}index.ts` },
      { find: /^@craft-agent\/core\/(.*)$/, replacement: `${coreSrcDir}$1` },
      { find: '@craft-agent/mermaid', replacement: `${mermaidSrcDir}index.ts` },
      { find: /^@craft-agent\/mermaid\/(.*)$/, replacement: `${mermaidSrcDir}$1` },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
