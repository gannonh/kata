import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AuthProvider,
  FirstRunCheckpointState,
  FirstRunReadinessSnapshot,
  ProviderInfo,
  ProviderStatusMap,
} from '@shared/types'
import { useReliabilitySnapshot } from '@/atoms/reliability'
import { Check, KeyRound, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { MODELS_REFRESH_EVENT, PROVIDER_METADATA } from '@/constants/providers'
import {
  buildFirstRunGuidance,
  formatFirstRunRecoveryAction,
  getFirstRunCheckpoint,
} from '@/lib/first-run-readiness'
import { cn } from '@/lib/utils'

const AUTH_FILE_DISPLAY_PATH = '~/.kata-cli/agent/auth.json'

const PROVIDER_ORDER: AuthProvider[] = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'bedrock',
  'azure',
]

function statusVariant(status: ProviderInfo['status']): 'secondary' | 'destructive' | 'outline' {
  if (status === 'valid') {
    return 'secondary'
  }

  if (status === 'expired' || status === 'invalid') {
    return 'destructive'
  }

  return 'outline'
}

export function buildProviderAuthReadinessNotice(
  readiness: FirstRunReadinessSnapshot | null | undefined,
): string | null {
  const authCheckpoint = getFirstRunCheckpoint(readiness, 'auth')
  const modelCheckpoint = getFirstRunCheckpoint(readiness, 'model')

  if (authCheckpoint?.status === 'fail' && authCheckpoint.failure) {
    return authCheckpoint.failure.message
  }

  if (modelCheckpoint?.status === 'fail' && modelCheckpoint.failure) {
    return modelCheckpoint.failure.message
  }

  return null
}

export function buildProviderAuthRecoveryAction(
  checkpoint: FirstRunCheckpointState | null | undefined,
): string | null {
  if (!checkpoint || checkpoint.status === 'pass' || !checkpoint.failure) {
    return null
  }

  return formatFirstRunRecoveryAction(checkpoint.failure.recoveryAction)
}

export function ProviderAuthPanel() {
  const [providers, setProviders] = useState<ProviderStatusMap | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeProvider, setActiveProvider] = useState<AuthProvider>('anthropic')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reliabilitySnapshot = useReliabilitySnapshot()
  const firstRunReadiness = reliabilitySnapshot.firstRunReadiness ?? null
  const authCheckpoint = getFirstRunCheckpoint(firstRunReadiness, 'auth')
  const modelCheckpoint = getFirstRunCheckpoint(firstRunReadiness, 'model')
  const startupCheckpoint = getFirstRunCheckpoint(firstRunReadiness, 'startup')
  const readinessNotice = buildProviderAuthReadinessNotice(firstRunReadiness)
  const readinessAction =
    buildProviderAuthRecoveryAction(authCheckpoint?.status === 'fail' ? authCheckpoint : modelCheckpoint)

  const loadProviders = useCallback(async () => {
    setLoading(true)
    try {
      const response = await window.api.auth.getProviders()
      setProviders(response.providers)
      setLoadError(response.success ? null : response.error ?? 'Unable to load credentials')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
      setProviders(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const providerRows = useMemo(() => {
    if (!providers) {
      return []
    }

    return PROVIDER_ORDER.map((provider) => {
      const metadata = PROVIDER_METADATA[provider]
      const info = providers[provider]
      const readinessInfo = firstRunReadiness?.providers?.[provider]

      return {
        provider,
        metadata,
        info: {
          ...info,
          status: readinessInfo?.status ?? info.status,
          maskedKey: readinessInfo?.maskedKey ?? info.maskedKey,
        },
      }
    })
  }, [firstRunReadiness, providers])

  const activeInfo = useMemo(() => {
    const row = providerRows.find((providerRow) => providerRow.provider === activeProvider)
    return row?.info ?? providers?.[activeProvider]
  }, [activeProvider, providerRows, providers])

  const handleSave = async () => {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) {
      setActionError('API key is required')
      setActionSuccess(null)
      return
    }

    setSubmitting(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const setResult = await window.api.auth.setKey(activeProvider, trimmed)
      if (!setResult.success) {
        setActionError(setResult.error ?? 'Unable to save API key')
        return
      }

      setActionSuccess(`${PROVIDER_METADATA[activeProvider].name} key saved`)
      setApiKeyInput('')
      await loadProviders()
      window.dispatchEvent(new Event(MODELS_REFRESH_EVENT))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async () => {
    setSubmitting(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      const result = await window.api.auth.removeKey(activeProvider)
      if (!result.success) {
        setActionError(result.error ?? 'Unable to remove API key')
        return
      }

      setActionSuccess(`${PROVIDER_METADATA[activeProvider].name} key removed`)
      setApiKeyInput('')
      await loadProviders()
      window.dispatchEvent(new Event(MODELS_REFRESH_EVENT))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <p className="font-semibold">Unable to load credentials</p>
          <p className="mt-1">{loadError}</p>
          <p className="mt-1">
            Check file: <span className="font-mono">{AUTH_FILE_DISPLAY_PATH}</span>
          </p>
        </div>
      )}

      {readinessNotice && (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
          data-testid="provider-auth-readiness-notice"
        >
          <p>{readinessNotice}</p>
          {readinessAction && <p className="mt-1 font-medium">Suggested recovery: {readinessAction}</p>}
        </div>
      )}

      {startupCheckpoint?.status === 'fail' && startupCheckpoint.failure && (
        <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {buildFirstRunGuidance(startupCheckpoint)}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card size="sm" className="border border-border bg-card/60 py-0">
          <CardHeader className="px-3 pt-3 pb-0">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Providers</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-2 p-3">
            {loading && <p className="text-xs text-muted-foreground">Loading providers…</p>}

            {!loading && providerRows.length === 0 && (
              <p className="text-xs text-muted-foreground">No providers available</p>
            )}

            {providerRows.map(({ provider, metadata, info }) => (
              <Button
                key={provider}
                type="button"
                variant="ghost"
                onClick={() => {
                  setActiveProvider(provider)
                  setActionError(null)
                  setActionSuccess(null)
                  setApiKeyInput('')
                }}
                className={cn(
                  'h-auto w-full justify-between rounded-md border border-border bg-background/30 px-2 py-2 text-left',
                  activeProvider === provider
                    ? 'border-ring bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                )}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">{metadata.name}</span>
                  <span className="text-xs text-muted-foreground">{info.maskedKey ?? 'Not configured'}</span>
                </span>

                <Badge variant={statusVariant(info.status)} className="capitalize">
                  {info.status}
                </Badge>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card size="sm" className="border border-border bg-card/60 py-0">
          <CardHeader className="flex flex-col gap-1 px-3 pt-3 pb-0">
            <CardTitle className="text-sm text-foreground">{PROVIDER_METADATA[activeProvider].name}</CardTitle>
            <p className="text-xs text-muted-foreground">{PROVIDER_METADATA[activeProvider].description}</p>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Status:</span>
              <Badge variant={statusVariant(activeInfo?.status ?? 'missing')} className="capitalize">
                {activeInfo?.status ?? 'missing'}
              </Badge>
            </div>

            <Separator />

            {activeInfo?.maskedKey ? (
              <div className="rounded-md border border-border bg-accent/60 px-3 py-2 text-xs text-muted-foreground">
                <p>
                  Saved key: <span className="font-mono text-foreground">{activeInfo.maskedKey}</span>
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="provider-auth-input"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  API key
                </Label>
                <Input
                  id="provider-auth-input"
                  type="password"
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  placeholder={`Enter ${PROVIDER_METADATA[activeProvider].shortName} key`}
                  className="h-9 text-xs"
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!activeInfo?.maskedKey && (
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    void handleSave()
                  }}
                  size="sm"
                >
                  <KeyRound data-icon="inline-start" />
                  {submitting ? 'Validating…' : 'Validate & Save'}
                </Button>
              )}

              {activeInfo?.maskedKey && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={submitting}
                  onClick={() => {
                    void handleRemove()
                  }}
                  size="sm"
                >
                  <Trash2 data-icon="inline-start" />
                  {submitting ? 'Removing…' : 'Remove key'}
                </Button>
              )}
            </div>

            {actionError && <p className="text-xs text-destructive">{actionError}</p>}
            {actionSuccess && (
              <p className="flex items-center gap-1 text-xs text-primary">
                <Check />
                {actionSuccess}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
