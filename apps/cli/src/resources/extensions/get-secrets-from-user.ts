/**
 * get-secrets-from-user — paged secure env var collection + apply
 *
 * Collects secrets one-per-page via masked TUI input, then writes them
 * to .env (local), Vercel, or Convex. No ctx.callTool, no external deps.
 * Uses Node fs/promises for file I/O and pi.exec() for CLI sinks.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CURSOR_MARKER, Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CollectedSecret {
	key: string;
	value: string | null; // null = skipped
}

interface ToolResultDetails {
	destination: string;
	environment?: string;
	applied: string[];
	skipped: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskPreview(value: string): string {
	if (!value) return "";
	if (value.length <= 8) return "*".repeat(value.length);
	return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

/**
 * Replace editor visible text with masked characters while preserving ANSI cursor/sequencer codes.
 */
function maskEditorLine(line: string): string {
	// Keep border / metadata lines readable.
	if (line.startsWith("─")) {
		return line;
	}

	let output = "";
	let i = 0;
	while (i < line.length) {
		if (line.startsWith(CURSOR_MARKER, i)) {
			output += CURSOR_MARKER;
			i += CURSOR_MARKER.length;
			continue;
		}

		const ansiMatch = /^\x1b\[[0-9;]*m/.exec(line.slice(i));
		if (ansiMatch) {
			output += ansiMatch[0];
			i += ansiMatch[0].length;
			continue;
		}

		const ch = line[i] as string;
		output += ch === " " ? " " : "*";
		i += 1;
	}

	return output;
}

function shellEscapeSingle(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function writeEnvKey(filePath: string, key: string, value: string): Promise<void> {
	let content = "";
	try {
		content = await readFile(filePath, "utf8");
	} catch {
		content = "";
	}
	const escaped = value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "");
	const line = `${key}=${escaped}`;
	const regex = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=.*$`, "m");
	if (regex.test(content)) {
		content = content.replace(regex, line);
	} else {
		if (content.length > 0 && !content.endsWith("\n")) content += "\n";
		content += `${line}\n`;
	}
	await writeFile(filePath, content, "utf8");
}

// ─── Paged secure input UI ────────────────────────────────────────────────────

/**
 * Show a single-key masked input page via ctx.ui.custom().
 * Returns the entered value, or null if skipped/cancelled.
 */
async function collectOneSecret(
	ctx: { ui: any; hasUI: boolean },
	pageIndex: number,
	totalPages: number,
	keyName: string,
	hint: string | undefined,
): Promise<string | null> {
	if (!ctx.hasUI) return null;

	return ctx.ui.custom<string | null>((tui: any, theme: any, _kb: any, done: (r: string | null) => void) => {
		let value = "";
		let cachedLines: string[] | undefined;

		const editorTheme: EditorTheme = {
			borderColor: (s: string) => theme.fg("accent", s),
			selectList: {
				selectedPrefix: (t: string) => theme.fg("accent", t),
				selectedText: (t: string) => theme.fg("accent", t),
				description: (t: string) => theme.fg("muted", t),
				scrollInfo: (t: string) => theme.fg("dim", t),
				noMatch: (t: string) => theme.fg("warning", t),
			},
		};
		const editor = new Editor(tui, editorTheme, { paddingX: 1 });

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		function handleInput(data: string) {
			if (matchesKey(data, Key.enter)) {
				value = editor.getText().trim();
				done(value.length > 0 ? value : null);
				return;
			}
			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}
			// ctrl+s = skip this key
			if (data === "\x13") {
				done(null);
				return;
			}
			editor.handleInput(data);
			refresh();
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;
			const lines: string[] = [];
			const add = (s: string) => lines.push(truncateToWidth(s, width));

			add(theme.fg("accent", "─".repeat(width)));
			add(theme.fg("dim", ` Page ${pageIndex + 1}/${totalPages} · Secure Env Setup`));
			lines.push("");

			// Key name as big header
			add(theme.fg("accent", theme.bold(` ${keyName}`)));
			if (hint) {
				add(theme.fg("muted", `  ${hint}`));
			}
			lines.push("");

			// Masked preview
			const raw = editor.getText();
			const preview = raw.length > 0 ? maskPreview(raw) : theme.fg("dim", "(empty — press enter to skip)");
			add(theme.fg("text", `  Preview: ${preview}`));
			lines.push("");

			// Editor
			add(theme.fg("muted", " Enter value:"));
			for (const line of editor.render(width - 2)) {
				add(theme.fg("text", maskEditorLine(line)));
			}

			lines.push("");
			add(theme.fg("dim", ` enter to confirm  |  ctrl+s or esc to skip  |  esc cancels`));
			add(theme.fg("accent", "─".repeat(width)));

			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: () => { cachedLines = undefined; },
			handleInput,
		};
	});
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function secureEnv(pi: ExtensionAPI) {
	pi.registerTool({
		name: "secure_env_collect",
		label: "Secure Env Collect",
		description:
			"Collect one or more env vars through a paged masked-input UI, then write them to .env, Vercel, or Convex. " +
			"Values are shown masked to the user (e.g. sk-ir***dgdh) and never echoed in tool output.",
		promptSnippet: "Collect and apply env vars securely without asking user to edit files manually.",
		promptGuidelines: [
			"NEVER ask the user to manually edit .env files, copy-paste into a terminal, or open a dashboard to set env vars. Always use secure_env_collect instead.",
			"When a command fails due to a missing env var (e.g. 'OPENAI_API_KEY is not set', 'Missing required environment variable', 'Invalid API key', 'authentication required'), immediately call secure_env_collect with the missing keys before retrying.",
			"When starting a new project or running setup steps that require secrets (API keys, tokens, database URLs), proactively call secure_env_collect before the first command that needs them.",
			"Detect the right destination: use 'dotenv' for local dev, 'vercel' when deploying to Vercel, 'convex' when using Convex backend.",
			"After secure_env_collect completes, re-run the originally blocked command to verify the fix worked.",
			"Never echo, log, or repeat secret values in your responses. Only report key names and applied/skipped status.",
		],
		parameters: Type.Object({
			destination: Type.Union([
				Type.Literal("dotenv"),
				Type.Literal("vercel"),
				Type.Literal("convex"),
			], { description: "Where to write the collected secrets" }),
			keys: Type.Array(
				Type.Object({
					key: Type.String({ description: "Env var name, e.g. OPENAI_API_KEY" }),
					hint: Type.Optional(Type.String({ description: "Format hint shown to user, e.g. 'starts with sk-'" })),
					required: Type.Optional(Type.Boolean()),
				}),
				{ minItems: 1 },
			),
			envFilePath: Type.Optional(Type.String({ description: "Path to .env file (dotenv only). Defaults to .env in cwd." })),
			environment: Type.Optional(
				Type.Union([
					Type.Literal("development"),
					Type.Literal("preview"),
					Type.Literal("production"),
				], { description: "Target environment (vercel only)" }),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Error: UI not available (interactive mode required for secure env collection)." }],
					isError: true,
				};
			}

			const collected: CollectedSecret[] = [];

			// Collect one key per page
			for (let i = 0; i < params.keys.length; i++) {
				const item = params.keys[i];
				const value = await collectOneSecret(ctx, i, params.keys.length, item.key, item.hint);
				collected.push({ key: item.key, value });
			}

			const provided = collected.filter((c) => c.value !== null) as Array<{ key: string; value: string }>;
			const skipped = collected.filter((c) => c.value === null).map((c) => c.key);
			const applied: string[] = [];
			const errors: string[] = [];

			// Apply to destination
			if (params.destination === "dotenv") {
				const filePath = resolve(ctx.cwd, params.envFilePath ?? ".env");
				for (const { key, value } of provided) {
					try {
						await writeEnvKey(filePath, key, value);
						applied.push(key);
					} catch (err: any) {
						errors.push(`${key}: ${err.message}`);
					}
				}
			}

			if (params.destination === "vercel") {
				const env = params.environment ?? "development";
				for (const { key, value } of provided) {
					try {
						const result = await pi.exec("sh", [
							"-c",
							`printf %s ${shellEscapeSingle(value)} | vercel env add ${key} ${env}`,
						]);
						if (result.code !== 0) {
							errors.push(`${key}: ${result.stderr.slice(0, 200)}`);
						} else {
							applied.push(key);
						}
					} catch (err: any) {
						errors.push(`${key}: ${err.message}`);
					}
				}
			}

			if (params.destination === "convex") {
				for (const { key, value } of provided) {
					try {
						const result = await pi.exec("sh", [
							"-c",
							`npx convex env set ${key} ${shellEscapeSingle(value)}`,
						]);
						if (result.code !== 0) {
							errors.push(`${key}: ${result.stderr.slice(0, 200)}`);
						} else {
							applied.push(key);
						}
					} catch (err: any) {
						errors.push(`${key}: ${err.message}`);
					}
				}
			}

			const details: ToolResultDetails = {
				destination: params.destination,
				environment: params.environment,
				applied,
				skipped,
			};

			const lines = [
				`destination: ${params.destination}${params.environment ? ` (${params.environment})` : ""}`,
				...applied.map((k) => `✓ ${k}: applied`),
				...skipped.map((k) => `• ${k}: skipped`),
				...errors.map((e) => `✗ ${e}`),
			];

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details,
				isError: errors.length > 0 && applied.length === 0,
			};
		},

		renderCall(args, theme) {
			const count = Array.isArray(args.keys) ? args.keys.length : 0;
			return new Text(
				theme.fg("toolTitle", theme.bold("secure_env_collect ")) +
				theme.fg("muted", `→ ${args.destination}`) +
				theme.fg("dim", `  ${count} key${count !== 1 ? "s" : ""}`),
				0, 0,
			);
		},

		renderResult(result, _options, theme) {
			const details = result.details as ToolResultDetails | undefined;
			if (!details) {
				const t = result.content[0];
				return new Text(t?.type === "text" ? t.text : "", 0, 0);
			}
			const lines = [
				`${theme.fg("success", "✓")} ${details.destination}${details.environment ? ` (${details.environment})` : ""}`,
				...details.applied.map((k) => `  ${theme.fg("success", "✓")} ${k}: applied`),
				...details.skipped.map((k) => `  ${theme.fg("warning", "•")} ${k}: skipped`),
			];
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
