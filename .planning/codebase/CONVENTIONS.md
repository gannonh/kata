# Coding Conventions

**Analysis Date:** 2026-01-29

## Naming Patterns

**Files:**
- PascalCase for React components: `App.tsx`, `AppShell.tsx`, `TurnCard.tsx`
- camelCase for utilities and helper functions: `turn-utils.ts`, `tool-parsers.ts`, `file-classification.ts`
- kebab-case for multi-word file names in utility directories
- Index files use explicit naming (`index.ts`) for barrel exports

**Functions:**
- camelCase for all functions: `deriveTurnPhase()`, `groupActivitiesByParent()`, `formatDuration()`
- Prefix with `use` for React hooks: `useTheme()`, `useSession()`, `useEventProcessor()`
- Prefix with `handle` for event handlers: `handleSendMessage()`, `handleOpenFile()`, `handleInputChange()`
- Prefix with `get` for accessor functions: `getLastAssistantTurn()`, `getTurnIntent()`, `getDraft()`
- Prefix with `is` or `has` for boolean checks: `isActivityGroup()`, `hasPendingActivities()`, `hasErrorActivities()`
- Prefix with `format` for formatting utilities: `formatDuration()`, `formatTokens()`, `formatTurnAsMarkdown()`

**Variables:**
- camelCase for all variables: `currentTurn`, `sessionOptions`, `appState`, `sessionDraftsRef`
- Use descriptive names: `pendingPermissions`, `backgroundTasksAtomFamily`, `sessionMetaMapAtom`
- Prefix with `is` or `has` for booleans: `isStreaming`, `isEmpty`, `hasUnread`
- Use `Ref` suffix for refs: `sessionDraftsRef`, `draftSaveTimeoutRef`, `sessionOptionsRef`

**Types:**
- PascalCase for all types and interfaces: `AssistantTurn`, `ActivityItem`, `ResponseContent`
- Use `I` prefix for interfaces (not enforced but used in some places): Type definitions prefer interfaces over naming conventions
- Descriptive names indicating the concept: `TurnPhase`, `ActivityStatus`, `AppState`

## Code Style

**Formatting:**
- ESLint 9+ with flat config format: `apps/electron/eslint.config.mjs`
- TypeScript strict mode enabled
- Indentation: 2 spaces (inferred from codebase)
- Line length: No explicit limit enforced (varies, generally readable)

**Linting:**
- React Hooks rules enforced: `react-hooks/rules-of-hooks` (error), `react-hooks/exhaustive-deps` (warn)
- Custom Craft Agent rules:
  - `craft-agent/no-direct-navigation-state` (error) - Use `navigate()` instead of direct state
  - `craft-agent/no-localstorage` (warn) - Avoid localStorage directly
  - `craft-platform/no-direct-platform-check` (error) - Use platform detection utilities
  - `craft-paths/no-hardcoded-path-separator` (warn) - Use cross-platform path handling
  - `craft-links/no-direct-file-open` (error) - Use link interceptor for file opening

**No Prettier enforced** - ESLint config is the primary formatter

## Import Organization

**Order:**
1. React imports: `import React, { useState, useEffect } from 'react'`
2. Third-party libraries: `import { useSetAtom } from 'jotai'`
3. Type imports: `import type { Session, Message } from '../shared/types'`
4. Absolute path imports (with `@/` alias): `import { useTheme } from '@/hooks/useTheme'`
5. Config imports: `import { DEFAULT_MODEL } from '@config/models'`
6. Relative imports: `import { AppShell } from '@/components/app-shell/AppShell'`

**Path Aliases:**
- `@/` maps to `src/` (in `tsconfig.json`)
- `@config/` maps to configuration files
- `@craft-agent/ui` and `@craft-agent/core` are scoped packages
- No `../../../` chains - use aliases instead

## Error Handling

**Patterns:**
- Use console.error for logging errors: `console.error('Failed to send message:', error)`
- Wrap async operations in try-catch blocks with error messages
- Provide user-facing error messages in UI: Convert technical errors to readable text
- Handle errors gracefully with fallbacks - example from App.tsx:
```typescript
try {
  await window.electronAPI.sendMessage(sessionId, message, ...)
} catch (error) {
  console.error('Failed to send message:', error)
  updateSessionById(sessionId, (s) => ({
    isProcessing: false,
    messages: [...s.messages, {
      id: generateMessageId(),
      role: 'error' as const,
      content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now()
    }]
  }))
}
```
- Use type guards when handling unknown types: `const evt = agentEvent as Record<string, unknown>`
- Provide specific error context: Include variable names and states in error messages

## Logging

**Framework:** console (no logger library)

**Patterns:**
- Use `console.log()` for informational messages
- Use `console.warn()` for warnings: `console.warn('Failed to store attachment "${attachments[i].name}":...)`
- Use `console.error()` for errors: `console.error('Reset failed:', error)`
- Prefix logs with context in brackets for filtering: `[App]`, `[CompactionManager]`
- Example: `console.log('[App] permission_mode_changed:', effect.sessionId, effect.permissionMode)`
- Logs are persistent across codebase - use for debugging and state tracking

## Comments

**When to Comment:**
- Document complex algorithms with step-by-step explanations
- Clarify non-obvious design decisions with "Why" comments
- Mark important state transitions with comments
- Use comments to explain "the gap" states and special cases

**Example patterns:**
```typescript
/**
 * Helper to handle background task events from the agent.
 * Updates the backgroundTasksAtomFamily based on event type.
 * Extracted to avoid code duplication between streaming and non-streaming paths.
 */
function handleBackgroundTaskEvent(...) { ... }

// Handler for when splash exit animation completes
const handleSplashExitComplete = useCallback(() => {
  setSplashHidden(true)
}, [])

// If interrupted, mark any running activities as error and todos as interrupted
if (interrupted) {
  currentTurn.activities = currentTurn.activities.map(activity =>
    activity.status === 'running'
      ? { ...activity, status: 'error' as ActivityStatus, error: 'Interrupted' }
      : activity
  )
}
```

**JSDoc/TSDoc:**
- Used for complex functions and public APIs
- Include `@param` and `@returns` for clarity
- Mark internal functions with internal comments
- Example from turn-utils.ts:
```typescript
/**
 * Groups messages into turns for TurnCard rendering
 *
 * Rules:
 * - User messages flush and start fresh context
 * - Tool messages + intermediate assistant messages belong to current turn
 * - Final assistant message (non-streaming, non-intermediate) flushes the turn
 * - Error/status/info messages are standalone system turns
 */
export function groupMessagesByTurn(messages: Message[]): Turn[] { ... }
```

## Function Design

**Size:**
- Functions average 30-100 lines
- Large functions (>200 lines) like `App.tsx`'s main component extract helpers
- Use extraction to reduce complexity - e.g., `handleBackgroundTaskEvent()` extracted for reuse

**Parameters:**
- Prefer single parameter objects for multiple related params
- Use destructuring for clarity: `{ sessionId, requestId, allowed, alwaysAllow }`
- Type parameters explicitly: `(activities: ActivityItem[]): (ActivityItem | ActivityGroup)[]`

**Return Values:**
- Return tuples for multiple return values: `[value, setter]` from hooks
- Return objects for complex returns: `{ session: updatedSession, effects }`
- Return undefined for optional values, not null
- Provide meaningful types: `Set<string>` not `any`

## Module Design

**Exports:**
- Named exports for utilities: `export function groupMessagesByTurn(messages: Message[]): Turn[]`
- Default exports for components: React components use default export
- Re-export types for public APIs: `export type { ActivityItem }`

**Barrel Files:**
- Index files aggregate related exports: `packages/ui/src/context/index.ts`
- Prevent circular dependencies by careful export ordering
- Re-export from subdirectories for clean imports

## Type Safety

**TypeScript Configuration (`tsconfig.json`):**
- `strict: true` - All strict type checking enabled
- `noUnusedLocals: false`, `noUnusedParameters: false` - Allow unused for flexibility
- `noPropertyAccessFromIndexSignature: false` - Index access allowed
- `verbatimModuleSyntax: true` - Preserve import syntax
- Path aliases for clean imports

**Type Usage:**
- Use `type` keyword for type-only imports: `import type { Message } from '@craft-agent/core'`
- Use `as const` for literal types: `role: 'error' as const`
- Use type guards: `function isActivityGroup(item): item is ActivityGroup { ... }`
- Use discriminated unions for state handling:
```typescript
type Turn = AssistantTurn | UserTurn | SystemTurn | AuthRequestTurn
```

---

*Convention analysis: 2026-01-29*
