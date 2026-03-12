import {
  AuthStorage,
  ModelRegistry,
  SettingsManager,
  SessionManager,
  createAgentSession,
  InteractiveMode,
} from '@mariozechner/pi-coding-agent'
import { agentDir, sessionsDir, authFilePath } from './app-paths.js'
import { buildResourceLoader, initResources } from './resource-loader.js'
import { loadStoredEnvKeys, runWizardIfNeeded } from './wizard.js'

const authStorage = AuthStorage.create(authFilePath)
loadStoredEnvKeys(authStorage)
await runWizardIfNeeded(authStorage)

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
// Idempotent: only adds if not already present. Users can remove it by editing settings.json.
const MCP_ADAPTER_PACKAGE = 'npm:pi-mcp-adapter'
const currentPackages = settingsManager.getPackages()
if (!currentPackages.includes(MCP_ADAPTER_PACKAGE)) {
  settingsManager.setPackages([...currentPackages, MCP_ADAPTER_PACKAGE])
}

const sessionManager = SessionManager.create(process.cwd(), sessionsDir)

initResources(agentDir)
const resourceLoader = buildResourceLoader(agentDir)
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

const interactiveMode = new InteractiveMode(session)
await interactiveMode.run()
