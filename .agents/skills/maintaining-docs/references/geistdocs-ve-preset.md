# Visual Explainer Presets

Named presets for generating visual-explainer pages that match specific host environments.

## Geistdocs

For pages intended to be embedded in the Fumadocs-based Kata documentation site at `apps/online-docs/`.

### Fonts

Load via Google Fonts CDN:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
--font-sans: 'Geist', system-ui, -apple-system, sans-serif;
--font-mono: 'Geist Mono', ui-monospace, monospace;
```

### Light Palette (default)

```css
:root {
  --bg: #ffffff;
  --surface: #f8f9fa;
  --surface-2: #f1f3f5;
  --border: #e2e8f0;
  --text: #1a202c;
  --text-muted: #64748b;
  --accent: #2563eb;
  --accent-muted: #3b82f6;
  --code-bg: #f1f5f9;
}
```

### Dark Palette

```css
[data-theme="dark"] {
  --bg: #0a0a0a;
  --surface: #111111;
  --surface-2: #1a1a1a;
  --border: #2a2a2a;
  --text: #ededed;
  --text-muted: #a1a1a1;
  --accent: #3b82f6;
  --accent-muted: #60a5fa;
  --code-bg: #1e1e1e;
}
```

### Mermaid Theme Variables

Light:
```javascript
themeVariables: {
  primaryColor: '#dbeafe',
  primaryTextColor: '#1a202c',
  primaryBorderColor: '#2563eb',
  lineColor: '#64748b',
  secondaryColor: '#f1f5f9',
  tertiaryColor: '#f8f9fa',
  fontFamily: 'Geist, system-ui, sans-serif',
}
```

Dark:
```javascript
themeVariables: {
  primaryColor: '#1e3a5f',
  primaryTextColor: '#ededed',
  primaryBorderColor: '#3b82f6',
  lineColor: '#a1a1a1',
  secondaryColor: '#1a1a1a',
  tertiaryColor: '#111111',
  fontFamily: 'Geist, system-ui, sans-serif',
}
```

### Background Atmosphere

Clean and minimal. No grid dots, no noise patterns, no gradients. Solid `var(--bg)` background. This matches the Fumadocs clean aesthetic.

### Component Styles

```css
/* Cards */
border-radius: 8px;
border: 1px solid var(--border);
background: var(--surface);
padding: 1.25rem;

/* Code blocks */
border-radius: 6px;
background: var(--code-bg);
font-family: var(--font-mono);
font-size: 0.875rem;

/* Section spacing */
gap: 1.5rem; /* between cards */
padding: 2rem; /* page margins */
```

### PostMessage Theme Listener

Include this script in every geistdocs-preset page. It allows the parent Fumadocs iframe host to toggle themes dynamically:

```html
<script>
  // Listen for theme messages from parent Geistdocs frame
  window.addEventListener('message', (event) => {
    if (event.data && event.data.theme) {
      document.documentElement.setAttribute('data-theme', event.data.theme);
    }
  });

  // Fallback: use prefers-color-scheme if no parent message
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!document.documentElement.hasAttribute('data-theme-locked')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
</script>
```
