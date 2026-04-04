import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    passWithNoTests: true,
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'dist/**',
        // Electron main process entrypoint — requires a running Electron app (app.whenReady, BrowserWindow)
        'src/main/index.ts',
        // IPC handler registration — tightly coupled to Electron's ipcMain which can't be imported outside Electron
        'src/main/ipc.ts',
        // React renderer — components, atoms, hooks are UI layer; covered by future e2e/Playwright tests
        'src/renderer/**',
        // Preload script — runs in Electron's sandboxed preload context with contextBridge
        'src/preload/**',
        // Shared type definitions — no runtime logic to test
        'src/shared/**',
      ],
      thresholds: {
        lines: 90,
        branches: 80,
        functions: 90,
      },
    },
  },
})
