import { ArrowLeft, Check, ChevronRight, KeyRound } from 'lucide-react'
import type { AuthProvider, FirstRunReadinessSnapshot, ProviderStatusMap } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { ONBOARDING_PROVIDER_IDS, PROVIDER_METADATA } from '@/constants/providers'
import { buildFirstRunGuidance, getFirstRunCheckpoint } from '@/lib/first-run-readiness'

interface ProviderStepProps {
  providers: ProviderStatusMap
  selectedProvider: AuthProvider | null
  loadError: string | null
  loading: boolean
  readiness?: FirstRunReadinessSnapshot | null
  onBack: () => void
  onSelect: (provider: AuthProvider) => void
  onContinue: () => void
}

export function ProviderStep({
  providers,
  selectedProvider,
  loadError,
  loading,
  readiness,
  onBack,
  onSelect,
  onContinue,
}: ProviderStepProps) {
  const authCheckpoint = getFirstRunCheckpoint(readiness, 'auth')
  const authGuidance = buildFirstRunGuidance(authCheckpoint)

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold text-foreground">Choose a provider</h2>
          <p className="text-sm text-muted-foreground">
            You can add more providers later in Settings. Start with one that already has a key.
          </p>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {loadError}
          </div>
        )}

        {authGuidance && (
          <div
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
            data-testid="onboarding-auth-guidance"
          >
            {authGuidance}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {ONBOARDING_PROVIDER_IDS.map((provider) => {
            const metadata = PROVIDER_METADATA[provider]
            const info = providers[provider]
            const readinessInfo = readiness?.providers?.[provider]
            const configured = readinessInfo?.configured ?? info.status === 'valid'
            const needsRecovery = (readinessInfo?.status ?? info.status) === 'expired' || (readinessInfo?.status ?? info.status) === 'invalid'
            const selected = selectedProvider === provider
            const badgeLabel = configured ? 'Configured' : needsRecovery ? 'Fix key' : 'Add key'

            return (
              <Card
                key={provider}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(provider)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(provider)
                  }
                }}
                className={cn(
                  'cursor-pointer border border-border bg-card/70 py-0 transition hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected && 'border-ring bg-accent',
                )}
              >
                <CardContent className="flex items-start justify-between gap-3 p-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-foreground">{metadata.name}</p>
                    <p className="text-xs text-muted-foreground">{metadata.description}</p>
                  </div>

                  <Badge variant={configured ? 'secondary' : 'outline'} className="shrink-0">
                    {configured ? <Check data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}
                    {badgeLabel}
                  </Badge>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Separator />

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>

          <Button type="button" disabled={!selectedProvider || loading} onClick={onContinue} size="lg">
            {loading ? (
              'Loading…'
            ) : (
              <>
                Continue
                <ChevronRight data-icon="inline-end" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
