import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { loadPromptTemplates, interpolateVariables, clearTemplateCache } from '../template-loader'
import { DOC_REFS } from '../../docs/index.ts'
import { PERMISSION_MODE_CONFIG } from '../../agent/mode-types.ts'

const TEST_DIR = join(import.meta.dir, '__fixtures__', 'templates')

beforeEach(() => {
  clearTemplateCache()
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('interpolateVariables', () => {
  test('replaces simple variables', () => {
    const template = 'Hello {{name}}, welcome to {{app}}'
    const result = interpolateVariables(template, { name: 'User', app: 'Kata' })
    expect(result).toBe('Hello User, welcome to Kata')
  })

  test('leaves unknown variables as-is', () => {
    const template = 'Hello {{name}}, {{unknown}}'
    const result = interpolateVariables(template, { name: 'User' })
    expect(result).toBe('Hello User, {{unknown}}')
  })

  test('handles dotted variable names', () => {
    const template = 'Read {{DOC_REFS.sources}} for docs'
    const result = interpolateVariables(template, { 'DOC_REFS.sources': '/path/to/sources.md' })
    expect(result).toBe('Read /path/to/sources.md for docs')
  })

  test('handles empty template', () => {
    expect(interpolateVariables('', {})).toBe('')
  })
})

describe('loadPromptTemplates', () => {
  test('loads and concatenates sections from manifest', () => {
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify({
      sections: [
        { file: 'a.md', required: true },
        { file: 'b.md' },
      ]
    }))
    writeFileSync(join(TEST_DIR, 'a.md'), 'Section A content')
    writeFileSync(join(TEST_DIR, 'b.md'), 'Section B content')

    const result = loadPromptTemplates(TEST_DIR, {})
    expect(result).toContain('Section A content')
    expect(result).toContain('Section B content')
    // Sections separated by double newline
    expect(result).toBe('Section A content\n\nSection B content')
  })

  test('interpolates variables in loaded sections', () => {
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify({
      sections: [{ file: 'a.md' }]
    }))
    writeFileSync(join(TEST_DIR, 'a.md'), 'Path: {{workspacePath}}')

    const result = loadPromptTemplates(TEST_DIR, { workspacePath: '/home/user' })
    expect(result).toBe('Path: /home/user')
  })

  test('throws if required section is missing', () => {
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify({
      sections: [{ file: 'missing.md', required: true }]
    }))

    expect(() => loadPromptTemplates(TEST_DIR, {})).toThrow('missing.md')
  })

  test('skips optional missing sections', () => {
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify({
      sections: [
        { file: 'a.md' },
        { file: 'missing.md' },
      ]
    }))
    writeFileSync(join(TEST_DIR, 'a.md'), 'Section A')

    const result = loadPromptTemplates(TEST_DIR, {})
    expect(result).toBe('Section A')
  })

  test('caches loaded templates for same directory', () => {
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify({
      sections: [{ file: 'a.md' }]
    }))
    writeFileSync(join(TEST_DIR, 'a.md'), 'Original')

    const result1 = loadPromptTemplates(TEST_DIR, {})
    // Modify file after first load
    writeFileSync(join(TEST_DIR, 'a.md'), 'Modified')
    const result2 = loadPromptTemplates(TEST_DIR, {})

    // Should return cached version
    expect(result1).toBe(result2)
  })
})

describe('production templates', () => {
  const templatesDir = resolve(import.meta.dir, '..', 'templates')

  test('loads all production template sections', () => {
    clearTemplateCache()
    const variables: Record<string, string> = {
      workspacePath: '/test/workspace',
      workspaceId: 'test-ws',
      'DOC_REFS.sources': DOC_REFS.sources,
      'DOC_REFS.permissions': DOC_REFS.permissions,
      'DOC_REFS.skills': DOC_REFS.skills,
      'DOC_REFS.themes': DOC_REFS.themes,
      'DOC_REFS.statuses': DOC_REFS.statuses,
      'DOC_REFS.labels': DOC_REFS.labels,
      'DOC_REFS.toolIcons': DOC_REFS.toolIcons,
      'DOC_REFS.mermaid': DOC_REFS.mermaid,
      'PERMISSION_MODE.safe': PERMISSION_MODE_CONFIG['safe'].displayName,
      'PERMISSION_MODE.ask': PERMISSION_MODE_CONFIG['ask'].displayName,
      'PERMISSION_MODE.allowAll': PERMISSION_MODE_CONFIG['allow-all'].displayName,
    }

    const result = loadPromptTemplates(templatesDir, variables)
    // Should contain key sections
    expect(result).toContain('Kata Agents')
    expect(result).toContain('External Sources')
    expect(result).toContain('Permission Modes')
    expect(result).toContain('/test/workspace')
    // Should not have unresolved variables
    expect(result).not.toMatch(/\{\{workspacePath\}\}/)
    expect(result).not.toMatch(/\{\{DOC_REFS\./)
  })
})
