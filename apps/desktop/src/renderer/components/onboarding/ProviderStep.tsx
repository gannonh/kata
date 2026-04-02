import type { AuthProvider, ProviderStatusMap } from '@shared/types'
import { ONBOARDING_PROVIDER_IDS, PROVIDER_METADATA } from '@/constants/providers'

interface ProviderStepProps {
  providers: ProviderStatusMap
  selectedProvider: AuthProvider | null
  loadError: string | null
  loading: boolean
  onBack: () => void
  onSelect: (provider: AuthProvider) => void
  onContinue: () => void
}

export function ProviderStep({
  providers,
  selectedProvider,
  loadError,
  loading,
  onBack,
  onSelect,
  onContinue,
}: ProviderStepProps) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <h2 className="text-2xl font-semibold text-slate-100">Choose a provider</h2>
        <p className="mt-2 text-sm text-slate-300">
          You can add more providers later in Settings. Start with one that already has a key.
        </p>

        {loadError && (
          <div className="mt-3 rounded-md border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {loadError}
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {ONBOARDING_PROVIDER_IDS.map((provider) => {
            const metadata = PROVIDER_METADATA[provider]
            const info = providers[provider]
            const configured = info.status === 'valid'

            return (
              <button
                key={provider}
                type="button"
                onClick={() => onSelect(provider)}
                className={`rounded-lg border p-3 text-left transition ${
                  selectedProvider === provider
                    ? 'border-slate-400 bg-slate-800/80'
                    : 'border-slate-700 bg-slate-900/70 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{metadata.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{metadata.description}</p>
                  </div>

                  <span
                    className={`ml-3 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      configured
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {configured ? 'Configured' : 'Add key'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
        >
          Back
        </button>

        <button
          type="button"
          disabled={!selectedProvider || loading}
          onClick={onContinue}
          className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
