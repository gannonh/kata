import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic'
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/preload/**/*.d.ts',
        'src/renderer/types/**/*.ts',
        'src/renderer/components/application-shell*.tsx',
        'src/renderer/components/shadcnblocks/**/*.tsx',
        'src/renderer/components/ui/avatar.tsx',
        'src/renderer/components/ui/breadcrumb.tsx',
        'src/renderer/components/ui/command.tsx',
        'src/renderer/components/ui/context-menu.tsx',
        'src/renderer/components/ui/dialog.tsx',
        'src/renderer/components/ui/drawer.tsx',
        'src/renderer/components/ui/dropdown-menu.tsx',
        'src/renderer/components/ui/input-group.tsx',
        'src/renderer/components/ui/sheet.tsx',
        'src/renderer/components/ui/sidebar.tsx',
        'src/renderer/components/ui/skeleton.tsx',
        'src/renderer/components/ui/tooltip.tsx',
        'src/renderer/hooks/use-mobile.ts',
        'src/renderer/lib/utils.ts'
      ],
      perFile: true,
      thresholds: {
        statements: 100,
        branches: 95,
        functions: 100,
        lines: 100
      }
    }
  }
})
