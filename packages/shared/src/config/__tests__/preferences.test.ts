/**
 * Tests for user preferences management
 *
 * These tests verify:
 * - MessageDisplayPreferences interface behavior
 * - Nested object merging logic (as used by updatePreferences)
 * - Default values and edge cases
 *
 * Note: These are pure unit tests that test the merging logic directly,
 * without file I/O, to ensure test isolation.
 */
import { describe, it, expect } from 'bun:test'
import type { UserPreferences, MessageDisplayPreferences, DiffViewerPreferences } from '../preferences'

// ============================================================================
// Merge Logic (mirrors updatePreferences implementation)
// ============================================================================

/**
 * Pure function that implements the same merging logic as updatePreferences
 * This allows us to test the logic without file I/O
 */
function mergePreferences(
  current: UserPreferences,
  updates: Partial<UserPreferences>
): UserPreferences {
  return {
    ...current,
    ...updates,
    // Merge location if provided
    location: updates.location
      ? { ...current.location, ...updates.location }
      : current.location,
    // Merge diffViewer if provided
    diffViewer: updates.diffViewer
      ? { ...current.diffViewer, ...updates.diffViewer }
      : current.diffViewer,
    // Merge messageDisplay if provided
    messageDisplay: updates.messageDisplay
      ? { ...current.messageDisplay, ...updates.messageDisplay }
      : current.messageDisplay,
  }
}

// ============================================================================
// MessageDisplayPreferences Type Tests
// ============================================================================

describe('MessageDisplayPreferences', () => {
  it('should allow expandContent to be true', () => {
    const prefs: MessageDisplayPreferences = { expandContent: true }
    expect(prefs.expandContent).toBe(true)
  })

  it('should allow expandContent to be false', () => {
    const prefs: MessageDisplayPreferences = { expandContent: false }
    expect(prefs.expandContent).toBe(false)
  })

  it('should allow expandContent to be undefined', () => {
    const prefs: MessageDisplayPreferences = {}
    expect(prefs.expandContent).toBeUndefined()
  })
})

// ============================================================================
// Preferences Merging Tests
// ============================================================================

describe('preferences merging logic', () => {
  describe('messageDisplay merging', () => {
    it('should set messageDisplay when none exists', () => {
      const current: UserPreferences = {}
      const updates: Partial<UserPreferences> = {
        messageDisplay: { expandContent: true },
      }

      const result = mergePreferences(current, updates)

      expect(result.messageDisplay).toBeDefined()
      expect(result.messageDisplay?.expandContent).toBe(true)
    })

    it('should merge messageDisplay with existing preferences', () => {
      const current: UserPreferences = {
        name: 'Test User',
        messageDisplay: { expandContent: false },
      }
      const updates: Partial<UserPreferences> = {
        messageDisplay: { expandContent: true },
      }

      const result = mergePreferences(current, updates)

      expect(result.name).toBe('Test User')
      expect(result.messageDisplay?.expandContent).toBe(true)
    })

    it('should preserve messageDisplay when updating other fields', () => {
      const current: UserPreferences = {
        messageDisplay: { expandContent: true },
      }
      const updates: Partial<UserPreferences> = {
        name: 'New Name',
      }

      const result = mergePreferences(current, updates)

      expect(result.name).toBe('New Name')
      expect(result.messageDisplay?.expandContent).toBe(true)
    })

    it('should handle messageDisplay with expandContent false', () => {
      const current: UserPreferences = {}
      const updates: Partial<UserPreferences> = {
        messageDisplay: { expandContent: false },
      }

      const result = mergePreferences(current, updates)

      expect(result.messageDisplay?.expandContent).toBe(false)
    })
  })

  describe('diffViewer and messageDisplay independence', () => {
    it('should merge diffViewer and messageDisplay independently', () => {
      const current: UserPreferences = {
        diffViewer: { diffStyle: 'split' },
        messageDisplay: { expandContent: true },
      }
      const updates: Partial<UserPreferences> = {
        diffViewer: { disableBackground: true },
      }

      const result = mergePreferences(current, updates)

      expect(result.diffViewer?.diffStyle).toBe('split')
      expect(result.diffViewer?.disableBackground).toBe(true)
      expect(result.messageDisplay?.expandContent).toBe(true)
    })

    it('should update messageDisplay without affecting diffViewer', () => {
      const current: UserPreferences = {
        diffViewer: { diffStyle: 'unified', disableBackground: false },
        messageDisplay: { expandContent: false },
      }
      const updates: Partial<UserPreferences> = {
        messageDisplay: { expandContent: true },
      }

      const result = mergePreferences(current, updates)

      expect(result.diffViewer?.diffStyle).toBe('unified')
      expect(result.diffViewer?.disableBackground).toBe(false)
      expect(result.messageDisplay?.expandContent).toBe(true)
    })
  })

  describe('location merging', () => {
    it('should merge location fields', () => {
      const current: UserPreferences = {
        location: { city: 'New York', country: 'USA' },
      }
      const updates: Partial<UserPreferences> = {
        location: { region: 'NY' },
      }

      const result = mergePreferences(current, updates)

      expect(result.location?.city).toBe('New York')
      expect(result.location?.country).toBe('USA')
      expect(result.location?.region).toBe('NY')
    })
  })
})

// ============================================================================
// Default Value Behavior Tests
// ============================================================================

describe('messageDisplay default behavior', () => {
  it('should treat undefined expandContent as expanded (true) in UI', () => {
    // This test documents the expected UI behavior:
    // When expandContent is undefined, UI should default to expanded (true)
    const prefs: MessageDisplayPreferences = {}

    // UI logic: expandContent ?? true (default to expanded)
    const effectiveExpandContent = prefs.expandContent ?? true
    expect(effectiveExpandContent).toBe(true)
  })

  it('should respect explicit false value', () => {
    const prefs: MessageDisplayPreferences = { expandContent: false }

    // UI logic should not override explicit false
    const effectiveExpandContent = prefs.expandContent ?? true
    expect(effectiveExpandContent).toBe(false)
  })

  it('should respect explicit true value', () => {
    const prefs: MessageDisplayPreferences = { expandContent: true }

    const effectiveExpandContent = prefs.expandContent ?? true
    expect(effectiveExpandContent).toBe(true)
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('should handle empty current and empty updates', () => {
    const result = mergePreferences({}, {})
    expect(result).toEqual({})
  })

  it('should handle undefined nested objects in current', () => {
    const current: UserPreferences = { name: 'Test' }
    const updates: Partial<UserPreferences> = {
      messageDisplay: { expandContent: true },
    }

    const result = mergePreferences(current, updates)

    expect(result.name).toBe('Test')
    expect(result.messageDisplay?.expandContent).toBe(true)
  })

  it('should not create messageDisplay when not in updates', () => {
    const current: UserPreferences = {}
    const updates: Partial<UserPreferences> = { name: 'Test' }

    const result = mergePreferences(current, updates)

    expect(result.messageDisplay).toBeUndefined()
  })
})
