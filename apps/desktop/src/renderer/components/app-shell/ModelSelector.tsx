import { useCallback, useEffect, useMemo } from 'react'
import { useAtom } from 'jotai'
import {
  availableModelsAtom,
  modelErrorAtom,
  modelLoadingAtom,
  selectedModelAtom,
} from '@/atoms/model'
import { useReliabilitySnapshot } from '@/atoms/reliability'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { FirstRunReadinessSnapshot } from '@shared/types'
import { MODELS_REFRESH_EVENT, PROVIDER_METADATA } from '@/constants/providers'
import { buildFirstRunGuidance, getFirstRunCheckpoint } from '@/lib/first-run-readiness'

function toModelIdentifier(provider: string, id: string): string {
  return `${provider}/${id}`
}

function formatProviderLabel(provider: string): string {
  const normalized = provider.toLowerCase() as keyof typeof PROVIDER_METADATA
  const metadata = PROVIDER_METADATA[normalized]
  return metadata?.name ?? provider
}

export function buildModelSelectorReadinessNotice(
  readiness: FirstRunReadinessSnapshot | null | undefined,
): string | null {
  const startupGuidance = buildFirstRunGuidance(getFirstRunCheckpoint(readiness, 'startup'))
  if (startupGuidance) {
    return startupGuidance
  }

  return buildFirstRunGuidance(getFirstRunCheckpoint(readiness, 'model'))
}

export function ModelSelector() {
  const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom)
  const [availableModels, setAvailableModels] = useAtom(availableModelsAtom)
  const [loading, setLoading] = useAtom(modelLoadingAtom)
  const [error, setError] = useAtom(modelErrorAtom)
  const reliabilitySnapshot = useReliabilitySnapshot()
  const readinessNotice = buildModelSelectorReadinessNotice(reliabilitySnapshot.firstRunReadiness)

  const refreshModels = useCallback(async () => {
    setLoading(true)

    try {
      const response = await window.api.getAvailableModels()

      if (!response.success) {
        setAvailableModels([])
        setError(response.error ?? 'Unable to load models')
        return
      }

      setAvailableModels(response.models)
      setError(null)

      if (response.models.length === 0) {
        return
      }

      const bridgeState = await window.api.getBridgeState()
      const bridgeModel = bridgeState.selectedModel?.trim() || null
      const activeModel = selectedModel ?? bridgeModel

      const currentExists =
        !!activeModel &&
        response.models.some(
          (model) => toModelIdentifier(model.provider, model.id) === activeModel,
        )

      if (currentExists) {
        if (activeModel !== selectedModel) {
          setSelectedModel(activeModel)
        }
        return
      }

      // Don't auto-select a model — the CLI subprocess uses its own configured default.
      // The model selector will show "Select model" until the user explicitly picks one,
      // and the CLI will use whatever model it's configured with (from settings.json).
      if (bridgeModel) {
        // If the bridge already has a model but it's not in our list, just show it anyway
        setSelectedModel(bridgeModel)
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setLoading(false)
    }
  }, [selectedModel, setAvailableModels, setError, setLoading, setSelectedModel])

  useEffect(() => {
    void refreshModels()

    const listener = () => {
      void refreshModels()
    }

    window.addEventListener(MODELS_REFRESH_EVENT, listener)

    return () => {
      window.removeEventListener(MODELS_REFRESH_EVENT, listener)
    }
  }, [refreshModels])

  const groupedModels = useMemo(() => {
    const groups = new Map<string, { provider: string; id: string }[]>()

    for (const model of availableModels) {
      const key = model.provider.toLowerCase()
      const existing = groups.get(key)
      const value = { provider: model.provider, id: model.id }

      if (existing) {
        existing.push(value)
      } else {
        groups.set(key, [value])
      }
    }

    return Array.from(groups.entries())
  }, [availableModels])

  const handleChange = async (nextModel: string): Promise<void> => {
    if (!nextModel || nextModel === selectedModel) {
      return
    }

    const response = await window.api.setModel(nextModel)
    if (!response.success) {
      setError(response.error ?? 'Unable to switch model')
      return
    }

    setSelectedModel(nextModel)
    setError(null)
  }

  const modelPlaceholder = loading
    ? 'Loading models…'
    : availableModels.length === 0
      ? 'No models available'
      : 'Select a model'

  return (
    <div className="flex min-w-[16rem] flex-col gap-1">
      <Select
        value={selectedModel ?? ''}
        disabled={loading || availableModels.length === 0}
        onValueChange={(value) => {
          void handleChange(value)
        }}
      >
        <SelectTrigger className="w-full" size="sm">
          <SelectValue placeholder={modelPlaceholder} />
        </SelectTrigger>

        <SelectContent>
          {groupedModels.map(([provider, models]) => (
            <SelectGroup key={provider}>
              <SelectLabel>{formatProviderLabel(provider)}</SelectLabel>
              {models.map((model) => {
                const value = toModelIdentifier(model.provider, model.id)
                return (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                )
              })}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      {readinessNotice && (
        <div className="space-y-1" data-testid="model-selector-readiness-notice">
          <p className="text-[11px] text-muted-foreground">{readinessNotice}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-0 text-[11px]"
            onClick={() => {
              void refreshModels()
            }}
          >
            Retry model check
          </Button>
        </div>
      )}
    </div>
  )
}
