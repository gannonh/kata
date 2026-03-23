import {
  AuthStorage,
  ModelRegistry,
  SettingsManager,
  SessionManager,
  DefaultPackageManager,
  createAgentSession,
  InteractiveMode,
  runPrintMode,
} from '@mariozechner/pi-coding-agent'
import { readFileSync } from 'node:fs'
import { agentDir, sessionsDir, authFilePath } from './app-paths.js'
import { buildResourceLoader, initResources } from './resource-loader.js'
import { loadStoredEnvKeys, runWizardIfNeeded } from './wizard.js'

// ---------------------------------------------------------------------------
// Lightweight argv parsing — supports subagent spawn flags
// ---------------------------------------------------------------------------

interface CliFlags {
  mode?: 'json' | 'text'
  print?: boolean
  noSession?: boolean
  model?: string
  tools?: string
  appendSystemPrompt?: string
  messages: string[]
}

function parseCliFlags(argv: string[]): CliFlags {
  const result: CliFlags = { messages: [] }
  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--mode' && i + 1 < argv.length) {
      const val = argv[++i]
      if (val === 'json' || val === 'text') result.mode = val
    } else if (arg === '-p' || arg === '--print') {
      result.print = true
    } else if (arg === '--no-session') {
      result.noSession = true
    } else if (arg === '--model' && i + 1 < argv.length) {
      result.model = argv[++i]
    } else if (arg === '--tools' && i + 1 < argv.length) {
      result.tools = argv[++i]
    } else if (arg === '--append-system-prompt' && i + 1 < argv.length) {
      result.appendSystemPrompt = argv[++i]
    } else if (arg === '--extension' && i + 1 < argv.length) {
      i++ // handled by loader.ts
    } else if (arg === '--no-extensions') {
      // handled by loader.ts
    } else if (arg === '--mcp-config' && i + 1 < argv.length) {
      i++ // handled below
    } else if (!arg.startsWith('-')) {
      result.messages.push(arg)
    }
    i++
  }
  return result
}

const cliFlags = parseCliFlags(process.argv.slice(2))
const isPrintMode = cliFlags.mode === 'json' || cliFlags.mode === 'text' || cliFlags.print

// ---------------------------------------------------------------------------
// Auth, model registry, settings
// ---------------------------------------------------------------------------

const authStorage = AuthStorage.create(authFilePath)
loadStoredEnvKeys(authStorage)

// Skip interactive wizard in print/json mode — subagents can't do TTY prompts
if (!isPrintMode) {
  await runWizardIfNeeded(authStorage)
}

const modelRegistry = new ModelRegistry(authStorage)

const settingsManager = SettingsManager.create(agentDir)

// Always ensure defaults: anthropic/claude-sonnet-4-6, thinking off.
// Validates on every startup — catches stale settings from prior installs
// (e.g. grok-2 which no longer exists) and fresh installs with no settings.
const configuredProvider = settingsManager.getDefaultProvider()
const configuredModel = settingsManager.getDefaultModel()
const allModels = modelRegistry.getAll()
const configuredExists = configuredProvider && configuredModel &&
  allModels.some((m) => m.provider === configuredProvider && m.id === configuredModel)

if (!configuredModel || !configuredExists) {
  // Preferred default: anthropic/claude-sonnet-4-6
  const preferred =
    allModels.find((m) => m.provider === 'anthropic' && m.id === 'claude-sonnet-4-6') ||
    allModels.find((m) => m.provider === 'anthropic' && m.id.includes('sonnet')) ||
    allModels.find((m) => m.provider === 'anthropic')
  if (preferred) {
    settingsManager.setDefaultModelAndProvider(preferred.provider, preferred.id)
  }
}

// Default thinking level: off (always reset if not explicitly set)
if (settingsManager.getDefaultThinkingLevel() !== 'off' && !configuredExists) {
  settingsManager.setDefaultThinkingLevel('off')
}

// Quiet startup — the kata extension renders its own branded header
if (!settingsManager.getQuietStartup()) {
  settingsManager.setQuietStartup(true)
}

// Collapse changelog by default — avoid wall of text on updates
if (!settingsManager.getCollapseChangelog()) {
  settingsManager.setCollapseChangelog(true)
}

// Ensure pi-mcp-adapter is in the packages list so pi auto-installs it on startup.
// Bootstrap only when packages have never been configured. If users later remove the
// adapter from settings.json, that opt-out should persist.
const MCP_ADAPTER_PACKAGE = 'npm:pi-mcp-adapter'
const globalSettings = settingsManager.getGlobalSettings()
const globalPackages = [...(globalSettings.packages ?? [])]
const hasConfiguredPackages = Object.prototype.hasOwnProperty.call(globalSettings, "packages")
if (!hasConfiguredPackages && !globalPackages.includes(MCP_ADAPTER_PACKAGE)) {
  settingsManager.setPackages([...globalPackages, MCP_ADAPTER_PACKAGE])
}
await settingsManager.flush()

// ---------------------------------------------------------------------------
// Package commands: install, remove, uninstall, update, list
// ---------------------------------------------------------------------------

const PACKAGE_COMMANDS = ['install', 'remove', 'uninstall', 'update', 'list'] as const
type PackageCommand = 'install' | 'remove' | 'update' | 'list'

const rawArgs = process.argv.slice(2)
const rawCommand = rawArgs[0]

if (rawCommand && (PACKAGE_COMMANDS as readonly string[]).includes(rawCommand)) {
  const command: PackageCommand = rawCommand === 'uninstall' ? 'remove' : rawCommand as PackageCommand
  const rest = rawArgs.slice(1)

  // Parse flags — skip known flag-value pairs injected by loader.ts
  let local = false
  let help = false
  let source: string | undefined
  for (let j = 0; j < rest.length; j++) {
    const arg = rest[j]
    if (arg === '-h' || arg === '--help') help = true
    else if (arg === '-l' || arg === '--local') local = true
    else if (arg === '--mcp-config' || arg === '--model' || arg === '--mode' || arg === '--tools' || arg === '--append-system-prompt' || arg === '--extension') {
      j++ // skip the value
    } else if (arg.startsWith('-')) {
      // unknown flag, ignore
    } else {
      source = arg
    }
  }

  if (help) {
    const name = 'kata'
    switch (command) {
      case 'install':
        console.log(`Usage: ${name} install <source> [-l]\n\nInstall a package and add it to settings.\n  -l, --local    Install project-locally`)
        break
      case 'remove':
        console.log(`Usage: ${name} remove <source> [-l]\n\nRemove a package.\n  -l, --local    Remove from project settings`)
        break
      case 'update':
        console.log(`Usage: ${name} update [source]\n\nUpdate installed packages.\nIf <source> is provided, only that package is updated.`)
        break
      case 'list':
        console.log(`Usage: ${name} list\n\nList installed packages.`)
        break
    }
    process.exit(0)
  }

  const packageManager = new DefaultPackageManager({
    cwd: process.cwd(),
    agentDir,
    settingsManager,
  })

  try {
    switch (command) {
      case 'install': {
        if (!source) { console.error('Error: source is required'); process.exit(1) }
        await packageManager.install(source, { local })
        console.log(`Installed ${source}`)
        break
      }
      case 'remove': {
        if (!source) { console.error('Error: source is required'); process.exit(1) }
        await packageManager.remove(source, { local })
        console.log(`Removed ${source}`)
        break
      }
      case 'update':
        await packageManager.update(source)
        console.log(source ? `Updated ${source}` : 'Updated packages')
        break
      case 'list': {
        const gs = settingsManager.getGlobalSettings()
        const ps = settingsManager.getProjectSettings()
        const gp = (gs.packages ?? []).map((p: string | { source: string }) => typeof p === 'string' ? p : p.source)
        const pp = (ps.packages ?? []).map((p: string | { source: string }) => typeof p === 'string' ? p : p.source)
        if (gp.length > 0) {
          console.log('User packages:')
          for (const p of gp) {
            console.log(`  ${p}`)
            const path = packageManager.getInstalledPath(p, 'user')
            if (path) console.log(`    ${path}`)
          }
        }
        if (pp.length > 0) {
          if (gp.length > 0) console.log()
          console.log('Project packages:')
          for (const p of pp) {
            console.log(`  ${p}`)
            const path = packageManager.getInstalledPath(p, 'project')
            if (path) console.log(`    ${path}`)
          }
        }
        if (gp.length === 0 && pp.length === 0) {
          console.log('No packages installed.')
        }
        break
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Error: ${message}`)
    process.exit(1)
  }
  process.exit(0)
}

const sessionManager = SessionManager.create(process.cwd(), sessionsDir)

// ---------------------------------------------------------------------------
// Resource loader — read --append-system-prompt before reload
// ---------------------------------------------------------------------------

// Skip resource syncing in print mode — subagent processes inherit the
// already-synced ~/.kata-cli/agent/ from the parent. Running initResources()
// concurrently from multiple subagents causes ENOENT race conditions.
if (!isPrintMode) {
  initResources(agentDir)
}

// Read appended system prompt from file if provided (used by subagent spawns)
let appendSystemPromptContent: string | undefined
if (cliFlags.appendSystemPrompt) {
  try {
    appendSystemPromptContent = readFileSync(cliFlags.appendSystemPrompt, 'utf-8')
  } catch {
    process.stderr.write(`[kata] Failed to read --append-system-prompt: ${cliFlags.appendSystemPrompt}\n`)
  }
}

const resourceLoader = buildResourceLoader(agentDir, {
  appendSystemPrompt: appendSystemPromptContent,
})
await resourceLoader.reload()

// Inject --mcp-config flag value into the extension runtime.
// pi-mcp-adapter reads this via pi.getFlag("mcp-config") at session_start.
// Kata doesn't call pi's main() which does the two-pass argv parsing that
// normally populates flagValues, so we must do it manually here.
const mcpConfigPath = process.env.KATA_MCP_CONFIG_PATH
if (mcpConfigPath) {
  const extResult = resourceLoader.getExtensions()
  extResult.runtime.flagValues.set('mcp-config', mcpConfigPath)
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

const { session, extensionsResult } = await createAgentSession({
  authStorage,
  modelRegistry,
  settingsManager,
  sessionManager,
  resourceLoader,
})

if (extensionsResult.errors.length > 0) {
  for (const err of extensionsResult.errors) {
    process.stderr.write(`[kata] Extension load error: ${err.error}\n`)
  }
}

// ---------------------------------------------------------------------------
// Mode routing
// ---------------------------------------------------------------------------

if (isPrintMode) {
  if (cliFlags.messages.length === 0) {
    process.stderr.write('[kata] --print/--mode requires a message argument\n')
    process.exit(2)
  }

  // Apply --model override if provided
  if (cliFlags.model) {
    const match = modelRegistry.getAll().find(
      (m) => `${m.provider}/${m.id}` === cliFlags.model || m.id === cliFlags.model
    )
    if (match) {
      await session.setModel(match)
    }
  }

  // Apply --tools override if provided
  if (cliFlags.tools) {
    const toolNames = cliFlags.tools.split(',').map((t: string) => t.trim()).filter(Boolean)
    if (toolNames.length > 0) {
      session.setActiveToolsByName(toolNames)
    }
  }

  const outputMode = cliFlags.mode ?? 'text'
  await runPrintMode(session, {
    mode: outputMode,
    initialMessage: cliFlags.messages.join(' '),
  })
  // Force exit — extensions (MCP adapter, timers, etc.) may keep the event loop alive
  process.exit(0)
} else {
  const interactiveMode = new InteractiveMode(session)
  await interactiveMode.run()
}
