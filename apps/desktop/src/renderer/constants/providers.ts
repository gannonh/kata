import type { AuthProvider } from '@shared/types'

export interface ProviderMetadata {
  id: AuthProvider
  name: string
  shortName: string
  description: string
}

export const PROVIDER_METADATA: Record<AuthProvider, ProviderMetadata> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    shortName: 'Claude',
    description: 'Claude 4 family models',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    shortName: 'GPT',
    description: 'GPT-4o and reasoning models',
  },
  google: {
    id: 'google',
    name: 'Google',
    shortName: 'Gemini',
    description: 'Gemini models via Google AI Studio',
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    shortName: 'Mistral',
    description: 'Mistral large and small models',
  },
  bedrock: {
    id: 'bedrock',
    name: 'AWS Bedrock',
    shortName: 'Bedrock',
    description: 'Provider currently requires AWS credentials',
  },
  azure: {
    id: 'azure',
    name: 'Azure OpenAI',
    shortName: 'Azure',
    description: 'Provider currently requires endpoint + key',
  },
}

export const ONBOARDING_PROVIDER_IDS: AuthProvider[] = [
  'anthropic',
  'openai',
  'google',
  'mistral',
]

export const MODELS_REFRESH_EVENT = 'kata-desktop:models-refresh'
