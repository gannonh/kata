import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DesktopSessionManager } from '../session-manager'

async function writeJsonl(
  filePath: string,
  lines: Array<Record<string, unknown> | string>,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  const content = lines
    .map((line) => (typeof line === 'string' ? line : JSON.stringify(line)))
    .join('\n')

  await fs.writeFile(filePath, content.length ? `${content}\n` : '', 'utf8')
}

describe('DesktopSessionManager', () => {
  let tempDir: string
  let sessionsDir: string
  let workspaceCwd: string

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'kata-desktop-session-manager-'))
    sessionsDir = path.join(tempDir, 'sessions')
    workspaceCwd = path.join(tempDir, 'workspace', 'project')

    await fs.mkdir(sessionsDir, { recursive: true })
    await fs.mkdir(workspaceCwd, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('listSessions returns empty list when sessions directory is missing (ENOENT)', async () => {
    const missingDirectory = path.join(tempDir, 'missing-sessions')
    const manager = new DesktopSessionManager(missingDirectory)

    const result = await manager.listSessions(workspaceCwd)

    expect(result).toEqual({
      sessions: [],
      warnings: [],
      directory: missingDirectory,
    })
  })

  test('listSessions reads headers, filters by cwd, sorts by modified desc, and collects warnings', async () => {
    const manager = new DesktopSessionManager(sessionsDir)

    const olderPath = path.join(
      sessionsDir,
      'session_123e4567-e89b-12d3-a456-426614174000.jsonl',
    )
    await writeJsonl(olderPath, [
      {
        timestamp: '2026-01-01T00:00:00.000Z',
        cwd: path.join(workspaceCwd, 'subdir', '..'),
      },
      { type: 'session_name', sessionName: '  Alpha Session  ' },
      {
        type: 'model_change',
        provider: ' anthropic ',
        modelId: ' claude-sonnet-4-6 ',
      },
      {
        type: 'message',
        message: {
          role: 'user',
          content: '   Hello\nthere   ',
        },
      },
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: 'Acknowledged',
        },
      },
    ])

    const newerPath = path.join(sessionsDir, 'beta.jsonl')
    await writeJsonl(newerPath, [
      {
        id: 'beta-id',
        timestamp: '2026-01-02T00:00:00.000Z',
        cwd: workspaceCwd,
      },
      { type: 'session_info', title: '  Beta   Title  ' },
      {
        type: 'message',
        message: {
          role: 'user',
          content: [
            { text: '  first ' },
            { text: ' second\nline ' },
            { ignored: true },
            null,
          ],
          provider: 'openai',
          model: 'gpt-4o-mini',
        },
      },
    ])

    // Non-matching cwd should be ignored
    await writeJsonl(path.join(sessionsDir, 'different-cwd.jsonl'), [
      {
        id: 'different',
        timestamp: '2026-01-01T00:00:00.000Z',
        cwd: path.join(tempDir, 'elsewhere'),
      },
      {
        type: 'message',
        message: {
          role: 'user',
          content: 'Should not appear',
        },
      },
    ])

    // readHeader first-line edge cases: should silently skip
    await writeJsonl(path.join(sessionsDir, 'empty-first-line.jsonl'), [
      '',
      {
        id: 'later-header',
        timestamp: '2026-01-03T00:00:00.000Z',
        cwd: workspaceCwd,
      },
    ])

    await writeJsonl(path.join(sessionsDir, 'non-object-header.jsonl'), [
      '123',
      {
        type: 'message',
        message: {
          role: 'user',
          content: 'ignored',
        },
      },
    ])

    await writeJsonl(path.join(sessionsDir, 'empty.jsonl'), [])

    // Corrupted header should produce warning
    await writeJsonl(path.join(sessionsDir, 'bad-header.jsonl'), ['{not valid json'])

    // Corrupted body should produce warning (parseSessionFile line error)
    await writeJsonl(path.join(sessionsDir, 'bad-body.jsonl'), [
      {
        id: 'bad-body',
        timestamp: '2026-01-02T00:00:00.000Z',
        cwd: workspaceCwd,
      },
      '{"type":"message","message":{',
    ])

    // Non-file entries should be ignored
    await fs.mkdir(path.join(sessionsDir, 'nested-dir'))
    await writeJsonl(path.join(sessionsDir, 'nested-dir', 'ignored.jsonl'), [
      {
        id: 'nested',
        timestamp: '2026-01-01T00:00:00.000Z',
        cwd: workspaceCwd,
      },
    ])

    // Non-jsonl files should be ignored
    await fs.writeFile(path.join(sessionsDir, 'notes.txt'), 'not a session', 'utf8')

    await fs.utimes(
      olderPath,
      new Date('2026-01-05T10:00:00.000Z'),
      new Date('2026-01-05T10:00:00.000Z'),
    )
    await fs.utimes(
      newerPath,
      new Date('2026-01-06T10:00:00.000Z'),
      new Date('2026-01-06T10:00:00.000Z'),
    )

    const result = await manager.listSessions(path.join(workspaceCwd, '.'))

    expect(result.directory).toBe(sessionsDir)
    expect(result.sessions).toHaveLength(2)

    // Sorted by modified descending
    expect(result.sessions.map((session) => session.id)).toEqual([
      'beta-id',
      '123e4567-e89b-12d3-a456-426614174000',
    ])

    expect(result.sessions[0]).toMatchObject({
      id: 'beta-id',
      path: newerPath,
      name: 'Beta   Title',
      title: 'Beta Title',
      model: 'gpt-4o-mini',
      provider: 'openai',
      created: '2026-01-02T00:00:00.000Z',
      messageCount: 1,
      firstMessagePreview: 'first second line',
    })

    expect(result.sessions[1]).toMatchObject({
      id: '123e4567-e89b-12d3-a456-426614174000',
      path: olderPath,
      name: 'Alpha Session',
      title: 'Alpha Session',
      model: 'anthropic/claude-sonnet-4-6',
      provider: 'anthropic',
      created: '2026-01-01T00:00:00.000Z',
      messageCount: 2,
      firstMessagePreview: 'Hello there',
    })

    expect(result.warnings).toHaveLength(2)
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bad-body.jsonl'),
        expect.stringContaining('bad-header.jsonl'),
      ]),
    )
    expect(result.warnings.join('\n')).toContain('Invalid JSON at line 2')
  })

  test('resolveSessionPathById returns matching session path for workspace-scoped ID', async () => {
    const manager = new DesktopSessionManager(sessionsDir)
    const workspaceA = path.join(tempDir, 'workspace-a')
    const workspaceB = path.join(tempDir, 'workspace-b')

    await fs.mkdir(workspaceA, { recursive: true })
    await fs.mkdir(workspaceB, { recursive: true })

    const targetPath = path.join(sessionsDir, 'target-session.jsonl')
    const otherPath = path.join(sessionsDir, 'other-session.jsonl')

    await writeJsonl(targetPath, [
      {
        id: 'target-session',
        cwd: workspaceA,
      },
    ])

    await writeJsonl(otherPath, [
      {
        id: 'target-session',
        cwd: workspaceB,
      },
    ])

    await expect(manager.resolveSessionPathById('target-session', workspaceA)).resolves.toBe(
      targetPath,
    )
    await expect(manager.resolveSessionPathById('target-session', workspaceB)).resolves.toBe(
      otherPath,
    )
    await expect(manager.resolveSessionPathById('missing', workspaceA)).resolves.toBeNull()
    await expect(manager.resolveSessionPathById('   ', workspaceA)).rejects.toThrow(
      'Session ID is required',
    )
  })

  test('getSessionInfo resolves relative paths and extracts model/provider/token usage from message payload', async () => {
    const manager = new DesktopSessionManager(sessionsDir)
    const filePath = path.join(sessionsDir, 'nested', 'rich-session.jsonl')

    await writeJsonl(filePath, [
      {
        id: 'session-rich',
        cwd: workspaceCwd,
      },
      { type: 'session_info', name: '  My   Session  ' },
      {
        type: 'message',
        message: {
          role: 'user',
          content: [
            { text: '  First\nline  ' },
            { text: ' second\tline ' },
            { noText: 'ignored' },
            null,
          ],
          provider: ' openai ',
          model: ' gpt-4.1 ',
          usage: {
            input: 100,
            output: 50,
            cacheRead: 10,
            cacheWrite: 3,
            totalTokens: 163,
          },
        },
      },
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: 'Done.',
          usage: {
            input: 999,
          },
        },
      },
      {
        type: 'session_stats',
        tokens: {
          input: 1,
          output: 2,
          total: 3,
        },
      },
      {
        type: 'response',
        data: {
          tokens: {
            input: 7,
            output: 8,
            total: 9,
          },
        },
      },
    ])

    const stat = await fs.stat(filePath)

    const info = await manager.getSessionInfo(path.join('nested', 'rich-session.jsonl'))

    expect(info).toEqual({
      id: 'session-rich',
      path: filePath,
      name: 'My   Session',
      title: 'My Session',
      model: 'gpt-4.1',
      provider: 'openai',
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString(),
      messageCount: 2,
      firstMessagePreview: 'First line second line',
      tokenUsage: {
        input: 100,
        output: 50,
        cacheRead: 10,
        cacheWrite: 3,
        total: 163,
      },
    })
  })

  test('getSessionInfo falls back to session_stats then response token usage and extracts id from filename', async () => {
    const manager = new DesktopSessionManager(sessionsDir)

    const fromStatsPath = path.join(
      sessionsDir,
      'stats_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jsonl',
    )
    await writeJsonl(fromStatsPath, [
      {
        cwd: workspaceCwd,
      },
      {
        type: 'session_stats',
        tokens: {
          input: 11,
          output: 7,
          total: 18,
          cacheRead: Number.POSITIVE_INFINITY,
        },
      },
    ])

    const fromResponsePath = path.join(sessionsDir, 'fallback-id.jsonl')
    await writeJsonl(fromResponsePath, [
      {
        cwd: workspaceCwd,
      },
      {
        type: 'session_stats',
        tokens: {
          input: 'NaN',
          output: null,
        },
      },
      {
        type: 'response',
        data: {
          tokens: {
            output: 22,
            totalTokens: 22,
          },
        },
      },
      {
        type: 'message',
        message: {
          role: 'user',
          content: 'hello',
        },
      },
    ])

    const fromStats = await manager.getSessionInfo(fromStatsPath)
    expect(fromStats.id).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(fromStats.tokenUsage).toEqual({
      input: 11,
      output: 7,
      cacheRead: undefined,
      cacheWrite: undefined,
      total: 18,
    })

    const fromResponse = await manager.getSessionInfo(fromResponsePath)
    expect(fromResponse.id).toBe('fallback-id')
    expect(fromResponse.tokenUsage).toEqual({
      input: undefined,
      output: 22,
      cacheRead: undefined,
      cacheWrite: undefined,
      total: 22,
    })
  })

  test('getSessionInfo handles message extraction edge cases and truncates long previews/titles', async () => {
    const manager = new DesktopSessionManager(sessionsDir)

    const longText = `${'word '.repeat(40)}tail`
    const longPath = path.join(sessionsDir, 'long-message.jsonl')

    await writeJsonl(longPath, [
      {
        id: 'long-session',
        cwd: workspaceCwd,
      },
      {
        type: 'message',
        message: {
          role: 'user',
          content: {
            text: 'not-an-array-or-string',
          },
        },
      },
      {
        type: 'message',
        message: {
          role: 'user',
          content: longText,
        },
      },
      {
        type: 'message',
        message: {
          role: 'tool',
          content: 'ignored for count',
        },
      },
    ])

    const longInfo = await manager.getSessionInfo(longPath)

    expect(longInfo.messageCount).toBe(2)
    expect(longInfo.firstMessagePreview).toBeDefined()
    expect(longInfo.firstMessagePreview?.length).toBe(100)
    expect(longInfo.firstMessagePreview?.endsWith('…')).toBe(true)
    expect(longInfo.title).toBe(longInfo.firstMessagePreview)

    const untitledPath = path.join(sessionsDir, 'untitled.jsonl')
    await writeJsonl(untitledPath, [
      {
        cwd: workspaceCwd,
      },
      {
        type: 'message',
        message: {
          role: 'user',
          content: '   \n   ',
        },
      },
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: 'assistant-only preview should not be used',
        },
      },
    ])

    const untitledInfo = await manager.getSessionInfo(untitledPath)
    expect(untitledInfo.title).toBe('Untitled session')
    expect(untitledInfo.firstMessagePreview).toBeNull()
    expect(untitledInfo.tokenUsage).toBeUndefined()
  })

  test('getSessionInfo prevents path traversal and validates required session paths', async () => {
    const manager = new DesktopSessionManager(sessionsDir)

    const insidePath = path.join(sessionsDir, 'inside.jsonl')
    await writeJsonl(insidePath, [
      {
        id: 'inside',
        cwd: workspaceCwd,
      },
    ])

    const outsidePath = path.join(tempDir, 'outside.jsonl')
    await writeJsonl(outsidePath, [
      {
        id: 'outside',
        cwd: workspaceCwd,
      },
    ])

    await expect(manager.getSessionInfo('')).rejects.toThrow('Session path is required')
    await expect(manager.getSessionInfo('   ')).rejects.toThrow('Session path is required')
    await expect(manager.getSessionInfo('../outside.jsonl')).rejects.toThrow(
      'Session path must be inside the sessions directory',
    )
    await expect(manager.getSessionInfo(outsidePath)).rejects.toThrow(
      'Session path must be inside the sessions directory',
    )

    await expect(manager.getSessionInfo(insidePath)).resolves.toMatchObject({
      id: 'inside',
      path: insidePath,
    })
  })

  test('getSessionInfo throws for empty or invalid session JSONL files', async () => {
    const manager = new DesktopSessionManager(sessionsDir)

    const emptyPath = path.join(sessionsDir, 'empty-file.jsonl')
    await writeJsonl(emptyPath, [])
    await expect(manager.getSessionInfo(emptyPath)).rejects.toThrow('Session file is empty')

    const invalidPath = path.join(sessionsDir, 'invalid-line.jsonl')
    await writeJsonl(invalidPath, [
      {
        id: 'invalid',
        cwd: workspaceCwd,
      },
      '{"type":"message"',
    ])

    await expect(manager.getSessionInfo(invalidPath)).rejects.toThrow(
      'Invalid JSON at line 2',
    )
  })
})
