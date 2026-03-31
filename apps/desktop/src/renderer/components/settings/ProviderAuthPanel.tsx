import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthProvider, ProviderInfo, ProviderStatusMap } from '@shared/types'
import { MODELS_REFRESH_EVENT, PROVIDER_METADATA } from '@/constants/providers'

const AUTH_FILE_DISPLAY_PATH = '~/.kata-cli/agent/auth.json'

const PROVIDER_ORDER: AuthProvider[] = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'bedrock',
  'azure',
]

function statusDotClass(status: ProviderInfo['status']): string {
  if (status === 'valid') {
    return 'bg-emerald-400'
  }
  if (status === 'expired' || status === 'invalid') {
    return 'bg-rose-400'
  }
  return 'bg-slate-500'
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

  const activeInfo = providers?.[activeProvider]

  const providerRows = useMemo(() => {
    if (!providers) {
      return []
    }

    return PROVIDER_ORDER.map((provider) => {
      const metadata = PROVIDER_METADATA[provider]
      const info = providers[provider]
      return {
        provider,
        metadata,
        info,
      }
    })
  }, [providers])

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
    <section className="space-y-4">
      {loadError && (
        <div className="rounded-md border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
          <p className="font-semibold">Unable to load credentials</p>
          <p className="mt-1">{loadError}</p>
          <p className="mt-1 text-rose-300">
            Check file: <span className="font-mono">{AUTH_FILE_DISPLAY_PATH}</span>
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Providers</h3>

          {loading && <p className="text-xs text-slate-400">Loading providers…</p>}

          {!loading && providerRows.length === 0 && (
            <p className="text-xs text-slate-400">No providers available</p>
          )}

          {providerRows.map(({ provider, metadata, info }) => (
            <button
              key={provider}
              type="button"
              onClick={() => {
                setActiveProvider(provider)
                setActionError(null)
                setActionSuccess(null)
                setApiKeyInput('')
              }}
              className={`flex w-full items-center justify-between rounded-md border px-2 py-2 text-left text-xs transition ${
                activeProvider === provider
                  ? 'border-slate-500 bg-slate-800/70'
                  : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
              }`}
            >
              <span>
                <span className="block font-medium text-slate-100">{metadata.name}</span>
                <span className="block text-slate-400">{info.maskedKey ?? 'Not configured'}</span>
              </span>
              <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(info.status)}`} />
            </button>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <h3 className="text-sm font-semibold text-slate-100">{PROVIDER_METADATA[activeProvider].name}</h3>
          <p className="text-xs text-slate-400">{PROVIDER_METADATA[activeProvider].description}</p>

          <div className="text-xs text-slate-300">
            Status:{' '}
            <span className="font-semibold capitalize text-slate-100">
              {activeInfo?.status ?? 'missing'}
            </span>
          </div>

          {activeInfo?.maskedKey ? (
            <div className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300">
              <p>
                Saved key: <span className="font-mono text-slate-100">{activeInfo.maskedKey}</span>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wide text-slate-400">API key</label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                placeholder={`Enter ${PROVIDER_METADATA[activeProvider].shortName} key`}
                className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-slate-500"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!activeInfo?.maskedKey && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  void handleSave()
                }}
                className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 disabled:opacity-60"
              >
                {submitting ? 'Validating…' : 'Validate & Save'}
              </button>
            )}

            {activeInfo?.maskedKey && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  void handleRemove()
                }}
                className="rounded-md border border-rose-400/60 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-60"
              >
                {submitting ? 'Removing…' : 'Remove key'}
              </button>
            )}
          </div>

          {actionError && <p className="text-xs text-rose-300">{actionError}</p>}
          {actionSuccess && <p className="text-xs text-emerald-300">{actionSuccess}</p>}
        </div>
      </div>
    </section>
  )
}
