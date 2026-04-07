/**
 * Shared Shiki theme registration for @pierre/diffs.
 *
 * Registers transparent-bg variants of pierre's built-in themes so the app's
 * CSS variable (--background) shows through. Imported by both ShikiDiffViewer
 * and MarkdownDiffBlock — the guard ensures registration happens only once.
 */
import { DIFFS_TAG_NAME, registerCustomTheme, resolveTheme } from '@pierre/diffs'

// Register the diffs-container custom element if not already registered.
if (typeof HTMLElement !== 'undefined' && !customElements.get(DIFFS_TAG_NAME)) {
  class FileDiffContainer extends HTMLElement {
    constructor() {
      super()
      if (this.shadowRoot != null) return
      this.attachShadow({ mode: 'open' })
    }
  }
  customElements.define(DIFFS_TAG_NAME, FileDiffContainer)
}

let registered = false

export function ensureThemesRegistered(): void {
  if (registered) return
  registered = true

  registerCustomTheme('kata-dark', async () => {
    const theme = await resolveTheme('pierre-dark')
    return { ...theme, name: 'kata-dark', bg: 'transparent', colors: { ...theme.colors, 'editor.background': 'transparent' } }
  })
  registerCustomTheme('kata-light', async () => {
    const theme = await resolveTheme('pierre-light')
    return { ...theme, name: 'kata-light', bg: 'transparent', colors: { ...theme.colors, 'editor.background': 'transparent' } }
  })
}

// Auto-register on import
ensureThemesRegistered()
