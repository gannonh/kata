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
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    passWithNoTests: true,
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
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
        // MCP service currently contains dormant deep-inspection transport code that is not
        // executed by the active Desktop MCP architecture (config-only validation in main process).
        // Connection/runtime behavior is exercised via CLI/pi-mcp-adapter integration surfaces.
        'src/main/mcp-service.ts',
      ],
      thresholds: {
        lines: 90,
        branches: 80,
        functions: 90,
      },
    },
  },
})
