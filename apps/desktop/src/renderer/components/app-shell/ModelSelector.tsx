import { useCallback, useEffect, useMemo } from 'react'
import { useAtom } from 'jotai'
import {
  availableModelsAtom,
  modelErrorAtom,
  modelLoadingAtom,
  selectedModelAtom,
} from '@/atoms/model'
import { MODELS_REFRESH_EVENT, PROVIDER_METADATA } from '@/constants/providers'

function toModelIdentifier(provider: string, id: string): string {
  return `${provider}/${id}`
}

function formatProviderLabel(provider: string): string {
  const normalized = provider.toLowerCase() as keyof typeof PROVIDER_METADATA
  const metadata = PROVIDER_METADATA[normalized]
  return metadata?.name ?? provider
}

export function ModelSelector() {
  const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom)
  const [availableModels, setAvailableModels] = useAtom(availableModelsAtom)
  const [loading, setLoading] = useAtom(modelLoadingAtom)
  const [error, setError] = useAtom(modelErrorAtom)

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

      const first = response.models[0]
      if (!first) {
        return
      }

      const fallbackModel = toModelIdentifier(first.provider, first.id)
      const setResult = await window.api.setModel(fallbackModel)
      if (!setResult.success) {
        setError(setResult.error ?? 'Unable to set default model')
        return
      }

      setSelectedModel(fallbackModel)
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

  return (
    <div className="flex min-w-[16rem] flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wide text-slate-400">Model</label>

      <select
        value={selectedModel ?? ''}
        disabled={loading || availableModels.length === 0}
        onChange={(event) => {
          void handleChange(event.target.value)
        }}
        className="h-8 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 focus:border-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
      >
        {availableModels.length === 0 && (
          <option value="">{loading ? 'Loading models…' : 'No models available'}</option>
        )}

        {groupedModels.map(([provider, models]) => (
          <optgroup key={provider} label={formatProviderLabel(provider)}>
            {models.map((model) => {
              const value = toModelIdentifier(model.provider, model.id)
              return (
                <option key={value} value={value}>
                  {value}
                </option>
              )
            })}
          </optgroup>
        ))}
      </select>

      {error && <p className="text-[11px] text-rose-300">{error}</p>}
    </div>
  )
}
