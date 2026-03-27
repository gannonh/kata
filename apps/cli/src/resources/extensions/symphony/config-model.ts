export type ConfigFieldType = "string" | "number" | "boolean" | "enum" | "string[]";

export type ConfigSectionKey =
  | "tracker"
  | "workspace"
  | "agent"
  | "kata_agent"
  | "notifications"
  | "prompts"
  | "server"
  | "hooks"
  | "worker";

export interface ConfigField<T = unknown> {
  key: string;
  label: string;
  path: string[];
  type: ConfigFieldType;
  value: T;
  required: boolean;
  description: string;
  enumValues?: string[];
  sensitive?: boolean;
}

export interface ConfigSection {
  key: ConfigSectionKey;
  label: string;
  description: string;
  fields: ConfigField[];
}

export interface TrackerSection extends ConfigSection {
  key: "tracker";
}

export interface WorkspaceSection extends ConfigSection {
  key: "workspace";
}

export interface AgentSection extends ConfigSection {
  key: "agent";
}

export interface KataAgentSection extends ConfigSection {
  key: "kata_agent";
}

export interface NotificationsSection extends ConfigSection {
  key: "notifications";
}

export interface PromptsSection extends ConfigSection {
  key: "prompts";
}

export interface ServerSection extends ConfigSection {
  key: "server";
}

export interface HooksSection extends ConfigSection {
  key: "hooks";
}

export interface WorkerSection extends ConfigSection {
  key: "worker";
}

export interface WorkflowFrontmatter {
  config: Record<string, unknown>;
  raw: string;
  body: string;
}

export interface ConfigEditorModel {
  sections: [
    TrackerSection,
    WorkspaceSection,
    AgentSection,
    KataAgentSection,
    NotificationsSection,
    PromptsSection,
    ServerSection,
    HooksSection,
    WorkerSection,
  ];
  workflow: WorkflowFrontmatter;
}

export interface ConfigFieldDefinition {
  section: ConfigSectionKey;
  key: string;
  label: string;
  path: string[];
  type: ConfigFieldType;
  required?: boolean;
  description: string;
  enumValues?: string[];
  sensitive?: boolean;
}

export interface ConfigSectionDefinition {
  key: ConfigSectionKey;
  label: string;
  description: string;
}

export const CONFIG_SECTION_DEFINITIONS: readonly ConfigSectionDefinition[] = [
  {
    key: "tracker",
    label: "Tracker",
    description: "Issue tracker connectivity and filtering.",
  },
  {
    key: "workspace",
    label: "Workspace",
    description: "Workspace bootstrap and isolation behavior.",
  },
  {
    key: "agent",
    label: "Agent",
    description: "Global runtime concurrency and backend settings.",
  },
  {
    key: "kata_agent",
    label: "Kata Agent",
    description: "Kata RPC process settings.",
  },
  {
    key: "notifications",
    label: "Notifications",
    description: "Webhook notification filters and destinations.",
  },
  {
    key: "prompts",
    label: "Prompts",
    description: "Per-state prompt template file paths.",
  },
  {
    key: "server",
    label: "Server",
    description: "HTTP dashboard and API listener options.",
  },
  {
    key: "hooks",
    label: "Hooks",
    description: "Lifecycle hook commands and timeout.",
  },
  {
    key: "worker",
    label: "Worker",
    description: "SSH worker pool configuration.",
  },
] as const;

export const CONFIG_FIELD_DEFINITIONS: readonly ConfigFieldDefinition[] = [
  {
    section: "tracker",
    key: "kind",
    label: "Tracker Kind",
    path: ["tracker", "kind"],
    type: "enum",
    required: true,
    enumValues: ["linear"],
    description: "Tracker backend. Symphony currently supports linear.",
  },
  {
    section: "tracker",
    key: "api_key",
    label: "API Key",
    path: ["tracker", "api_key"],
    type: "string",
    required: true,
    sensitive: true,
    description: "Tracker authentication token or $ENV_VAR reference.",
  },
  {
    section: "tracker",
    key: "project_slug",
    label: "Project Slug",
    path: ["tracker", "project_slug"],
    type: "string",
    required: true,
    description: "Linear project slug/slugId to poll.",
  },
  {
    section: "tracker",
    key: "workspace_slug",
    label: "Workspace Slug",
    path: ["tracker", "workspace_slug"],
    type: "string",
    description: "Optional workspace slug used for dashboard links.",
  },
  {
    section: "tracker",
    key: "endpoint",
    label: "Endpoint",
    path: ["tracker", "endpoint"],
    type: "string",
    description: "Optional GraphQL endpoint override.",
  },
  {
    section: "tracker",
    key: "assignee",
    label: "Assignee",
    path: ["tracker", "assignee"],
    type: "string",
    description: "Optional assignee username filter.",
  },
  {
    section: "tracker",
    key: "active_states",
    label: "Active States",
    path: ["tracker", "active_states"],
    type: "string[]",
    description: "Issue states eligible for dispatch.",
  },
  {
    section: "tracker",
    key: "terminal_states",
    label: "Terminal States",
    path: ["tracker", "terminal_states"],
    type: "string[]",
    description: "Issue states that mark a run as completed.",
  },
  {
    section: "workspace",
    key: "root",
    label: "Workspace Root",
    path: ["workspace", "root"],
    type: "string",
    required: true,
    description: "Root directory for issue workspaces.",
  },
  {
    section: "workspace",
    key: "repo",
    label: "Repository",
    path: ["workspace", "repo"],
    type: "string",
    required: true,
    description: "Repository URL or local path.",
  },
  {
    section: "workspace",
    key: "git_strategy",
    label: "Git Strategy",
    path: ["workspace", "git_strategy"],
    type: "enum",
    enumValues: ["auto", "clone-local", "clone-remote", "worktree"],
    description: "Repository bootstrap strategy.",
  },
  {
    section: "workspace",
    key: "isolation",
    label: "Isolation",
    path: ["workspace", "isolation"],
    type: "enum",
    enumValues: ["local", "docker"],
    description: "Workspace runtime isolation mode.",
  },
  {
    section: "workspace",
    key: "branch_prefix",
    label: "Branch Prefix",
    path: ["workspace", "branch_prefix"],
    type: "string",
    description: "Prefix for auto-created issue branches.",
  },
  {
    section: "workspace",
    key: "clone_branch",
    label: "Clone Branch",
    path: ["workspace", "clone_branch"],
    type: "string",
    description: "Optional branch used for clone-based bootstraps.",
  },
  {
    section: "workspace",
    key: "base_branch",
    label: "Base Branch",
    path: ["workspace", "base_branch"],
    type: "string",
    description: "Base branch used for merge/rebase operations.",
  },
  {
    section: "workspace",
    key: "cleanup_on_done",
    label: "Cleanup On Done",
    path: ["workspace", "cleanup_on_done"],
    type: "boolean",
    description: "Remove workspaces when issues reach a terminal state.",
  },
  {
    section: "workspace",
    key: "docker.image",
    label: "Docker Image",
    path: ["workspace", "docker", "image"],
    type: "string",
    description: "Docker base image for worker containers.",
  },
  {
    section: "workspace",
    key: "docker.setup",
    label: "Docker Setup Script",
    path: ["workspace", "docker", "setup"],
    type: "string",
    description: "Optional setup script used for derived worker image layers.",
  },
  {
    section: "workspace",
    key: "docker.codex_auth",
    label: "Docker Codex Auth",
    path: ["workspace", "docker", "codex_auth"],
    type: "enum",
    enumValues: ["auto", "mount", "env"],
    description: "Codex auth mode inside Docker workers.",
  },
  {
    section: "workspace",
    key: "docker.env",
    label: "Docker Env",
    path: ["workspace", "docker", "env"],
    type: "string[]",
    description: "Additional KEY=value env entries passed to docker run.",
  },
  {
    section: "workspace",
    key: "docker.volumes",
    label: "Docker Volumes",
    path: ["workspace", "docker", "volumes"],
    type: "string[]",
    description: "Additional bind mounts passed to docker run.",
  },
  {
    section: "agent",
    key: "max_concurrent_agents",
    label: "Max Concurrent Agents",
    path: ["agent", "max_concurrent_agents"],
    type: "number",
    description: "Global cap on simultaneously running worker sessions.",
  },
  {
    section: "agent",
    key: "max_turns",
    label: "Max Turns",
    path: ["agent", "max_turns"],
    type: "number",
    description: "Maximum turns per session attempt.",
  },
  {
    section: "agent",
    key: "max_retry_backoff_ms",
    label: "Max Retry Backoff (ms)",
    path: ["agent", "max_retry_backoff_ms"],
    type: "number",
    description: "Maximum retry backoff delay in milliseconds.",
  },
  {
    section: "agent",
    key: "backend",
    label: "Backend",
    path: ["agent", "backend"],
    type: "enum",
    enumValues: ["kata-cli", "kata", "codex"],
    description: "Worker runtime backend.",
  },
  {
    section: "kata_agent",
    key: "command",
    label: "Command",
    path: ["kata_agent", "command"],
    type: "string",
    description: "Kata executable command (string or list in YAML).",
  },
  {
    section: "kata_agent",
    key: "model",
    label: "Model",
    path: ["kata_agent", "model"],
    type: "string",
    description: "Default model override passed to Kata.",
  },
  {
    section: "kata_agent",
    key: "no_session",
    label: "No Session",
    path: ["kata_agent", "no_session"],
    type: "boolean",
    description: "Pass --no-session to disable persistent storage.",
  },
  {
    section: "kata_agent",
    key: "append_system_prompt",
    label: "Append System Prompt",
    path: ["kata_agent", "append_system_prompt"],
    type: "string",
    description: "Optional path passed via --append-system-prompt.",
  },
  {
    section: "kata_agent",
    key: "read_timeout_ms",
    label: "Read Timeout (ms)",
    path: ["kata_agent", "read_timeout_ms"],
    type: "number",
    description: "Timeout waiting for Kata process output.",
  },
  {
    section: "kata_agent",
    key: "stall_timeout_ms",
    label: "Stall Timeout (ms)",
    path: ["kata_agent", "stall_timeout_ms"],
    type: "number",
    description: "Timeout before a non-progressing session is stalled.",
  },
  {
    section: "notifications",
    key: "slack.webhook_url",
    label: "Slack Webhook URL",
    path: ["notifications", "slack", "webhook_url"],
    type: "string",
    sensitive: true,
    description: "Slack incoming webhook URL.",
  },
  {
    section: "notifications",
    key: "slack.events",
    label: "Slack Events",
    path: ["notifications", "slack", "events"],
    type: "string[]",
    description: "Notification event filters.",
  },
  {
    section: "prompts",
    key: "shared",
    label: "Shared Prompt",
    path: ["prompts", "shared"],
    type: "string",
    description: "Path to shared prompt content.",
  },
  {
    section: "prompts",
    key: "default",
    label: "Default Prompt",
    path: ["prompts", "default"],
    type: "string",
    description: "Fallback prompt path for unmatched states.",
  },
  {
    section: "server",
    key: "host",
    label: "Host",
    path: ["server", "host"],
    type: "string",
    description: "HTTP bind address.",
  },
  {
    section: "server",
    key: "port",
    label: "Port",
    path: ["server", "port"],
    type: "number",
    description: "HTTP server port.",
  },
  {
    section: "server",
    key: "public_url",
    label: "Public URL",
    path: ["server", "public_url"],
    type: "string",
    description: "Optional externally reachable dashboard URL.",
  },
  {
    section: "hooks",
    key: "timeout_ms",
    label: "Hook Timeout (ms)",
    path: ["hooks", "timeout_ms"],
    type: "number",
    description: "Timeout used for every hook command.",
  },
  {
    section: "hooks",
    key: "after_create",
    label: "After Create",
    path: ["hooks", "after_create"],
    type: "string",
    description: "Hook command executed after workspace creation.",
  },
  {
    section: "hooks",
    key: "before_run",
    label: "Before Run",
    path: ["hooks", "before_run"],
    type: "string",
    description: "Hook command executed before worker launch.",
  },
  {
    section: "hooks",
    key: "after_run",
    label: "After Run",
    path: ["hooks", "after_run"],
    type: "string",
    description: "Hook command executed after worker exits.",
  },
  {
    section: "hooks",
    key: "before_remove",
    label: "Before Remove",
    path: ["hooks", "before_remove"],
    type: "string",
    description: "Hook command executed before workspace cleanup.",
  },
  {
    section: "worker",
    key: "ssh_hosts",
    label: "SSH Hosts",
    path: ["worker", "ssh_hosts"],
    type: "string[]",
    description: "Remote SSH hosts for distributed sessions.",
  },
  {
    section: "worker",
    key: "max_concurrent_agents_per_host",
    label: "Max Agents Per Host",
    path: ["worker", "max_concurrent_agents_per_host"],
    type: "number",
    description: "Per-host worker concurrency cap.",
  },
] as const;

export function getSectionDefinitionsByKey(): Map<
  ConfigSectionKey,
  ConfigSectionDefinition
> {
  return new Map(CONFIG_SECTION_DEFINITIONS.map((section) => [section.key, section]));
}

export function getFieldDefinitionsForSection(
  section: ConfigSectionKey,
): ConfigFieldDefinition[] {
  return CONFIG_FIELD_DEFINITIONS.filter((field) => field.section === section);
}

export function maskConfigValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");

  const text = String(value);
  if (text.length === 0) return text;
  if (text.length <= 3) return "***";

  return `${text.slice(0, 3)}***`;
}

export function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
