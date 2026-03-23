import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

function getDefaultAgentDir(): string {
  return process.env.KATA_CODING_AGENT_DIR?.trim() || join(process.env.HOME ?? homedir(), ".kata-cli", "agent");
}

function getDefaultAuthPath(): string {
  return join(getDefaultAgentDir(), "auth.json");
}

export type ProviderCheckStatus = "pass" | "warn" | "fail" | "info";

export interface ProviderCheck {
  id: string;
  label: string;
  status: ProviderCheckStatus;
  message: string;
}

export interface ProviderStatus {
  provider: string;
  kind: "llm" | "tool";
  configured: boolean;
  hasEnvCredential: boolean;
  hasStoredCredential: boolean;
  modelCount: number;
}

export interface ProviderCheckResult {
  ok: boolean;
  checkedAt: string;
  availableModels: number;
  defaultModel: string | null;
  checks: ProviderCheck[];
  providers: ProviderStatus[];
}

interface KnownProvider {
  id: string;
  label: string;
  kind: "llm" | "tool";
  envVar?: string;
  fallbackEnvVar?: string;
  authKey?: string;
}

interface ModelDescriptor {
  provider: string;
  id: string;
}

export interface RunProviderChecksOptions {
  env?: NodeJS.ProcessEnv;
  authPath?: string;
  overrides?: Partial<{
    checkedAt: string;
    authProviders: string[];
    models: ModelDescriptor[];
    defaultProvider: string | null;
    defaultModel: string | null;
  }>;
}

const LLM_PROVIDERS: KnownProvider[] = [
  { id: "anthropic", label: "Anthropic", kind: "llm", envVar: "KATA_ANTHROPIC_API_KEY", fallbackEnvVar: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI", kind: "llm", envVar: "KATA_OPENAI_API_KEY", fallbackEnvVar: "OPENAI_API_KEY" },
  { id: "google", label: "Google", kind: "llm", envVar: "KATA_GOOGLE_API_KEY", fallbackEnvVar: "GOOGLE_API_KEY" },
  { id: "xai", label: "xAI", kind: "llm", envVar: "KATA_XAI_API_KEY", fallbackEnvVar: "XAI_API_KEY" },
  { id: "groq", label: "Groq", kind: "llm", envVar: "KATA_GROQ_API_KEY", fallbackEnvVar: "GROQ_API_KEY" },
];

const TOOL_PROVIDERS: KnownProvider[] = [
  { id: "brave", label: "Brave Search", kind: "tool", envVar: "KATA_BRAVE_API_KEY", fallbackEnvVar: "BRAVE_API_KEY", authKey: "brave" },
  { id: "tavily", label: "Tavily Search", kind: "tool", envVar: "KATA_TAVILY_API_KEY", fallbackEnvVar: "TAVILY_API_KEY" },
  { id: "linear", label: "Linear", kind: "tool", envVar: "KATA_LINEAR_API_KEY", fallbackEnvVar: "LINEAR_API_KEY", authKey: "linear" },
  { id: "context7", label: "Context7", kind: "tool", envVar: "KATA_CONTEXT7_API_KEY", fallbackEnvVar: "CONTEXT7_API_KEY", authKey: "context7" },
  { id: "jina", label: "Jina", kind: "tool", envVar: "KATA_JINA_API_KEY", fallbackEnvVar: "JINA_API_KEY", authKey: "jina" },
];

function safeTrim(value: string | undefined): string {
  return (value ?? "").trim();
}

function hasEnvCredential(
  env: NodeJS.ProcessEnv,
  envVar?: string,
  fallbackEnvVar?: string,
): boolean {
  if (!envVar && !fallbackEnvVar) return false;
  if (envVar && safeTrim(env[envVar]).length > 0) return true;
  if (fallbackEnvVar && safeTrim(env[fallbackEnvVar]).length > 0) return true;
  return false;
}

function readAuthSnapshot(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function hasStoredCredential(
  snapshot: Record<string, unknown>,
  provider: string,
): boolean {
  const value = snapshot[provider];
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.key === "string" && record.key.trim().length > 0) return true;
  if (typeof record.accessToken === "string" && record.accessToken.trim().length > 0) return true;
  if (typeof record.access_token === "string" && record.access_token.trim().length > 0) return true;
  return false;
}

function buildModelCounts(models: ModelDescriptor[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const model of models) {
    if (!model.provider) continue;
    counts.set(model.provider, (counts.get(model.provider) ?? 0) + 1);
  }
  return counts;
}

function formatStatus(status: ProviderCheckStatus): string {
  return status.toUpperCase();
}

async function loadModelRuntime(
  authPath: string,
  agentDir: string,
): Promise<{
  models: ModelDescriptor[];
  defaultProvider: string | null;
  defaultModel: string | null;
  loadError: string | null;
}> {
  try {
    const pi = await import("@mariozechner/pi-coding-agent");
    const authStorage = pi.AuthStorage.create(authPath);
    const registry = new pi.ModelRegistry(authStorage);
    const settings = pi.SettingsManager.create(agentDir);
    const models = registry.getAll().map((model: { provider: string; id: string }) => ({
      provider: model.provider,
      id: model.id,
    }));
    return {
      models,
      defaultProvider: settings.getDefaultProvider() ?? null,
      defaultModel: settings.getDefaultModel() ?? null,
      loadError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      models: [],
      defaultProvider: null,
      defaultModel: null,
      loadError: message,
    };
  }
}

export async function runProviderChecks(
  options: RunProviderChecksOptions = {},
): Promise<ProviderCheckResult> {
  const env = options.env ?? process.env;
  const authPath = options.authPath ?? getDefaultAuthPath();
  const agentDir = dirname(authPath);
  const checkedAt = options.overrides?.checkedAt ?? new Date().toISOString();
  const authSnapshot = readAuthSnapshot(authPath);
  const authProviders = new Set(
    options.overrides?.authProviders ??
      Object.keys(authSnapshot).filter((provider) =>
        hasStoredCredential(authSnapshot, provider),
      ),
  );

  const runtime =
    options.overrides?.models &&
    options.overrides.defaultProvider !== undefined &&
    options.overrides.defaultModel !== undefined
      ? {
          models: options.overrides.models,
          defaultProvider: options.overrides.defaultProvider,
          defaultModel: options.overrides.defaultModel,
          loadError: null,
        }
      : await loadModelRuntime(authPath, agentDir);

  const models = options.overrides?.models ?? runtime.models;
  const defaultProvider =
    options.overrides?.defaultProvider ?? runtime.defaultProvider;
  const defaultModel = options.overrides?.defaultModel ?? runtime.defaultModel;
  const modelCounts = buildModelCounts(models);

  const checks: ProviderCheck[] = [];
  const providers: ProviderStatus[] = [];

  if (runtime.loadError) {
    checks.push({
      id: "model_registry_unavailable",
      label: "Model registry",
      status: "warn",
      message: `Could not load model registry: ${runtime.loadError}`,
    });
  }

  if (models.length === 0) {
    checks.push({
      id: "model_inventory_empty",
      label: "Model inventory",
      status: "warn",
      message: "No models are currently available. Run /login and /model to configure one.",
    });
  } else {
    checks.push({
      id: "model_inventory",
      label: "Model inventory",
      status: "pass",
      message: `${models.length} model(s) available`,
    });
  }

  if (defaultProvider && defaultModel) {
    const exists = models.some(
      (model) => model.provider === defaultProvider && model.id === defaultModel,
    );
    checks.push({
      id: "default_model",
      label: "Default model",
      status: exists ? "pass" : "warn",
      message: exists
        ? `${defaultProvider}/${defaultModel} is available`
        : `${defaultProvider}/${defaultModel} is configured but missing from registry`,
    });
  } else {
    checks.push({
      id: "default_model",
      label: "Default model",
      status: "warn",
      message: "No default model configured",
    });
  }

  for (const provider of LLM_PROVIDERS) {
    const envConfigured = hasEnvCredential(
      env,
      provider.envVar,
      provider.fallbackEnvVar,
    );
    const storedConfigured = authProviders.has(provider.authKey ?? provider.id);
    const configured = envConfigured || storedConfigured;
    const modelCount = modelCounts.get(provider.id) ?? 0;

    let status: ProviderCheckStatus;
    let message: string;
    if (configured && modelCount > 0) {
      status = "pass";
      message = `Credentials detected; ${modelCount} model(s) available`;
    } else if (configured && modelCount === 0) {
      status = "warn";
      message = "Credentials detected but no models available";
    } else if (!configured && modelCount > 0) {
      status = "info";
      message = `${modelCount} model(s) visible but no direct API key/auth entry detected`;
    } else {
      status = "info";
      message = `No credentials detected (${provider.envVar ?? "no env var"})`;
    }

    checks.push({
      id: `${provider.id}_provider`,
      label: provider.label,
      status,
      message,
    });
    providers.push({
      provider: provider.id,
      kind: provider.kind,
      configured,
      hasEnvCredential: envConfigured,
      hasStoredCredential: storedConfigured,
      modelCount,
    });
  }

  for (const provider of TOOL_PROVIDERS) {
    const envConfigured = hasEnvCredential(
      env,
      provider.envVar,
      provider.fallbackEnvVar,
    );
    const storedConfigured = authProviders.has(provider.authKey ?? provider.id);
    const configured = envConfigured || storedConfigured;
    checks.push({
      id: `${provider.id}_tool_provider`,
      label: provider.label,
      status: configured ? "pass" : "info",
      message: configured
        ? "API credential detected"
        : `API credential not configured (${provider.envVar ?? "no env var"})`,
    });
    providers.push({
      provider: provider.id,
      kind: provider.kind,
      configured,
      hasEnvCredential: envConfigured,
      hasStoredCredential: storedConfigured,
      modelCount: 0,
    });
  }

  const ok = !checks.some((check) => check.status === "fail");
  return {
    ok,
    checkedAt,
    availableModels: models.length,
    defaultModel:
      defaultProvider && defaultModel ? `${defaultProvider}/${defaultModel}` : null,
    checks,
    providers,
  };
}

export function formatProviderReport(result: ProviderCheckResult): string {
  const passCount = result.checks.filter((check) => check.status === "pass").length;
  const warnCount = result.checks.filter((check) => check.status === "warn").length;
  const failCount = result.checks.filter((check) => check.status === "fail").length;
  const infoCount = result.checks.filter((check) => check.status === "info").length;

  const lines: string[] = [];
  lines.push("Provider diagnostics:");
  lines.push(
    `Summary: ${passCount} pass, ${warnCount} warn, ${failCount} fail, ${infoCount} info`,
  );
  for (const check of result.checks) {
    lines.push(`- ${check.label}: ${formatStatus(check.status)} - ${check.message}`);
  }
  return lines.join("\n");
}
