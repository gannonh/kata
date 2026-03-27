import {
  resolveSymphonyConfigFromRuntime,
  type ResolveSymphonyConfigOptions,
} from "./config.js";
import {
  SymphonyError,
  type SymphonyConnectionConfig,
  type SymphonyEventEnvelope,
  type SymphonyEventFilter,
  type SymphonyOrchestratorState,
  type SymphonyWatchOptions,
} from "./types.js";

export interface SymphonyClient {
  getConnectionConfig(): SymphonyConnectionConfig;
  getState(signal?: AbortSignal): Promise<SymphonyOrchestratorState>;
  watchEvents(
    filter: SymphonyEventFilter,
    options?: SymphonyWatchOptions,
  ): AsyncIterable<SymphonyEventEnvelope>;
}

export interface SymphonyClientOptions {
  resolveConfig?: () => SymphonyConnectionConfig;
}

export class SymphonyHttpClient implements SymphonyClient {
  private readonly resolveConfig: () => SymphonyConnectionConfig;

  constructor(options: SymphonyClientOptions = {}) {
    this.resolveConfig =
      options.resolveConfig ?? (() => resolveSymphonyConfigFromRuntime());
  }

  getConnectionConfig(): SymphonyConnectionConfig {
    return this.resolveConfig();
  }

  async getState(_signal?: AbortSignal): Promise<SymphonyOrchestratorState> {
    throw new SymphonyError(
      "Symphony state client is not initialized yet.",
      {
        code: "connection_failed",
        reason: "not_implemented",
      },
    );
  }

  async *watchEvents(
    _filter: SymphonyEventFilter,
    _options: SymphonyWatchOptions = {},
  ): AsyncIterable<SymphonyEventEnvelope> {
    throw new SymphonyError(
      "Symphony event stream client is not initialized yet.",
      {
        code: "stream_closed",
        reason: "not_implemented",
      },
    );
  }
}

export function createSymphonyClient(
  options: SymphonyClientOptions & {
    config?: ResolveSymphonyConfigOptions;
  } = {},
): SymphonyClient {
  if (options.resolveConfig) {
    return new SymphonyHttpClient({ resolveConfig: options.resolveConfig });
  }

  return new SymphonyHttpClient({
    resolveConfig: () => resolveSymphonyConfigFromRuntime(options.config),
  });
}
