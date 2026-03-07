/**
 * Golden-file tests for the ASCII/Unicode renderer.
 *
 * Ported from AlexanderGrooff/mermaid-ascii cmd/graph_test.go.
 * Each .txt file contains mermaid input above a `---` separator
 * and the expected ASCII/Unicode output below it.
 *
 * Test data: 44 ASCII files + 22 Unicode files = 66 total.
 */
import { describe, it, expect } from 'bun:test'
import { renderMermaidAscii } from '../ascii/index.ts'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Test case parser — matches Go's testutil.ReadTestCase format
// ============================================================================

interface TestCase {
  mermaid: string
  expected: string
  paddingX: number
  paddingY: number
}

/**
 * Parse a golden test file into its components.
 * Format:
 *   [paddingX=N]     (optional)
 *   [paddingY=N]     (optional)
 *   <mermaid code>
 *   ---
 *   <expected output>
 */
function parseTestCase(content: string): TestCase {
  const tc: TestCase = { mermaid: '', expected: '', paddingX: 5, paddingY: 5 }
  const lines = content.split('\n')
  const paddingRegex = /^(?:padding([xy]))\s*=\s*(\d+)\s*$/i

  let inMermaid = true
  let mermaidStarted = false
  const mermaidLines: string[] = []
  const expectedLines: string[] = []

  for (const line of lines) {
    if (line === '---') {
      inMermaid = false
      continue
    }

    if (inMermaid) {
      const trimmed = line.trim()

      // Before mermaid code starts, parse padding directives and skip blanks
      if (!mermaidStarted) {
        if (trimmed === '') continue
        const match = trimmed.match(paddingRegex)
        if (match) {
          const value = parseInt(match[2]!, 10)
          if (match[1]!.toLowerCase() === 'x') {
            tc.paddingX = value
          } else {
            tc.paddingY = value
          }
          continue
        }
      }

      mermaidStarted = true
      mermaidLines.push(line)
    } else {
      expectedLines.push(line)
    }
  }

  tc.mermaid = mermaidLines.join('\n') + '\n'

  // Strip final trailing newline (matches Go's strings.TrimSuffix(expected, "\n"))
  let expected = expectedLines.join('\n')
  if (expected.endsWith('\n')) {
    expected = expected.slice(0, -1)
  }
  tc.expected = expected

  return tc
}

// ============================================================================
// Whitespace normalization — matches Go's testutil.NormalizeWhitespace
// ============================================================================

/**
 * Normalize whitespace for comparison:
 * - Trim trailing spaces from each line
 * - Remove leading/trailing blank lines
 */
function normalizeWhitespace(s: string): string {
  const lines = s.split('\n')
  let normalized = lines.map(l => l.trimEnd())

  // Remove leading blank lines
  while (normalized.length > 0 && normalized[0] === '') {
    normalized.shift()
  }
  // Remove trailing blank lines
  while (normalized.length > 0 && normalized[normalized.length - 1] === '') {
    normalized.pop()
  }

  return normalized.join('\n')
}

/** Replace spaces with middle dots for clearer diff output. */
function visualizeWhitespace(s: string): string {
  return s.replaceAll(' ', '·')
}

// ============================================================================
// Test runner — dynamically loads all golden files from testdata directories
// ============================================================================

function runGoldenTests(dir: string, useAscii: boolean): void {
  const files = readdirSync(dir).filter(f => f.endsWith('.txt')).sort()

  for (const file of files) {
    const testName = file.replace('.txt', '')

    it(testName, () => {
      const content = readFileSync(join(dir, file), 'utf-8')
      const tc = parseTestCase(content)

      const actual = renderMermaidAscii(tc.mermaid, {
        useAscii,
        paddingX: tc.paddingX,
        paddingY: tc.paddingY,
      })

      const normalizedExpected = normalizeWhitespace(tc.expected)
      const normalizedActual = normalizeWhitespace(actual)

      if (normalizedExpected !== normalizedActual) {
        const expectedVis = visualizeWhitespace(normalizedExpected)
        const actualVis = visualizeWhitespace(normalizedActual)
        expect(actualVis).toBe(expectedVis)
      }
    })
  }
}

// ============================================================================
// Test suites
// ============================================================================

const testdataDir = join(import.meta.dir, 'testdata')

describe('ASCII rendering', () => {
  runGoldenTests(join(testdataDir, 'ascii'), true)
})

describe('Unicode rendering', () => {
  runGoldenTests(join(testdataDir, 'unicode'), false)
})

// ============================================================================
// Config behavior tests — ported from Go's TestGraphUseAsciiConfig
// ============================================================================

describe('Config behavior', () => {
  const mermaidInput = 'graph LR\nA --> B'

  it('ASCII and Unicode outputs should differ', () => {
    const asciiOutput = renderMermaidAscii(mermaidInput, { useAscii: true })
    const unicodeOutput = renderMermaidAscii(mermaidInput, { useAscii: false })
    expect(asciiOutput).not.toBe(unicodeOutput)
  })

  it('ASCII output should not contain Unicode box-drawing characters', () => {
    const output = renderMermaidAscii(mermaidInput, { useAscii: true })
    expect(output).not.toContain('┌')
    expect(output).not.toContain('─')
    expect(output).not.toContain('│')
  })

  it('Unicode output should contain Unicode box-drawing characters', () => {
    const output = renderMermaidAscii(mermaidInput, { useAscii: false })
    const hasUnicode = output.includes('┌') || output.includes('─') || output.includes('│')
    expect(hasUnicode).toBe(true)
  })
})
