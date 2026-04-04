import { mkdtempSync, writeFileSync } from 'node:fs'
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

  test('returns linear config when tracker is missing or non-github', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-linear-'))
    writeFileSync(
      path.join(workspace, 'WORKFLOW.md'),
      ['---', 'tracker:', '  kind: linear', '---', ''].join('\n'),
      'utf8',
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result).toEqual({ config: { kind: 'linear' } })
  })

  test('returns INVALID_CONFIG when github repo fields are missing', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-missing-repo-'))
    writeFileSync(
      path.join(workspace, 'WORKFLOW.md'),
      ['---', 'tracker:', '  kind: github', '---', ''].join('\n'),
      'utf8',
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
  })

  test('returns INVALID_CONFIG when github_project_number is invalid', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-invalid-project-'))
    writeFileSync(
      path.join(workspace, 'WORKFLOW.md'),
      ['---', 'tracker:', '  kind: github', '  repo_owner: kata-sh', '  repo_name: kata-mono', '  github_project_number: nope', '---', ''].join('\n'),
      'utf8',
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('INVALID_CONFIG')
  })

  test('preserves quoted values containing hash characters', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-hash-value-'))
    writeFileSync(
      path.join(workspace, 'WORKFLOW.md'),
      [
        '---',
        'tracker:',
        '  kind: github',
        '  repo_owner: kata-sh',
        '  repo_name: kata-mono',
        "  label_prefix: 'sym#flow'",
        '---',
        '',
      ].join('\n'),
      'utf8',
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result.config).toMatchObject({
      kind: 'github',
      stateMode: 'labels',
      labelPrefix: 'sym#flow',
    })
  })

  test('strips inline comments from unquoted values but keeps hashes inside double quotes', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-inline-comment-'))
    writeFileSync(
      path.join(workspace, 'WORKFLOW.md'),
      [
        '---',
        'tracker:',
        '  kind: github',
        '  repo_owner: kata-sh',
        '  repo_name: kata-mono',
        '  label_prefix: "sym#flow" # inline comment',
        '---',
        '',
      ].join('\n'),
      'utf8',
    )

    const result = await readWorkspaceWorkflowTrackerConfig(workspace)
    expect(result.config).toMatchObject({
      kind: 'github',
      stateMode: 'labels',
      labelPrefix: 'sym#flow',
    })
  })

  test('returns UNKNOWN when WORKFLOW path cannot be read due to invalid workspace', async () => {
    const workspacePath = path.join(tmpdir(), 'workflow-config-not-a-dir')
    writeFileSync(workspacePath, 'not-a-dir', 'utf8')

    const result = await readWorkspaceWorkflowTrackerConfig(workspacePath)
    expect(result.config).toBeNull()
    expect(result.error?.code).toBe('UNKNOWN')
  })

  test('parses github projects v2 mode tracker config', async () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'workflow-config-github-projects-'))
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
