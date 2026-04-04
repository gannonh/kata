import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { readWorkspaceWorkflowTrackerConfig } from '../workflow-config-reader'

describe('readWorkspaceWorkflowTrackerConfig', () => {
  test('returns null config when WORKFLOW.md is missing', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-missing-'))

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)

    expect(result.config).toBeNull()
    expect(result.error).toBeUndefined()
  })

  test('returns INVALID_CONFIG when frontmatter is malformed', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-malformed-'))
    writeFileSync(path.join(workspace, 'WORKFLOW.md'), '# no frontmatter\n', 'utf8')

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)

    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
  })

  test('parses github label mode tracker config', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-github-labels-'))
    writeFileSync(
      path.join(workspace, 'WORKFLOW.md'),
      [
        '---',
        'tracker:',
        '  kind: github',
        '  repo_owner: kata-sh',
        '  repo_name: kata-mono',
        '  label_prefix: symphony',
        '---',
        '',
      ].join('\n'),
      'utf8',
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)

    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({
      kind: 'github',
      repoOwner: 'kata-sh',
      repoName: 'kata-mono',
      stateMode: 'labels',
      labelPrefix: 'symphony',
    })
  })

  test('parses github projects v2 mode tracker config', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-github-projects-'))
    mkdirSync(workspace, { recursive: true })
    writeFileSync(
      path.join(workspace, 'WORKFLOW.md'),
      [
        '---',
        'tracker:',
        '  kind: github',
        '  repo_owner: kata-sh',
        '  repo_name: kata-mono',
        '  github_project_number: 7',
        '---',
        '',
      ].join('\n'),
      'utf8',
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)

    expect(result.error).toBeUndefined()
    expect(result.config).toEqual({
      kind: 'github',
      repoOwner: 'kata-sh',
      repoName: 'kata-mono',
      stateMode: 'projects_v2',
      githubProjectNumber: 7,
      labelPrefix: undefined,
    })
  })
})
