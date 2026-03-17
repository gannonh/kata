/**
 * ESLint Configuration for Electron App
 *
 * Extends root monorepo config, then adds Electron-specific rules.
 * Uses flat config format (ESLint 9+).
 * Includes custom navigation rule to enforce navigate() usage.
 */

import rootConfig from '../../eslint.config.mjs'
import tsParser from '@typescript-eslint/parser'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import noDirectNavigationState from './eslint-rules/no-direct-navigation-state.cjs'
import noLocalStorage from './eslint-rules/no-localstorage.cjs'
import noDirectPlatformCheck from './eslint-rules/no-direct-platform-check.cjs'
import noHardcodedPathSeparator from './eslint-rules/no-hardcoded-path-separator.cjs'
import noDirectFileOpen from './eslint-rules/no-direct-file-open.cjs'

export default [
  // Root monorepo config (shared rules)
  ...rootConfig,

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'release/**',
      '*.cjs',
      'eslint-rules/**',
    ],
  },

  // TypeScript/React files
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      // Custom plugin for Craft Agent rules
      'craft-agent': {
        rules: {
          'no-direct-navigation-state': noDirectNavigationState,
          'no-localstorage': noLocalStorage,
        },
      },
      // Custom plugin for platform detection rules
      'craft-platform': {
        rules: {
          'no-direct-platform-check': noDirectPlatformCheck,
        },
      },
      // Custom plugin for cross-platform path rules
      'craft-paths': {
        rules: {
          'no-hardcoded-path-separator': noHardcodedPathSeparator,
        },
      },
      // Custom plugin for link interceptor enforcement
      'craft-links': {
        rules: {
          'no-direct-file-open': noDirectFileOpen,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Custom Craft Agent rules
      'craft-agent/no-direct-navigation-state': 'error',
      'craft-agent/no-localstorage': 'warn',

      // Custom platform detection rule
      'craft-platform/no-direct-platform-check': 'error',

      // Custom cross-platform path rule
      'craft-paths/no-hardcoded-path-separator': 'warn',

      // Custom link interceptor rule — prevents bypassing in-app file preview
      'craft-links/no-direct-file-open': 'error',
    },
  },
]
