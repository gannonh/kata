import { DefaultResourceLoader } from '@mariozechner/pi-coding-agent'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolves to the bundled src/resources/ inside the npm package at runtime:
//   dist/resource-loader.js → .. → package root → src/resources/
const resourcesDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'resources')
const bundledExtensionsDir = join(resourcesDir, 'extensions')

/**
 * Syncs all bundled resources to agentDir (~/.kata-cli/agent/) on every launch.
 *
 * - extensions/ → ~/.kata-cli/agent/extensions/   (always overwrite)
 * - agents/     → ~/.kata-cli/agent/agents/        (always overwrite)
 * - AGENTS.md   → ~/.kata-cli/agent/AGENTS.md      (always overwrite)
 * - KATA-WORKFLOW.md is read directly from bundled path via KATA_WORKFLOW_PATH env var
 *
 * Always-overwrite ensures updates take effect immediately.
 */
export function initResources(agentDir: string): void {
  mkdirSync(agentDir, { recursive: true })

  // Sync extensions — always overwrite so updates land on next launch
  const destExtensions = join(agentDir, 'extensions')
  cpSync(bundledExtensionsDir, destExtensions, { recursive: true, force: true })

  // Sync agents
  const destAgents = join(agentDir, 'agents')
  const srcAgents = join(resourcesDir, 'agents')
  if (existsSync(srcAgents)) {
    cpSync(srcAgents, destAgents, { recursive: true, force: true })
  }

  // Sync skills — always overwrite so updates land on next launch
  const destSkills = join(agentDir, 'skills')
  const srcSkills = join(resourcesDir, 'skills')
  if (existsSync(srcSkills)) {
    cpSync(srcSkills, destSkills, { recursive: true, force: true })
  }

  // Sync AGENTS.md
  const srcAgentsMd = join(resourcesDir, 'AGENTS.md')
  const destAgentsMd = join(agentDir, 'AGENTS.md')
  if (existsSync(srcAgentsMd)) {
    writeFileSync(destAgentsMd, readFileSync(srcAgentsMd))
  }
}

/**
 * Constructs a DefaultResourceLoader with no additionalExtensionPaths.
 * Extensions are synced to agentDir by initResources() and pi auto-discovers
 * them from ~/.kata-cli/agent/extensions/ via its normal agentDir scan.
 */
export function buildResourceLoader(agentDir: string): DefaultResourceLoader {
  return new DefaultResourceLoader({ agentDir })
}
