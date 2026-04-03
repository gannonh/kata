import { useState } from 'react'
import { ArrowLeft, KeyRound } from 'lucide-react'
import type { AuthProvider } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { PROVIDER_METADATA } from '@/constants/providers'

interface KeyInputStepProps {
  provider: AuthProvider
  onBack: () => void
  onSaved: (provider: AuthProvider) => Promise<void>
  onSkip: () => void
}

export function KeyInputStep({ provider, onBack, onSaved, onSkip }: KeyInputStepProps) {
  const [keyValue, setKeyValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const metadata = PROVIDER_METADATA[provider]

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
