import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSetAtom } from 'jotai'
import {
  ALL_AUTH_PROVIDERS,
  type AuthProvider,
  type ProviderStatusMap,
} from '@shared/types'
import { onboardingCompleteAtom } from '@/atoms/onboarding'
import { selectedModelAtom } from '@/atoms/model'
import { MODELS_REFRESH_EVENT } from '@/constants/providers'
import { CompletionStep } from './CompletionStep'
import { KeyInputStep } from './KeyInputStep'
import { ProviderStep } from './ProviderStep'
import { WelcomeStep } from './WelcomeStep'

type OnboardingStep = 'welcome' | 'provider' | 'key' | 'complete'

function createMissingProviderMap(): ProviderStatusMap {
  const entries = ALL_AUTH_PROVIDERS.map((provider) => [
    provider,
    {
      provider,
      status: 'missing' as const,
    },
  ])

  return Object.fromEntries(entries) as ProviderStatusMap
}

export function OnboardingWizard() {
  const setOnboardingComplete = useSetAtom(onboardingCompleteAtom)
  const setSelectedModel = useSetAtom(selectedModelAtom)

  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [providers, setProviders] = useState<ProviderStatusMap>(createMissingProviderMap)
  const [selectedProvider, setSelectedProvider] = useState<AuthProvider | null>('openai')
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providersError, setProvidersError] = useState<string | null>(null)
  const [resolvedModel, setResolvedModel] = useState<string | null>(null)

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true)

    try {
      const response = await window.api.auth.getProviders()
      setProviders(response.providers)
      setProvidersError(response.success ? null : response.error ?? 'Unable to load credentials')
    } catch (error) {
      setProviders(createMissingProviderMap())
      setProvidersError(error instanceof Error ? error.message : String(error))
    } finally {
      setProvidersLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const progress = useMemo(() => {
    const steps: OnboardingStep[] = ['welcome', 'provider', 'key', 'complete']
    return Math.max(1, steps.indexOf(step) + 1)
  }, [step])

  const selectModelForProvider = useCallback(
    async (provider: AuthProvider): Promise<string | null> => {
      const modelResponse = await window.api.getAvailableModels()
      if (!modelResponse.success || modelResponse.models.length === 0) {
        return null
      }

      const preferred =
        modelResponse.models.find((model) => model.provider.toLowerCase() === provider) ??
        modelResponse.models[0]

      if (!preferred) {
        return null
      }

      const nextModel = `${preferred.provider}/${preferred.id}`
      const setResult = await window.api.setModel(nextModel)
      if (!setResult.success) {
        throw new Error(setResult.error ?? 'Unable to set model')
      }

      setSelectedModel(nextModel)
      window.dispatchEvent(new Event(MODELS_REFRESH_EVENT))
      return nextModel
    },
    [setSelectedModel],
  )

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur-sm">
      <div className="flex h-[min(42rem,92vh)] w-[min(56rem,94vw)] flex-col rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5">
          <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
            <span>Onboarding</span>
            <span>Step {progress} of 4</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full ${index < progress ? 'bg-slate-200' : 'bg-slate-700'}`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {step === 'welcome' && <WelcomeStep onNext={() => setStep('provider')} />}

          {step === 'provider' && (
            <ProviderStep
              providers={providers}
              selectedProvider={selectedProvider}
              loadError={providersError}
              loading={providersLoading}
              onBack={() => setStep('welcome')}
              onSelect={setSelectedProvider}
              onContinue={() => {
                if (selectedProvider) {
                  setStep('key')
                }
              }}
            />
          )}

          {step === 'key' && selectedProvider && (
            <KeyInputStep
              provider={selectedProvider}
              onBack={() => setStep('provider')}
              onSaved={async (provider) => {
                await loadProviders()
                const model = await selectModelForProvider(provider)
                setResolvedModel(model)
                setStep('complete')
              }}
              onSkip={() => setStep('complete')}
            />
          )}

          {step === 'complete' && (
            <CompletionStep
              selectedModel={resolvedModel}
              onBack={() => setStep(selectedProvider ? 'key' : 'provider')}
              onFinish={() => setOnboardingComplete(true)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
