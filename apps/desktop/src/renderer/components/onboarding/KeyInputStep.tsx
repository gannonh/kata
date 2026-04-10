import { useState } from 'react'
import { ArrowLeft, KeyRound } from 'lucide-react'
import type { AuthProvider, FirstRunReadinessSnapshot } from '@shared/types'
import { OAUTH_PROVIDERS } from '@shared/types'
import { buildFirstRunGuidance, getFirstRunCheckpoint } from '@/lib/first-run-readiness'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { PROVIDER_METADATA } from '@/constants/providers'

interface KeyInputStepProps {
  provider: AuthProvider
  readiness?: FirstRunReadinessSnapshot | null
  onBack: () => void
  onSaved: (provider: AuthProvider) => Promise<void>
  onSkip: () => void
}

export function KeyInputStep({ provider, readiness, onBack, onSaved, onSkip }: KeyInputStepProps) {
  const [keyValue, setKeyValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const metadata = PROVIDER_METADATA[provider]
  const isOAuth = OAUTH_PROVIDERS.has(provider)
  const authGuidance = buildFirstRunGuidance(getFirstRunCheckpoint(readiness, 'auth'))
  const modelGuidance = buildFirstRunGuidance(getFirstRunCheckpoint(readiness, 'model'))

  if (isOAuth) {
    return (
      <div className="flex h-full flex-col justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold text-foreground">{metadata.name}</h2>
            <p className="text-sm text-muted-foreground">
              This provider authenticates through an OAuth session, not an API key.
            </p>
          </div>

          <div
            className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
            data-testid="onboarding-oauth-guidance"
          >
            <p className="font-medium text-foreground">Set up via Kata CLI</p>
            <p className="mt-1">
              Run <code className="rounded bg-accent px-1">kata</code> in your terminal to authenticate with{' '}
              {metadata.name}. Once connected, return here and the provider will show as configured.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <Separator />
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={onBack}>
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
            <Button type="button" variant="ghost" onClick={onSkip} className="text-muted-foreground">
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const validateAndSave = async (): Promise<void> => {
    const trimmed = keyValue.trim()
    if (!trimmed) {
      setError('API key is required')
      setSuccessMessage(null)
      return
    }

    setBusy(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const saveResult = await window.api.auth.setKey(provider, trimmed)
      if (!saveResult.success) {
        setError(saveResult.error ?? 'Unable to save API key')
        return
      }

      setSuccessMessage(`${metadata.name} key validated and saved`)

      try {
        await onSaved(provider)
      } catch (savedError) {
        setSuccessMessage(null)
        setError(savedError instanceof Error ? savedError.message : String(savedError))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold text-foreground">Add your {metadata.name} key</h2>
          <p className="text-sm text-muted-foreground">
            Keys are stored in <code className="rounded bg-accent px-1">~/.kata-cli/agent/auth.json</code> and
            shared with Kata CLI.
          </p>
        </div>

        {authGuidance && (
          <div
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
            data-testid="onboarding-key-auth-guidance"
          >
            {authGuidance}
          </div>
        )}

        {modelGuidance && (
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {modelGuidance}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="provider-api-key" className="text-xs uppercase tracking-wide text-muted-foreground">
            API key
          </Label>
          <Input
            id="provider-api-key"
            type="password"
            value={keyValue}
            onChange={(event) => {
              setKeyValue(event.target.value)
              setError(null)
              setSuccessMessage(null)
            }}
            placeholder={`Enter ${metadata.shortName} API key`}
            className="h-10"
          />
        </div>

        {busy && <p className="text-xs text-muted-foreground">Validating key…</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {successMessage && <p className="text-xs text-primary">{successMessage}</p>}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onSkip} className="text-muted-foreground">
              Skip for now
            </Button>

            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                void validateAndSave()
              }}
              size="lg"
            >
              {busy ? (
                'Validating…'
              ) : (
                <>
                  <KeyRound data-icon="inline-start" />
                  Validate & Save
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
