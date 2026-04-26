export type HarnessKind = "codex" | "claude" | "cursor" | "pi" | "skills-sh";

export function detectHarness(env: NodeJS.ProcessEnv): HarnessKind {
  if (env.CODEX_HOME) return "codex";
  if (env.CLAUDE_CONFIG_DIR || env.CLAUDE_HOME) return "claude";
  if (env.CURSOR_CONFIG_HOME) return "cursor";
  if (env.PI_CONFIG_DIR || env.PI_HOME) return "pi";
  return "skills-sh";
}
