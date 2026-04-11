import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSetAtom } from 'jotai'
import {
  ALL_AUTH_PROVIDERS,
  OAUTH_PROVIDERS,
  type AuthProvider,
  type ProviderStatusMap,
} from '@shared/types'
import { onboardingCompleteAtom } from '@/atoms/onboarding'
import { selectedModelAtom } from '@/atoms/model'
import { useReliabilitySnapshot } from '@/atoms/reliability'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { MODELS_REFRESH_EVENT } from '@/constants/providers'
import { cn } from '@/lib/utils'
import { CompletionStep } from './CompletionStep'
import { KeyInputStep } from './KeyInputStep'
import { ProviderStep } from './ProviderStep'
import { WelcomeStep } from './WelcomeStep'

type OnboardingStep = 'welcome' | 'provider' | 'key' | 'complete'

export interface OnboardingAccessibilityCheckpoint {
  id: string
  severity: 'critical' | 'serious'
  expectation: string
}

export function getOnboardingAccessibilityBaseline(): OnboardingAccessibilityCheckpoint[] {
  return [
    {
      id: 'onboarding-heading',
      severity: 'critical',
      expectation: 'Onboarding heading and step indicator are visible.',
    },
    {
      id: 'onboarding-primary-action',
      severity: 'serious',
      expectation: 'Get started button is visible and keyboard actionable.',
    },
    {
      id: 'onboarding-provider-selection',
      severity: 'serious',
      expectation: 'Provider step exposes selectable provider cards with accessible names.',
    },
  ]
}

function createMissingProviderMap(): ProviderStatusMap {
  const entries = ALL_AUTH_PROVIDERS.map((provider) => {
    const authType = OAUTH_PROVIDERS.has(provider) ? 'oauth' as const : 'api_key' as const
    return [
      provider,
      {
        provider,
        status: 'missing' as const,
        authType,
      },
    ]
  })

  return Object.fromEntries(entries) as ProviderStatusMap
}

export function OnboardingWizard() {
  const setOnboardingComplete = useSetAtom(onboardingCompleteAtom)
  const setSelectedModel = useSetAtom(selectedModelAtom)
  const reliabilitySnapshot = useReliabilitySnapshot()

  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [providers, setProviders] = useState<ProviderStatusMap>(createMissingProviderMap)
  const [selectedProvider, setSelectedProvider] = useState<AuthProvider | null>('openai')
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providersError, setProvidersError] = useState<string | null>(null)
  const [resolvedModel, setResolvedModel] = useState<string | null>(null)
  const [skipping, setSkipping] = useState(false)
  const [keyStepVisited, setKeyStepVisited] = useState(false)

  const firstRunReadiness = reliabilitySnapshot.firstRunReadiness ?? null

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/85 p-6 backdrop-blur-sm">
      <Card className="flex h-[min(42rem,92vh)] w-[min(56rem,94vw)] border border-border bg-card py-0 shadow-2xl">
        <CardHeader className="flex flex-col gap-3 px-6 pt-6 pb-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Onboarding</span>
            <span>Step {progress} of 4</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-1.5 rounded-full bg-muted',
                  index < progress && 'bg-primary',
                )}
              />
            ))}
          </div>
        </CardHeader>

        <Separator className="mt-5" />

        <CardContent className="flex-1 overflow-auto p-6">
          {step === 'welcome' && <WelcomeStep onNext={() => setStep('provider')} />}

          {step === 'provider' && (
            <ProviderStep
              providers={providers}
              selectedProvider={selectedProvider}
              loadError={providersError}
              loading={providersLoading || skipping}
              readiness={firstRunReadiness}
              onBack={() => setStep('welcome')}
              onSelect={setSelectedProvider}
              onContinue={() => {
                if (!selectedProvider) return
                const info = providers[selectedProvider]
                if (info?.status === 'valid') {
                  // Provider already configured — skip key entry, auto-select model, go to completion
                  if (skipping) return
                  void (async () => {
                    setSkipping(true)
                    try {
                      const model = await selectModelForProvider(selectedProvider)
                      setResolvedModel(model)
                    } catch (err) {
                      // Model selection failed — still advance past key entry
                      console.error('[OnboardingWizard] Model auto-selection failed:', err)
                      setResolvedModel(null)
                    } finally {
                      setSkipping(false)
                      setStep('complete')
                    }
                  })()
                } else {
                  setKeyStepVisited(true)
                  setStep('key')
                }
              }}
            />
          )}

          {step === 'key' && selectedProvider && (
            <KeyInputStep
              provider={selectedProvider}
              authType={providers[selectedProvider]?.authType ?? 'api_key'}
              readiness={firstRunReadiness}
              onBack={() => {
                setKeyStepVisited(false)
                setStep('provider')
              }}
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
              readiness={firstRunReadiness}
              onBack={() => setStep(keyStepVisited ? 'key' : 'provider')}
              onFinish={() => setOnboardingComplete(true)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
