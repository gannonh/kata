import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  detectAnthropicProviderForRequest,
  registerNativeSearchHooks,
  type NativeSearchPI,
} from '../native-search.js'

type HandlerMap = Record<string, (...args: any[]) => any>

function createStubPI(initialTools: string[] = ['search-the-web', 'search_and_read', 'read']) {
  const handlers: HandlerMap = {}
  let activeTools = [...initialTools]

  const pi: NativeSearchPI = {
    on(event, handler) {
      handlers[event] = handler
    },
    getActiveTools() {
      return [...activeTools]
    },
    setActiveTools(tools) {
      activeTools = [...tools]
    },
  }

  return {
    pi,
    handlers,
    getActiveTools: () => [...activeTools],
  }
}

describe('detectAnthropicProviderForRequest', () => {
  test('returns false for github-copilot claude identifiers without other provider signals', () => {
    expect(
      detectAnthropicProviderForRequest({
        payloadModel: 'github-copilot/claude-opus-4-6',
        modelSelectFired: false,
        isAnthropicProvider: false,
      }),
    ).toBe(false)
  })

  test('payload model provider prefix overrides anthropic-like event metadata', () => {
    expect(
      detectAnthropicProviderForRequest({
        eventModel: { provider: 'anthropic' },
        payloadModel: 'github-copilot/claude-opus-4-6',
        modelSelectFired: true,
        isAnthropicProvider: true,
      }),
    ).toBe(false)
  })

  test('returns true for explicit anthropic provider identifier', () => {
    expect(
      detectAnthropicProviderForRequest({
        payloadModel: 'anthropic/claude-opus-4-1',
        modelSelectFired: false,
        isAnthropicProvider: false,
      }),
    ).toBe(true)
  })

  test('uses model_select provider state when payload lacks provider prefix', () => {
    expect(
      detectAnthropicProviderForRequest({
        payloadModel: 'claude-opus-4-1',
        modelSelectFired: true,
        isAnthropicProvider: true,
      }),
    ).toBe(true)

    expect(
      detectAnthropicProviderForRequest({
        payloadModel: 'claude-opus-4-6',
        modelSelectFired: true,
        isAnthropicProvider: false,
      }),
    ).toBe(false)
  })
})

describe('registerNativeSearchHooks', () => {
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    savedEnv = {
      SEARCH_PROVIDER: process.env.SEARCH_PROVIDER,
      PREFER_BRAVE_SEARCH: process.env.PREFER_BRAVE_SEARCH,
      BRAVE_API_KEY: process.env.BRAVE_API_KEY,
    }
    delete process.env.SEARCH_PROVIDER
    delete process.env.PREFER_BRAVE_SEARCH
    delete process.env.BRAVE_API_KEY
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  test('does not inject native web search for github-copilot claude models', () => {
    const { pi, handlers } = createStubPI()
    registerNativeSearchHooks(pi)

    const payload: Record<string, unknown> = {
      model: 'github-copilot/claude-opus-4-6',
      tools: [{ name: 'search-the-web' }],
      messages: [],
    }

    handlers.before_provider_request?.({ payload })

    expect(payload.tools).toEqual([{ name: 'search-the-web' }])
  })

  test('injects native web search for anthropic after model_select', async () => {
    const { pi, handlers, getActiveTools } = createStubPI()
    registerNativeSearchHooks(pi)

    await handlers.model_select?.(
      { model: { provider: 'anthropic' }, source: 'user' },
      { ui: { notify: () => {} } },
    )

    expect(getActiveTools()).toEqual(['read'])

    const payload: Record<string, unknown> = {
      model: 'claude-opus-4-1',
      tools: [{ name: 'search-the-web' }, { name: 'search_and_read' }, { name: 'other-tool' }],
      messages: [],
    }

    handlers.before_provider_request?.({ payload })

    expect(Array.isArray(payload.tools)).toBe(true)
    expect((payload.tools as Array<Record<string, unknown>>).some((tool) => tool.type === 'web_search_20250305')).toBe(true)
    expect((payload.tools as Array<Record<string, unknown>>).some((tool) => tool.name === 'search-the-web')).toBe(false)
    expect((payload.tools as Array<Record<string, unknown>>).some((tool) => tool.name === 'search_and_read')).toBe(false)
    expect((payload.tools as Array<Record<string, unknown>>).some((tool) => tool.name === 'other-tool')).toBe(true)
  })
})
