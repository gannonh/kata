import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { readWorkspaceWorkflowTrackerConfig } from '../workflow-config-reader'

function writePrefs(workspace: string, lines: string[]): void {
  mkdirSync(path.join(workspace, '.kata'), { recursive: true })
  writeFileSync(path.join(workspace, '.kata', 'preferences.md'), lines.join('\n'), 'utf8')
}

describe('readWorkspaceWorkflowTrackerConfig', () => {
  test('returns null config when .kata/preferences.md is missing', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-missing-'))

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)

    expect(result.config).toBeNull()
    expect(result.error).toBeUndefined()
  })

  test('returns linear config when workflow.mode is missing', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-default-linear-'))
    writePrefs(workspace, ['---', 'foo: bar', '---', ''])

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result).toEqual({ config: { kind: 'linear' } })
  })

  test('returns linear config when workflow.mode is linear', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-linear-'))
    writePrefs(workspace, ['---', 'workflow:', '  mode: linear', '---', ''])

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result).toEqual({ config: { kind: 'linear' } })
  })

  test('returns INVALID_CONFIG when github stateMode is omitted', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-github-labels-'))
    writePrefs(
      workspace,
      [
        '---',
        'workflow:',
        '  mode: github',
        'github:',
        '  repoOwner: kata-sh',
        '  repoName: kata-mono',
        '---',
        '',
      ],
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)

    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
  })

  test('returns INVALID_CONFIG when github label mode is requested explicitly', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-github-label-prefix-colon-'))
    writePrefs(
      workspace,
      [
        '---',
        'workflow:',
        '  mode: github',
        'github:',
        '  repoOwner: kata-sh',
        '  repoName: kata-mono',
        '  stateMode: labels',
        '---',
        '',
      ],
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)

    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
    expect(result.error?.message).toBe(
      'GitHub label mode is no longer supported. Use github.stateMode: projects_v2 and set github.githubProjectNumber in .kata/preferences.md.',
    )
  })

  test('returns INVALID_CONFIG when github block is missing in github mode', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-missing-github-block-'))
    writePrefs(workspace, ['---', 'workflow:', '  mode: github', '---', ''])

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
  })

  test('returns INVALID_CONFIG when github repo fields are missing', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-missing-repo-'))
    writePrefs(
      workspace,
      ['---', 'workflow:', '  mode: github', 'github:', '  repoOwner: kata-sh', '---', ''],
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
  })

  test('returns INVALID_CONFIG when githubProjectNumber is invalid', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-invalid-project-'))
    writePrefs(
      workspace,
      [
        '---',
        'workflow:',
        '  mode: github',
        'github:',
        '  repoOwner: kata-sh',
        '  repoName: kata-mono',
        '  githubProjectNumber: nope',
        '---',
        '',
      ],
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
  })

  test('returns INVALID_CONFIG when githubProjectNumber is not an integer', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-decimal-project-'))
    writePrefs(
      workspace,
      [
        '---',
        'workflow:',
        '  mode: github',
        'github:',
        '  repoOwner: kata-sh',
        '  repoName: kata-mono',
        '  githubProjectNumber: 1.5',
        '---',
        '',
      ],
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
  })

  test('returns INVALID_CONFIG when stateMode is invalid', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-invalid-state-mode-'))
    writePrefs(
      workspace,
      [
        '---',
        'workflow:',
        '  mode: github',
        'github:',
        '  repoOwner: kata-sh',
        '  repoName: kata-mono',
        '  stateMode: invalid',
        '---',
        '',
      ],
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
  })

  test('returns UNKNOWN when preferences path cannot be read due to invalid workspace', async () => {
    const workspacePath = path.join(tmpdir(), 'workflow-config-not-a-dir')
    writeFileSync(workspacePath, 'not-a-dir', 'utf8')

    const result = await readWorkspaceWorkflowTrackerConfig(workspacePath)
    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('UNKNOWN')
  })

  test('returns INVALID_CONFIG when projects_v2 mode is missing githubProjectNumber', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-github-projects-state-mode-'))
    writePrefs(
      workspace,
      [
        '---',
        'workflow:',
        '  mode: github',
        'github:',
        '  repoOwner: kata-sh',
        '  repoName: kata-mono',
        '  stateMode: projects_v2',
        '---',
        '',
      ],
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)

    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
  })

  test('parses github projects v2 mode when stateMode and githubProjectNumber are set', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-github-projects-explicit-'))
    writePrefs(
      workspace,
      [
        '---',
        'workflow:',
        '  mode: github',
        'github:',
        '  repoOwner: kata-sh',
        '  repoName: kata-mono',
        '  stateMode: projects_v2',
        '  githubProjectNumber: 7',
        '---',
        '',
      ],
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)

    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({
      kind: 'github',
      repoOwner: 'kata-sh',
      repoName: 'kata-mono',
      stateMode: 'projects_v2',
      githubProjectNumber: 7,
    })
  })

  test('returns INVALID_CONFIG when githubProjectNumber is set without an explicit stateMode', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-github-projects-number-'))
    writePrefs(
      workspace,
      [
        '---',
        'workflow:',
        '  mode: github',
        'github:',
        '  repoOwner: kata-sh',
        '  repoName: kata-mono',
        '  githubProjectNumber: 7',
        '---',
        '',
      ],
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)

    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
    expect(result.error?.message).toBe(
      'github.stateMode is required and must be projects_v2 in .kata/preferences.md. Set github.stateMode: projects_v2 and github.githubProjectNumber to a positive integer.',
    )
  })
})
