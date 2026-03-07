import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * Manages isolated test workspace directories for e2e tests.
 * Each test gets a fresh workspace to avoid state pollution.
 */
export class TestWorkspace {
  private baseDir: string
  private workspaceDir: string

  constructor(testName: string) {
    this.baseDir = path.join(os.homedir(), '.kata-agents-test')
    this.workspaceDir = path.join(this.baseDir, testName.replace(/\s+/g, '-'))
  }

  /**
   * Set up clean test workspace before test
   */
  async setup(): Promise<string> {
    // Clean up any existing test workspace
    await this.cleanup()

    // Create fresh directory structure
    fs.mkdirSync(this.workspaceDir, { recursive: true })
    fs.mkdirSync(path.join(this.workspaceDir, 'workspaces'), { recursive: true })
    fs.mkdirSync(path.join(this.workspaceDir, 'sessions'), { recursive: true })

    return this.workspaceDir
  }

  /**
   * Clean up test workspace after test
   */
  async cleanup(): Promise<void> {
    if (fs.existsSync(this.workspaceDir)) {
      fs.rmSync(this.workspaceDir, { recursive: true, force: true })
    }
  }

  /**
   * Get the workspace directory path
   */
  getPath(): string {
    return this.workspaceDir
  }

  /**
   * Create a mock workspace configuration
   */
  createMockWorkspace(name: string): void {
    const workspacePath = path.join(this.workspaceDir, 'workspaces', name)
    fs.mkdirSync(workspacePath, { recursive: true })

    const config = {
      name,
      createdAt: new Date().toISOString(),
      settings: {}
    }

    fs.writeFileSync(
      path.join(workspacePath, 'config.json'),
      JSON.stringify(config, null, 2)
    )
  }
}

/**
 * Helper to get test workspace environment variables
 */
export function getTestEnv(workspacePath: string): Record<string, string> {
  return {
    KATA_HOME: workspacePath,
    KATA_TEST_MODE: '1',
    NODE_ENV: 'test'
  }
}
