import { useState } from 'react'
import type { AuthProvider } from '@shared/types'
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
      <div>
        <h2 className="text-2xl font-semibold text-slate-100">Add your {metadata.name} key</h2>
        <p className="mt-2 text-sm text-slate-300">
          Keys are stored in <code className="rounded bg-slate-800 px-1">~/.kata-cli/agent/auth.json</code>{' '}
          and shared with Kata CLI.
        </p>

        <div className="mt-4 space-y-2">
          <label className="text-xs uppercase tracking-wide text-slate-400">API key</label>
          <input
            type="password"
            value={keyValue}
            onChange={(event) => {
              setKeyValue(event.target.value)
              setError(null)
              setSuccessMessage(null)
            }}
            placeholder={`Enter ${metadata.shortName} API key`}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-slate-500"
          />
        </div>

        {busy && <p className="mt-3 text-xs text-slate-300">Validating key…</p>}
        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
        {successMessage && <p className="mt-3 text-xs text-emerald-300">{successMessage}</p>}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
        >
          Back
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-slate-400 underline-offset-2 hover:underline"
          >
            Skip for now
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void validateAndSave()
            }}
            className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {busy ? 'Validating…' : 'Validate & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
