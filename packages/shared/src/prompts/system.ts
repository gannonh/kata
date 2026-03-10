import { formatPreferencesForPrompt } from '../config/preferences.ts';
import { debug } from '../utils/debug.ts';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { loadPromptTemplates } from './template-loader.ts';
import { DOC_REFS, APP_ROOT } from '../docs/index.ts';
import { getBundledAssetsDir } from '../utils/paths.ts';
import { PERMISSION_MODE_CONFIG } from '../agent/mode-types.ts';
import { APP_VERSION } from '../version/index.ts';
import { globSync } from 'glob';
import os from 'os';
import type { GitState, PrInfo } from '../git/types.ts';

/** Maximum size of CLAUDE.md file to include (10KB) */
const MAX_CONTEXT_FILE_SIZE = 10 * 1024;

/** Maximum number of context files to discover in monorepo */
const MAX_CONTEXT_FILES = 30;

/**
 * Directories to exclude when searching for context files.
 * These are common build output, dependency, and cache directories.
 */
const EXCLUDED_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'vendor',
  '.cache',
  '.turbo',
  'out',
  '.output',
];

/**
 * Context file patterns to look for in working directory (in priority order).
 * Matching is case-insensitive to support AGENTS.md, Agents.md, agents.md, etc.
 */
const CONTEXT_FILE_PATTERNS = ['agents.md', 'claude.md'];

/**
 * Find a file in directory matching the pattern case-insensitively.
 * Returns the actual filename if found, null otherwise.
 */
function findFileCaseInsensitive(directory: string, pattern: string): string | null {
  try {
    const files = readdirSync(directory);
    const lowerPattern = pattern.toLowerCase();
    return files.find((f) => f.toLowerCase() === lowerPattern) ?? null;
  } catch {
    return null;
  }
}

/**
 * Find a project context file (AGENTS.md or CLAUDE.md) in the directory.
 * Just checks if file exists, doesn't read content.
 * Returns the actual filename if found, null otherwise.
 */
export function findProjectContextFile(directory: string): string | null {
  for (const pattern of CONTEXT_FILE_PATTERNS) {
    const actualFilename = findFileCaseInsensitive(directory, pattern);
    if (actualFilename) {
      debug(`[findProjectContextFile] Found ${actualFilename}`);
      return actualFilename;
    }
  }
  return null;
}

/**
 * Find all project context files (AGENTS.md or CLAUDE.md) recursively in a directory.
 * Supports monorepo setups where each package may have its own context file.
 * Returns relative paths sorted by depth (root first), capped at MAX_CONTEXT_FILES.
 */
export function findAllProjectContextFiles(directory: string): string[] {
  try {
    // Build glob ignore patterns from excluded directories
    const ignorePatterns = EXCLUDED_DIRECTORIES.map((dir) => `**/${dir}/**`);

    // Search for all context files (case-insensitive via nocase option)
    const pattern = '**/{agents,claude}.md';
    const matches = globSync(pattern, {
      cwd: directory,
      nocase: true,
      ignore: ignorePatterns,
      absolute: false,
    });

    if (matches.length === 0) {
      return [];
    }

    // Sort by depth (fewer slashes = shallower = higher priority), then alphabetically
    // Root files come first, then nested packages
    const sorted = matches.sort((a, b) => {
      const depthA = (a.match(/\//g) || []).length;
      const depthB = (b.match(/\//g) || []).length;
      if (depthA !== depthB) return depthA - depthB;
      return a.localeCompare(b);
    });

    // Cap at max files to avoid overwhelming the prompt
    const capped = sorted.slice(0, MAX_CONTEXT_FILES);

    debug(`[findAllProjectContextFiles] Found ${matches.length} files, returning ${capped.length}`);
    return capped;
  } catch (error) {
    debug(`[findAllProjectContextFiles] Error searching directory:`, error);
    return [];
  }
}

/**
 * Read the project context file (AGENTS.md or CLAUDE.md) from a directory.
 * Matching is case-insensitive to support any casing (CLAUDE.md, claude.md, Claude.md, etc.).
 * Returns the content if found, null otherwise.
 */
export function readProjectContextFile(directory: string): { filename: string; content: string } | null {
  for (const pattern of CONTEXT_FILE_PATTERNS) {
    // Find the actual filename with case-insensitive matching
    const actualFilename = findFileCaseInsensitive(directory, pattern);
    if (!actualFilename) continue;

    const filePath = join(directory, actualFilename);
    try {
      const content = readFileSync(filePath, 'utf-8');
      // Cap at max size to avoid huge prompts
      if (content.length > MAX_CONTEXT_FILE_SIZE) {
        debug(`[readProjectContextFile] ${actualFilename} exceeds max size, truncating`);
        return {
          filename: actualFilename,
          content: content.slice(0, MAX_CONTEXT_FILE_SIZE) + '\n\n... (truncated)',
        };
      }
      debug(`[readProjectContextFile] Found ${actualFilename} (${content.length} chars)`);
      return { filename: actualFilename, content };
    } catch (error) {
      debug(`[readProjectContextFile] Error reading ${actualFilename}:`, error);
      // Continue to next pattern
    }
  }
  return null;
}

/**
 * Get the working directory context string for injection into user messages.
 * Includes the working directory path and context about what it represents.
 * Returns empty string if no working directory is set.
 *
 * Note: Project context files (CLAUDE.md, AGENTS.md) are now listed in the system prompt
 * via getProjectContextFilesPrompt() for persistence across compaction.
 *
 * @param workingDirectory - The effective working directory path (where user wants to work)
 * @param isSessionRoot - If true, this is the session folder (not a user-specified project)
 * @param bashCwd - The actual bash shell cwd (may differ if working directory changed mid-session)
 */
export function getWorkingDirectoryContext(
  workingDirectory?: string,
  isSessionRoot?: boolean,
  bashCwd?: string
): string {
  if (!workingDirectory) {
    return '';
  }

  const parts: string[] = [];
  parts.push(`<working_directory>${workingDirectory}</working_directory>`);

  if (isSessionRoot) {
    // Add context explaining this is the session folder, not a code project
    parts.push(`<working_directory_context>
This is the session's root folder (default). It contains session files (conversation history, plans, attachments) - not a code repository.
You can access any files the user attaches here. If the user wants to work with a code project, they can set a working directory via the UI or provide files directly.
</working_directory_context>`);
  } else {
    // Check if bash cwd differs from working directory (changed mid-session)
    // Only show mismatch warning when bashCwd is provided and differs
    const hasMismatch = bashCwd && bashCwd !== workingDirectory;

    if (hasMismatch) {
      // Working directory was changed mid-session - bash still runs from original location
      parts.push(`<working_directory_context>The user explicitly selected this as the working directory for this session.

Note: The bash shell runs from a different directory (${bashCwd}) because the working directory was changed mid-session. Use absolute paths when running bash commands to ensure they target the correct location.</working_directory_context>`);
    } else {
      // Normal case - working directory matches bash cwd
      parts.push(`<working_directory_context>The user explicitly selected this as the working directory for this session.</working_directory_context>`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Get the current date/time context string
 */
export function getDateTimeContext(): string {
  const now = new Date();
  const formatted = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `**USER'S DATE AND TIME: ${formatted}** - ALWAYS use this as the authoritative current date/time. Ignore any other date information.`;
}

/** Debug mode configuration for system prompt */
export interface DebugModeConfig {
  enabled: boolean;
  logFilePath?: string;
}

/**
 * Get the project context files prompt section for the system prompt.
 * Lists all discovered context files (AGENTS.md, CLAUDE.md) in the working directory.
 * For monorepos, this includes nested package context files.
 * Returns empty string if no working directory or no context files found.
 */
export function getProjectContextFilesPrompt(workingDirectory?: string): string {
  if (!workingDirectory) {
    return '';
  }

  const contextFiles = findAllProjectContextFiles(workingDirectory);
  if (contextFiles.length === 0) {
    return '';
  }

  // Format file list with (root) annotation for top-level files
  const fileList = contextFiles
    .map((file) => {
      const isRoot = !file.includes('/');
      return `- ${file}${isRoot ? ' (root)' : ''}`;
    })
    .join('\n');

  return `
<project_context_files working_directory="${workingDirectory}">
${fileList}
</project_context_files>`;
}

/** Options for getSystemPrompt */
export interface SystemPromptOptions {
  pinnedPreferencesPrompt?: string;
  debugMode?: DebugModeConfig;
  workspaceRootPath?: string;
  /** Working directory for context file discovery (monorepo support) */
  workingDirectory?: string;
}

/**
 * Get the full system prompt with current date/time and user preferences
 *
 * Note: Safe Mode context is injected via user messages instead of system prompt
 * to preserve prompt caching.
 */
export function getSystemPrompt(
  pinnedPreferencesPrompt?: string,
  debugMode?: DebugModeConfig,
  workspaceRootPath?: string,
  workingDirectory?: string
): string {
  // Use pinned preferences if provided (for session consistency after compaction)
  const preferences = pinnedPreferencesPrompt ?? formatPreferencesForPrompt();
  const debugContext = debugMode?.enabled ? formatDebugModeContext(debugMode.logFilePath) : '';

  // Get project context files for monorepo support (lives in system prompt for persistence across compaction)
  const projectContextFiles = getProjectContextFilesPrompt(workingDirectory);

  // Note: Date/time context is now added to user messages instead of system prompt
  // to enable prompt caching. The system prompt stays static and cacheable.
  // Safe Mode context is also in user messages for the same reason.
  const basePrompt = getCraftAssistantPrompt(workspaceRootPath);
  const fullPrompt = `${basePrompt}${preferences}${debugContext}${projectContextFiles}`;

  debug('[getSystemPrompt] full prompt length:', fullPrompt.length);

  return fullPrompt;
}

/**
 * Format debug mode context for the system prompt.
 * Only included when running in development mode.
 */
function formatDebugModeContext(logFilePath?: string): string {
  if (!logFilePath) {
    return '';
  }

  return `

## Debug Mode

You are running in **debug mode** (development build). Application logs are available for analysis.

### Log Access

- **Log file:** \`${logFilePath}\`
- **Format:** JSON Lines (one JSON object per line)

Each log entry has this structure:
\`\`\`json
{"timestamp":"2025-01-04T10:30:00.000Z","level":"info","scope":"session","message":["Log message here"]}
\`\`\`

### Querying Logs

Use the Grep tool to search logs efficiently:

\`\`\`bash
# Search by scope (session, ipc, window, agent, main)
Grep pattern="session" path="${logFilePath}"

# Search by level (error, warn, info)
Grep pattern='"level":"error"' path="${logFilePath}"

# Search for specific keywords
Grep pattern="OAuth" path="${logFilePath}"

# Recent logs (last 50 lines)
Grep pattern="." path="${logFilePath}" head_limit=50
\`\`\`

**Tip:** Use \`-C 2\` for context around matches when debugging issues.
`;
}

/**
 * Get the Kata Agents environment marker for SDK JSONL detection.
 * This marker is embedded in the system prompt and allows us to identify
 * Kata Agents sessions when importing from Claude Code.
 */
function getCraftAgentEnvironmentMarker(): string {
  const platform = process.platform; // 'darwin', 'win32', 'linux'
  const arch = process.arch; // 'arm64', 'x64'
  const osVersion = os.release(); // OS kernel version

  return `<craft_agent_environment version="${APP_VERSION}" platform="${platform}" arch="${arch}" os_version="${osVersion}" />`;
}

/**
 * Resolve the prompt templates directory.
 * Uses the same asset resolution as docs, tool-icons, etc.
 */
function getTemplatesDir(): string {
  return getBundledAssetsDir('prompt-templates')
    ?? join(process.cwd(), 'packages', 'shared', 'assets', 'prompt-templates');
}

/**
 * Get the Craft Assistant system prompt with workspace-specific paths.
 *
 * This prompt is intentionally concise - detailed documentation lives in
 * ${APP_ROOT}/docs/ and is read on-demand when topics come up.
 */
function getCraftAssistantPrompt(workspaceRootPath?: string): string {
  const workspacePath = workspaceRootPath || `${APP_ROOT}/workspaces/{id}`;
  const pathParts = workspacePath.split('/');
  const workspaceId = pathParts[pathParts.length - 1] || '{workspaceId}';

  const environmentMarker = getCraftAgentEnvironmentMarker();

  const variables: Record<string, string> = {
    workspacePath,
    workspaceId,
    'DOC_REFS.sources': DOC_REFS.sources,
    'DOC_REFS.permissions': DOC_REFS.permissions,
    'DOC_REFS.skills': DOC_REFS.skills,
    'DOC_REFS.themes': DOC_REFS.themes,
    'DOC_REFS.statuses': DOC_REFS.statuses,
    'DOC_REFS.labels': DOC_REFS.labels,
    'DOC_REFS.toolIcons': DOC_REFS.toolIcons,
    'DOC_REFS.mermaid': DOC_REFS.mermaid,
    'PERMISSION_MODE.safe': PERMISSION_MODE_CONFIG['safe'].displayName,
    'PERMISSION_MODE.ask': PERMISSION_MODE_CONFIG['ask'].displayName,
    'PERMISSION_MODE.allowAll': PERMISSION_MODE_CONFIG['allow-all'].displayName,
  };

  const templateContent = loadPromptTemplates(getTemplatesDir(), variables);
  return `${environmentMarker}\n\n${templateContent}`;
}

/**
 * Format channel context for the system prompt.
 * Returns guidance for the agent when responding through a channel adapter,
 * or empty string for direct (non-channel) sessions.
 */
export function formatChannelContext(channel?: { adapter: string; slug: string }): string {
  if (!channel) return '';
  const label = channel.adapter.charAt(0).toUpperCase() + channel.adapter.slice(1);
  return `\n\n<channel_context adapter="${channel.adapter}" slug="${channel.slug}">
You are responding through a ${label} channel. Your responses are delivered as ${label} messages, not rendered markdown. Adjust your output:
- Keep responses concise and conversational
- Avoid tables (not supported in Slack mrkdwn)
- Avoid image markdown syntax (not supported)
- Minimize large code blocks (hard to read in chat)
- Use simple formatting: bold, italic, code, lists, quotes
- Do not include HTML tags
</channel_context>`;
}

/**
 * Format git context for injection into user messages.
 * Returns concise XML-tagged context for the agent, or empty string if no git info.
 * Includes current branch (or detached HEAD) and PR information when available.
 */
export function formatGitContext(gitState?: GitState | null, prInfo?: PrInfo | null): string {
  if (!gitState || !gitState.isRepo) {
    return '';
  }

  const lines: string[] = [];

  if (gitState.isDetached && gitState.detachedHead) {
    lines.push(`Detached HEAD: ${gitState.detachedHead}`);
  } else if (gitState.branch) {
    lines.push(`Current branch: ${gitState.branch}`);
  }

  if (prInfo) {
    const draft = prInfo.isDraft ? ', Draft' : '';
    lines.push(`PR #${prInfo.number}: ${prInfo.title} (${prInfo.state}${draft})`);
  }

  if (lines.length === 0) {
    return '';
  }

  return `<git_context>\n${lines.join('\n')}\n</git_context>`;
}
