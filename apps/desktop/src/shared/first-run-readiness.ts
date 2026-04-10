import {
  ALL_AUTH_PROVIDERS,
  AUTH_PROVIDER_ALIASES,
  OAUTH_PROVIDERS,
  type AuthProvider,
  type AvailableModel,
  type BridgeLifecycleState,
  type FirstRunCheckpointFailure,
  type FirstRunCheckpointId,
  type FirstRunCheckpointState,
  type FirstRunProviderState,
  type FirstRunProviderStateMap,
  type FirstRunReadinessSnapshot,
  type ProviderStatusMap,
} from './types'

export const FIRST_RUN_CHECKPOINT_ORDER: readonly FirstRunCheckpointId[] = [
  'auth',
  'model',
  'startup',
  'first_turn',
]

export class FirstRunInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FirstRunInvariantError'
  }
}

export interface BuildFirstRunReadinessInput {
  providers: ProviderStatusMap
  selectedProvider?: AuthProvider | null
  selectedModel?: string | null
  availableModels?: AvailableModel[]
  bridgeStatus?: BridgeLifecycleState
  completedFirstTurn?: boolean
  now?: string
}

function isoNow(value?: string): string {
  return value?.trim() || new Date().toISOString()
}

function normalizeProvider(provider: string | null | undefined): AuthProvider | null {
  const normalized = provider?.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (ALL_AUTH_PROVIDERS.includes(normalized as AuthProvider)) {
    return normalized as AuthProvider
  }

  for (const canonical of ALL_AUTH_PROVIDERS) {
    const aliases = AUTH_PROVIDER_ALIASES[canonical] ?? []
    if (aliases.includes(normalized)) {
      return canonical
    }
  }

  return null
}

function normalizeModelProvider(selectedModel: string | null | undefined): AuthProvider | null {
  const value = selectedModel?.trim()
  if (!value) {
    return null
  }

  const providerSegment = value.split('/')[0]?.trim().toLowerCase()
  return normalizeProvider(providerSegment)
}

function normalizeModelKey(modelRef: string | null | undefined): string | null {
  const value = modelRef?.trim()
  if (!value) {
    return null
  }

  const separatorIndex = value.indexOf('/')
  if (separatorIndex < 0) {
    return value.toLowerCase()
  }

  const providerSegment = value.slice(0, separatorIndex).trim()
  const modelId = value.slice(separatorIndex + 1).trim()
  if (!providerSegment || !modelId) {
    return null
  }

  const canonicalProvider = normalizeProvider(providerSegment) ?? providerSegment.toLowerCase()
  return `${canonicalProvider}/${modelId}`
}

function toFailure(
  input: Omit<FirstRunCheckpointFailure, 'recoverable' | 'timestamp'> & {
    now: string
    recoverable?: boolean
  },
): FirstRunCheckpointFailure {
  return {
    class: input.class,
    severity: input.severity,
    code: input.code,
    message: input.message,
    recoveryAction: input.recoveryAction,
    recoverable: input.recoverable ?? true,
    timestamp: input.now,
    ...(input.detail ? { detail: input.detail } : {}),
  }
}

function buildProviderStateMap(providers: ProviderStatusMap): FirstRunProviderStateMap {
  const entries = ALL_AUTH_PROVIDERS.map((provider) => {
    const info = providers[provider]
    const isOAuth = OAUTH_PROVIDERS.has(provider) || info.authType === 'oauth'
    const configured = info.status === 'valid'
    // OAuth providers never "require a key" — they are set up externally via CLI
    const requiresKey = isOAuth
      ? false
      : info.status === 'missing' || info.status === 'invalid' || info.status === 'expired'

    if (configured && requiresKey) {
      throw new FirstRunInvariantError(
        `Contradictory provider state for ${provider}: configured cannot require key`,
      )
    }

    const state: FirstRunProviderState = {
      provider,
      status: info.status,
      configured,
      requiresKey,
      ...(info.maskedKey ? { maskedKey: info.maskedKey } : {}),
    }

    return [provider, state] as const
  })

  return Object.fromEntries(entries) as FirstRunProviderStateMap
}

function evaluateAuthCheckpoint(
  providerStates: FirstRunProviderStateMap,
  selectedProvider: AuthProvider | null,
  now: string,
): FirstRunCheckpointState {
  const configuredProviders = Object.values(providerStates).filter((provider) => provider.configured)

  if (selectedProvider) {
    const selected = providerStates[selectedProvider]
    if (selected.requiresKey) {
      const code =
        selected.status === 'expired'
          ? 'AUTH_PROVIDER_EXPIRED'
          : selected.status === 'invalid'
            ? 'AUTH_PROVIDER_INVALID'
            : 'AUTH_PROVIDER_KEY_REQUIRED'

      return {
        checkpoint: 'auth',
        status: 'fail',
        failure: toFailure({
          class: 'auth',
          severity: 'error',
          code,
          message: `Add a valid ${selectedProvider} key in Settings to continue onboarding.`,
          recoveryAction: 'reauthenticate',
          now,
        }),
      }
    }

    // OAuth provider selected but not connected — show CLI-setup guidance instead of key entry
    const isSelectedOAuth = OAUTH_PROVIDERS.has(selectedProvider)
    if (isSelectedOAuth && !selected.configured) {
      return {
        checkpoint: 'auth',
        status: 'fail',
        failure: toFailure({
          class: 'auth',
          severity: 'error',
          code: 'AUTH_OAUTH_PROVIDER_NOT_CONNECTED',
          message: `Connect ${selectedProvider} via the Kata CLI to continue onboarding.`,
          recoveryAction: 'reauthenticate',
          now,
        }),
      }
    }
  }

  if (configuredProviders.length === 0) {
    return {
      checkpoint: 'auth',
      status: 'fail',
      failure: toFailure({
        class: 'auth',
        severity: 'error',
        code: 'AUTH_PROVIDER_NOT_CONFIGURED',
        message:
          'No providers are configured. Add an API key or connect an OAuth provider via the Kata CLI to unlock first-run setup.',
        recoveryAction: 'reauthenticate',
        now,
      }),
    }
  }

  return {
    checkpoint: 'auth',
    status: 'pass',
  }
}

function evaluateModelCheckpoint(input: {
  selectedModel: string | null
  selectedProvider: AuthProvider | null
  providerStates: FirstRunProviderStateMap
  availableModels: AvailableModel[]
  authCheckpoint: FirstRunCheckpointState
  now: string
}): FirstRunCheckpointState {
  if (input.authCheckpoint.status === 'fail') {
    return {
      checkpoint: 'model',
      status: 'fail',
      blockedBy: 'auth',
      failure: toFailure({
        class: 'auth',
        severity: 'warning',
        code: 'MODEL_BLOCKED_BY_AUTH',
        message: 'Model selection is blocked until provider authentication succeeds.',
        recoveryAction: 'reauthenticate',
        now: input.now,
      }),
    }
  }

  const modelProvider = normalizeModelProvider(input.selectedModel)
  if (modelProvider) {
    const providerState = input.providerStates[modelProvider]
    if (!providerState?.configured) {
      return {
        checkpoint: 'model',
        status: 'fail',
        failure: toFailure({
          class: 'auth',
          severity: 'error',
          code: 'MODEL_PROVIDER_NOT_CONFIGURED',
          message: `Selected model provider ${modelProvider} is not configured. Add credentials or choose a different model.`,
          recoveryAction: 'reauthenticate',
          now: input.now,
        }),
      }
    }
  }

  if (!input.selectedModel) {
    return {
      checkpoint: 'model',
      status: 'fail',
      failure: toFailure({
        class: 'config',
        severity: 'warning',
        code: 'MODEL_SELECTION_REQUIRED',
        message: 'Select a model before starting your first productive turn.',
        recoveryAction: 'inspect',
        now: input.now,
      }),
    }
  }

  const normalizedSelectedModel = normalizeModelKey(input.selectedModel)
  const selectedModelExists = Boolean(
    normalizedSelectedModel &&
      input.availableModels.some((model) => {
        const availableModelKey = normalizeModelKey(`${model.provider}/${model.id}`)
        return availableModelKey === normalizedSelectedModel
      }),
  )

  if (!selectedModelExists) {
    return {
      checkpoint: 'model',
      status: 'fail',
      failure: toFailure({
        class: 'config',
        severity: 'warning',
        code: 'MODEL_NOT_AVAILABLE',
        message: 'Selected model is unavailable. Refresh models or choose another model.',
        recoveryAction: 'retry_request',
        now: input.now,
      }),
    }
  }

  return {
    checkpoint: 'model',
    status: 'pass',
  }
}

function evaluateStartupCheckpoint(
  bridgeStatus: BridgeLifecycleState,
  now: string,
): FirstRunCheckpointState {
  if (bridgeStatus === 'running') {
    return {
      checkpoint: 'startup',
      status: 'pass',
    }
  }

  if (bridgeStatus === 'spawning') {
    return {
      checkpoint: 'startup',
      status: 'fail',
      failure: toFailure({
        class: 'process',
        severity: 'warning',
        code: 'STARTUP_IN_PROGRESS',
        message: 'Kata runtime is starting. Wait a moment, then retry.',
        recoveryAction: 'restart_process',
        now,
      }),
    }
  }

  if (bridgeStatus === 'crashed') {
    return {
      checkpoint: 'startup',
      status: 'fail',
      failure: toFailure({
        class: 'process',
        severity: 'critical',
        code: 'STARTUP_RUNTIME_CRASHED',
        message: 'Kata runtime failed to start. Restart the runtime from the chat banner.',
        recoveryAction: 'restart_process',
        now,
      }),
    }
  }

  return {
    checkpoint: 'startup',
    status: 'fail',
    failure: toFailure({
      class: 'process',
      severity: 'error',
      code: 'STARTUP_RUNTIME_NOT_READY',
      message: 'Kata runtime is not ready. Start or restart the runtime to continue.',
      recoveryAction: 'restart_process',
      now,
    }),
  }
}

export function normalizeFirstRunStartupCheckpoint(input: {
  bridgeStatus: BridgeLifecycleState
  now?: string
}): FirstRunCheckpointState {
  const now = isoNow(input.now)
  return evaluateStartupCheckpoint(input.bridgeStatus, now)
}

function evaluateFirstTurnCheckpoint(input: {
  completedFirstTurn: boolean
  authCheckpoint: FirstRunCheckpointState
  modelCheckpoint: FirstRunCheckpointState
  startupCheckpoint: FirstRunCheckpointState
  now: string
}): FirstRunCheckpointState {
  if (input.authCheckpoint.status === 'fail') {
    return {
      checkpoint: 'first_turn',
      status: 'fail',
      blockedBy: 'auth',
      failure: toFailure({
        class: 'auth',
        severity: 'warning',
        code: 'FIRST_TURN_BLOCKED_BY_AUTH',
        message: 'First turn is blocked until provider authentication succeeds.',
        recoveryAction: 'reauthenticate',
        now: input.now,
      }),
    }
  }

  if (input.modelCheckpoint.status === 'fail') {
    return {
      checkpoint: 'first_turn',
      status: 'fail',
      blockedBy: 'model',
      failure: toFailure({
        class: 'config',
        severity: 'warning',
        code: 'FIRST_TURN_BLOCKED_BY_MODEL',
        message: 'First turn is blocked until a valid model is selected.',
        recoveryAction: 'inspect',
        now: input.now,
      }),
    }
  }

  if (input.startupCheckpoint.status === 'fail') {
    return {
      checkpoint: 'first_turn',
      status: 'fail',
      blockedBy: 'startup',
      failure: toFailure({
        class: 'process',
        severity: 'warning',
        code: 'FIRST_TURN_BLOCKED_BY_STARTUP',
        message: 'First turn is blocked until runtime startup completes.',
        recoveryAction: 'restart_process',
        now: input.now,
      }),
    }
  }

  if (input.completedFirstTurn) {
    return {
      checkpoint: 'first_turn',
      status: 'pass',
    }
  }

  return {
    checkpoint: 'first_turn',
    status: 'fail',
    failure: toFailure({
      class: 'stale',
      severity: 'info',
      code: 'FIRST_TURN_PENDING',
      message: 'Send your first message to verify end-to-end readiness.',
      recoveryAction: 'inspect',
      now: input.now,
    }),
  }
}

export function buildFirstRunReadinessSnapshot(
  input: BuildFirstRunReadinessInput,
): FirstRunReadinessSnapshot {
  const now = isoNow(input.now)
  const selectedProvider = input.selectedProvider ?? null
  const selectedModel = input.selectedModel?.trim() || null
  const availableModels = input.availableModels ?? []
  const bridgeStatus = input.bridgeStatus ?? 'shutdown'
  const completedFirstTurn = input.completedFirstTurn ?? false

  const providers = buildProviderStateMap(input.providers)

  const authCheckpoint = evaluateAuthCheckpoint(providers, selectedProvider, now)
  const modelCheckpoint = evaluateModelCheckpoint({
    selectedModel,
    selectedProvider,
    providerStates: providers,
    availableModels,
    authCheckpoint,
    now,
  })
  const startupCheckpoint = evaluateStartupCheckpoint(bridgeStatus, now)
  const firstTurnCheckpoint = evaluateFirstTurnCheckpoint({
    completedFirstTurn,
    authCheckpoint,
    modelCheckpoint,
    startupCheckpoint,
    now,
  })

  const checkpoints: Record<FirstRunCheckpointId, FirstRunCheckpointState> = {
    auth: authCheckpoint,
    model: modelCheckpoint,
    startup: startupCheckpoint,
    first_turn: firstTurnCheckpoint,
  }

  const blockedCheckpoint =
    FIRST_RUN_CHECKPOINT_ORDER.find((checkpoint) => checkpoints[checkpoint].status === 'fail') ?? null

  return {
    generatedAt: now,
    providers,
    selectedProvider,
    selectedModel,
    availableModelCount: availableModels.length,
    completedFirstTurn,
    checkpoints,
    blockedCheckpoint,
    overallStatus: blockedCheckpoint ? 'blocked' : 'ready',
  }
}
