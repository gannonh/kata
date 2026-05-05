import { describe, expect, test } from 'vitest'
import { ONBOARDING_PROVIDER_IDS, PROVIDER_METADATA } from './providers'

describe('PROVIDER_METADATA', () => {
  test('contains expected metadata for all providers', () => {
    expect(PROVIDER_METADATA).toEqual({
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
      'github-copilot': {
        id: 'github-copilot',
        name: 'GitHub Copilot',
        shortName: 'Copilot',
        description: 'Authenticated via GitHub Copilot CLI session',
      },
    })
  })

  test('onboarding list covers the directly supported providers including OAuth-capable ones', () => {
    expect(ONBOARDING_PROVIDER_IDS).toEqual([
      'anthropic',
      'openai',
      'google',
      'github-copilot',
      'mistral',
    ])
  })
})
