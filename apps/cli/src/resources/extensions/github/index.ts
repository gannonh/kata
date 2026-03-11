/**
 * GitHub Extension — /gh
 *
 * Full-suite GitHub issues and PR tracker/helper for pi.
 * Provides LLM tools + /gh slash command for managing issues, PRs,
 * reviews, labels, milestones, and comments.
 *
 * Auth: gh CLI (preferred) → GITHUB_TOKEN env var (fallback)
 *
 * Tools:
 *   github_issues    — list, view, create, update, close, search issues
 *   github_prs       — list, view, create, update, diff, files, checks for PRs
 *   github_comments  — list, add comments on issues/PRs
 *   github_reviews   — list, create reviews, request reviewers
 *   github_labels    — list, create labels; list, create milestones
 *
 * Commands:
 *   /gh issues [state]        — browse issues
 *   /gh prs [state]           — browse PRs
 *   /gh view <number>         — view issue or PR detail
 *   /gh create issue          — create issue interactively
 *   /gh create pr             — create PR from current branch
 *   /gh labels                — list labels
 *   /gh milestones            — list milestones
 *   /gh status                — show auth + repo status
 */

import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";
import { showConfirm } from "../shared/confirm-ui.js";

import {
	isAuthenticated,
	authMethod,
	detectRepo,
	getCurrentBranch,
	getDefaultBranch,
	type RepoInfo,
	listIssues,
	getIssue,
	createIssue,
	updateIssue,
	addComment,
	listComments,
	listPullRequests,
	getPullRequest,
	createPullRequest,
	updatePullRequest,
	getPullRequestDiff,
	listPullRequestFiles,
	listReviews,
	createReview,
	requestReviewers,
	listCheckRuns,
	listLabels,
	createLabel,
	listMilestones,
	createMilestone,
	searchIssues,
} from "./gh-api.js";

import {
	formatIssueList,
	formatIssueDetail,
	formatPRList,
	formatPRDetail,
	formatCommentList,
	formatReviewList,
	formatFileChanges,
	formatLabelList,
	formatMilestoneList,
} from "./formatters.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireRepo(cwd: string): RepoInfo {
	const repo = detectRepo(cwd);
	if (!repo) throw new Error("Not in a GitHub repository. Run this from a git repo with a GitHub remote.");
	return repo;
}

function requireAuth(): void {
	if (!isAuthenticated()) {
		throw new Error("Not authenticated to GitHub. Install and authenticate `gh` CLI, or set GITHUB_TOKEN env var.");
	}
}

function truncateOutput(text: string): string {
	const result = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
	if (result.truncated) {
		return result.content + `\n\n[Output truncated: showing ${result.outputLines}/${result.totalLines} lines]`;
	}
	return result.content;
}

function textResult(text: string, details?: Record<string, unknown>) {
	return {
		content: [{ type: "text" as const, text: truncateOutput(text) }],
		...(details ? { details } : {}),
	};
}

/**
 * Confirmation gate for outward-facing GitHub actions.
 * Shows a themed yes/no confirmation in interactive mode.
 * In non-interactive mode (no UI), blocks the action.
 * Returns the rejected textResult if denied, or undefined if confirmed.
 */
async function confirmAction(
	ctx: ExtensionContext,
	action: string,
): Promise<ReturnType<typeof textResult> | undefined> {
	if (!ctx.hasUI) {
		return textResult(`Blocked: "${action}" requires user confirmation but no UI is available.`);
	}
	const confirmed = await showConfirm(ctx, {
		title: "GitHub",
		message: action,
	});
	if (!confirmed) {
		return textResult(`Cancelled: user declined "${action}".`);
	}
	return undefined;
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ─── Tool: github_issues ────────────────────────────────────────────────

	pi.registerTool({
		name: "github_issues",
		label: "GitHub Issues",
		description: "Manage GitHub issues: list, view, create, update, close, reopen, or search issues in the current repository.",
		promptSnippet: "List, view, create, update, close, reopen, or search GitHub issues",
		promptGuidelines: [
			"Use github_issues to interact with GitHub issues instead of running `gh` CLI commands directly.",
			"When listing issues, default to state='open' and include relevant filters like labels or assignee.",
			"When searching, use GitHub search syntax in the query (e.g., 'is:open label:bug').",
			"Mutating actions (create, update, close, reopen) require user confirmation before executing.",
		],
		parameters: Type.Object({
			action: StringEnum(["list", "view", "create", "update", "close", "reopen", "search"] as const),
			number: Type.Optional(Type.Number({ description: "Issue number (for view/update/close/reopen)" })),
			title: Type.Optional(Type.String({ description: "Issue title (for create)" })),
			body: Type.Optional(Type.String({ description: "Issue body (for create/update)" })),
			labels: Type.Optional(Type.String({ description: "Comma-separated labels (for list filter or create/update)" })),
			assignee: Type.Optional(Type.String({ description: "Assignee username (for list filter or create/update)" })),
			assignees: Type.Optional(Type.String({ description: "Comma-separated assignees (for create/update)" })),
			milestone: Type.Optional(Type.String({ description: "Milestone number or title (for list filter)" })),
			state: Type.Optional(StringEnum(["open", "closed", "all"] as const)),
			query: Type.Optional(Type.String({ description: "Search query using GitHub search syntax (for search action)" })),
			per_page: Type.Optional(Type.Number({ description: "Results per page (default 30, max 100)" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			requireAuth();
			const repo = requireRepo(ctx.cwd);

			switch (params.action) {
				case "list": {
					const issues = await listIssues(repo, {
						state: params.state,
						labels: params.labels,
						assignee: params.assignee,
						milestone: params.milestone,
						per_page: params.per_page,
					});
					return textResult(
						`Issues in ${repo.fullName} (${params.state ?? "open"}):\n\n${formatIssueList(issues)}`,
						{ issues: issues.map((i) => ({ number: i.number, title: i.title, state: i.state })) },
					);
				}
				case "view": {
					if (!params.number) return textResult("Error: 'number' is required for view action.");
					const issue = await getIssue(repo, params.number);
					const comments = await listComments(repo, params.number);
					let text = formatIssueDetail(issue);
					if (comments.length) {
						text += `\n\n## Comments (${comments.length})\n\n${formatCommentList(comments)}`;
					}
					return textResult(text, { issue: { number: issue.number, title: issue.title, state: issue.state } });
				}
				case "create": {
					if (!params.title) return textResult("Error: 'title' is required for create action.");
					const createGate = await confirmAction(ctx, `Create issue "${params.title}"?`);
					if (createGate) return createGate;
					const newIssue = await createIssue(repo, {
						title: params.title,
						body: params.body,
						labels: params.labels?.split(",").map((l) => l.trim()),
						assignees: params.assignees?.split(",").map((a) => a.trim()),
					});
					return textResult(
						`Created issue #${newIssue.number}: ${newIssue.title}\n${newIssue.html_url}`,
						{ issue: { number: newIssue.number, title: newIssue.title } },
					);
				}
				case "update": {
					if (!params.number) return textResult("Error: 'number' is required for update action.");
					const updateGate = await confirmAction(ctx, `Update issue #${params.number}?`);
					if (updateGate) return updateGate;
					const updated = await updateIssue(repo, params.number, {
						title: params.title,
						body: params.body,
						labels: params.labels?.split(",").map((l) => l.trim()),
						assignees: params.assignees?.split(",").map((a) => a.trim()),
					});
					return textResult(
						`Updated issue #${updated.number}: ${updated.title}\n${updated.html_url}`,
						{ issue: { number: updated.number, title: updated.title } },
					);
				}
				case "close": {
					if (!params.number) return textResult("Error: 'number' is required for close action.");
					const closeGate = await confirmAction(ctx, `Close issue #${params.number}?`);
					if (closeGate) return closeGate;
					const closed = await updateIssue(repo, params.number, { state: "closed" });
					return textResult(`Closed issue #${closed.number}: ${closed.title}`, { issue: { number: closed.number } });
				}
				case "reopen": {
					if (!params.number) return textResult("Error: 'number' is required for reopen action.");
					const reopenGate = await confirmAction(ctx, `Reopen issue #${params.number}?`);
					if (reopenGate) return reopenGate;
					const reopened = await updateIssue(repo, params.number, { state: "open" });
					return textResult(`Reopened issue #${reopened.number}: ${reopened.title}`, { issue: { number: reopened.number } });
				}
				case "search": {
					if (!params.query) return textResult("Error: 'query' is required for search action.");
					const q = `repo:${repo.fullName} ${params.query}`;
					const results = await searchIssues(q, { per_page: params.per_page });
					const issuesOnly = results.items.filter((i) => !i.pull_request);
					return textResult(
						`Search results (${results.total_count} total, showing ${issuesOnly.length}):\n\n${formatIssueList(issuesOnly)}`,
						{ total: results.total_count },
					);
				}
				default:
					return textResult(`Unknown action: ${params.action}`);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("github_issues "));
			text += theme.fg("muted", `${args.action ?? "?"}`);
			if (args.number) text += theme.fg("accent", ` #${args.number}`);
			if (args.title) text += theme.fg("dim", ` "${args.title}"`);
			if (args.query) text += theme.fg("dim", ` "${args.query}"`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Fetching from GitHub..."), 0, 0);
			const content = result.content?.[0]?.type === "text" ? result.content[0].text : "";
			if (!expanded) {
				const firstLine = content.split("\n")[0] ?? "";
				return new Text(theme.fg("success", "✓ ") + firstLine, 0, 0);
			}
			return new Text(content, 0, 0);
		},
	});

	// ─── Tool: github_prs ───────────────────────────────────────────────────

	pi.registerTool({
		name: "github_prs",
		label: "GitHub PRs",
		description: "Manage GitHub pull requests: list, view, create, update, get diff, list files, and check CI status.",
		promptSnippet: "List, view, create, update, diff, files, and checks for GitHub pull requests",
		promptGuidelines: [
			"Use github_prs to interact with GitHub pull requests instead of running `gh` CLI commands directly.",
			"Use action='diff' to see the actual code changes in a PR.",
			"Use action='files' for a summary of changed files without the full diff.",
			"Use action='checks' to see CI/CD status for a PR.",
			"Mutating actions (create, update) require user confirmation before executing.",
		],
		parameters: Type.Object({
			action: StringEnum(["list", "view", "create", "update", "diff", "files", "checks"] as const),
			number: Type.Optional(Type.Number({ description: "PR number (for view/update/diff/files/checks)" })),
			title: Type.Optional(Type.String({ description: "PR title (for create)" })),
			body: Type.Optional(Type.String({ description: "PR body (for create/update)" })),
			head: Type.Optional(Type.String({ description: "Head branch (for create, defaults to current branch)" })),
			base: Type.Optional(Type.String({ description: "Base branch (for create, defaults to repo default branch)" })),
			draft: Type.Optional(Type.Boolean({ description: "Create as draft PR (for create)" })),
			state: Type.Optional(StringEnum(["open", "closed", "all"] as const)),
			per_page: Type.Optional(Type.Number({ description: "Results per page (default 30, max 100)" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			requireAuth();
			const repo = requireRepo(ctx.cwd);

			switch (params.action) {
				case "list": {
					const prs = await listPullRequests(repo, {
						state: params.state,
						per_page: params.per_page,
					});
					return textResult(
						`Pull requests in ${repo.fullName} (${params.state ?? "open"}):\n\n${formatPRList(prs)}`,
						{ prs: prs.map((p) => ({ number: p.number, title: p.title, state: p.state, draft: p.draft })) },
					);
				}
				case "view": {
					if (!params.number) return textResult("Error: 'number' is required for view action.");
					const pr = await getPullRequest(repo, params.number);
					const reviews = await listReviews(repo, params.number);
					let text = formatPRDetail(pr);
					if (reviews.length) {
						text += `\n\n## Reviews (${reviews.length})\n\n${formatReviewList(reviews)}`;
					}
					return textResult(text, { pr: { number: pr.number, title: pr.title, state: pr.state } });
				}
				case "create": {
					if (!params.title) return textResult("Error: 'title' is required for create action.");
					const head = params.head ?? getCurrentBranch(ctx.cwd);
					if (!head) return textResult("Error: Could not determine current branch. Provide 'head' parameter.");
					const base = params.base ?? getDefaultBranch(ctx.cwd);
					const createPRGate = await confirmAction(ctx, `Create PR "${params.title}" (${head} → ${base})?`);
					if (createPRGate) return createPRGate;
					const newPR = await createPullRequest(repo, {
						title: params.title,
						body: params.body,
						head,
						base,
						draft: params.draft,
					});
					return textResult(
						`Created PR #${newPR.number}: ${newPR.title}\n${newPR.head.ref} → ${newPR.base.ref}\n${newPR.html_url}`,
						{ pr: { number: newPR.number, title: newPR.title } },
					);
				}
				case "update": {
					if (!params.number) return textResult("Error: 'number' is required for update action.");
					const updatePRGate = await confirmAction(ctx, `Update PR #${params.number}?`);
					if (updatePRGate) return updatePRGate;
					const updated = await updatePullRequest(repo, params.number, {
						title: params.title,
						body: params.body,
						base: params.base,
					});
					return textResult(
						`Updated PR #${updated.number}: ${updated.title}\n${updated.html_url}`,
						{ pr: { number: updated.number, title: updated.title } },
					);
				}
				case "diff": {
					if (!params.number) return textResult("Error: 'number' is required for diff action.");
					const diff = await getPullRequestDiff(repo, params.number);
					return textResult(`Diff for PR #${params.number}:\n\n${diff}`);
				}
				case "files": {
					if (!params.number) return textResult("Error: 'number' is required for files action.");
					const files = await listPullRequestFiles(repo, params.number);
					return textResult(
						`Changed files in PR #${params.number}:\n\n${formatFileChanges(files)}`,
						{ files: files.map((f) => ({ filename: f.filename, status: f.status })) },
					);
				}
				case "checks": {
					if (!params.number) return textResult("Error: 'number' is required for checks action.");
					const pr = await getPullRequest(repo, params.number);
					const checks = await listCheckRuns(repo, pr.head.sha);
					if (!checks.check_runs.length) {
						return textResult(`No CI checks found for PR #${params.number}.`);
					}
					const lines = checks.check_runs.map((c) => {
						const icon = c.conclusion === "success" ? "✓" : c.conclusion === "failure" ? "✗" : c.status === "in_progress" ? "⟳" : "…";
						return `${icon} ${c.name}: ${c.conclusion ?? c.status}`;
					});
					return textResult(
						`CI checks for PR #${params.number}:\n\n${lines.join("\n")}`,
						{ checks: checks.check_runs.map((c) => ({ name: c.name, conclusion: c.conclusion, status: c.status })) },
					);
				}
				default:
					return textResult(`Unknown action: ${params.action}`);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("github_prs "));
			text += theme.fg("muted", `${args.action ?? "?"}`);
			if (args.number) text += theme.fg("accent", ` #${args.number}`);
			if (args.title) text += theme.fg("dim", ` "${args.title}"`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Fetching from GitHub..."), 0, 0);
			const content = result.content?.[0]?.type === "text" ? result.content[0].text : "";
			if (!expanded) {
				const firstLine = content.split("\n")[0] ?? "";
				return new Text(theme.fg("success", "✓ ") + firstLine, 0, 0);
			}
			return new Text(content, 0, 0);
		},
	});

	// ─── Tool: github_comments ──────────────────────────────────────────────

	pi.registerTool({
		name: "github_comments",
		label: "GitHub Comments",
		description: "List or add comments on GitHub issues and pull requests.",
		promptSnippet: "List or add comments on GitHub issues and PRs",
		parameters: Type.Object({
			action: StringEnum(["list", "add"] as const),
			number: Type.Number({ description: "Issue or PR number" }),
			body: Type.Optional(Type.String({ description: "Comment body text (for add)" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			requireAuth();
			const repo = requireRepo(ctx.cwd);

			switch (params.action) {
				case "list": {
					const comments = await listComments(repo, params.number);
					return textResult(
						`Comments on #${params.number} (${comments.length}):\n\n${formatCommentList(comments)}`,
						{ count: comments.length },
					);
				}
				case "add": {
					if (!params.body) return textResult("Error: 'body' is required for add action.");
					const addGate = await confirmAction(ctx, `Add comment on #${params.number}?`);
					if (addGate) return addGate;
					const comment = await addComment(repo, params.number, params.body);
					return textResult(
						`Added comment on #${params.number}: ${comment.html_url}`,
						{ comment: { id: comment.id } },
					);
				}
				default:
					return textResult(`Unknown action: ${params.action}`);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("github_comments "));
			text += theme.fg("muted", `${args.action ?? "?"}`);
			text += theme.fg("accent", ` #${args.number ?? "?"}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Fetching..."), 0, 0);
			const content = result.content?.[0]?.type === "text" ? result.content[0].text : "";
			if (!expanded) {
				const firstLine = content.split("\n")[0] ?? "";
				return new Text(theme.fg("success", "✓ ") + firstLine, 0, 0);
			}
			return new Text(content, 0, 0);
		},
	});

	// ─── Tool: github_reviews ───────────────────────────────────────────────

	pi.registerTool({
		name: "github_reviews",
		label: "GitHub Reviews",
		description: "Manage GitHub PR reviews: list reviews, submit a review (approve/request changes/comment), or request reviewers.",
		promptSnippet: "List reviews, submit reviews, or request reviewers on GitHub PRs",
		promptGuidelines: [
			"Use event='APPROVE' to approve, 'REQUEST_CHANGES' to request changes, 'COMMENT' for a general review comment.",
			"Use action='request_reviewers' to assign reviewers to a PR.",
		],
		parameters: Type.Object({
			action: StringEnum(["list", "submit", "request_reviewers"] as const),
			number: Type.Number({ description: "PR number" }),
			body: Type.Optional(Type.String({ description: "Review body text (for submit)" })),
			event: Type.Optional(StringEnum(["APPROVE", "REQUEST_CHANGES", "COMMENT"] as const)),
			reviewers: Type.Optional(Type.String({ description: "Comma-separated reviewer usernames (for request_reviewers)" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			requireAuth();
			const repo = requireRepo(ctx.cwd);

			switch (params.action) {
				case "list": {
					const reviews = await listReviews(repo, params.number);
					return textResult(
						`Reviews on PR #${params.number} (${reviews.length}):\n\n${formatReviewList(reviews)}`,
						{ count: reviews.length },
					);
				}
				case "submit": {
					if (!params.event) return textResult("Error: 'event' is required for submit action (APPROVE, REQUEST_CHANGES, or COMMENT).");
					const submitGate = await confirmAction(ctx, `Submit ${params.event} review on PR #${params.number}?`);
					if (submitGate) return submitGate;
					const review = await createReview(repo, params.number, {
						body: params.body,
						event: params.event,
					});
					return textResult(
						`Submitted review on PR #${params.number}: ${review.state}\n${review.html_url}`,
						{ review: { id: review.id, state: review.state } },
					);
				}
				case "request_reviewers": {
					if (!params.reviewers) return textResult("Error: 'reviewers' is required for request_reviewers action.");
					const reviewerList = params.reviewers.split(",").map((r) => r.trim());
					const reviewersGate = await confirmAction(ctx, `Request reviewers on PR #${params.number}: ${reviewerList.join(", ")}?`);
					if (reviewersGate) return reviewersGate;
					await requestReviewers(repo, params.number, reviewerList);
					return textResult(
						`Requested reviewers on PR #${params.number}: ${reviewerList.join(", ")}`,
						{ reviewers: reviewerList },
					);
				}
				default:
					return textResult(`Unknown action: ${params.action}`);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("github_reviews "));
			text += theme.fg("muted", `${args.action ?? "?"}`);
			text += theme.fg("accent", ` #${args.number ?? "?"}`);
			if (args.event) text += theme.fg("dim", ` ${args.event}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Processing..."), 0, 0);
			const content = result.content?.[0]?.type === "text" ? result.content[0].text : "";
			if (!expanded) {
				const firstLine = content.split("\n")[0] ?? "";
				return new Text(theme.fg("success", "✓ ") + firstLine, 0, 0);
			}
			return new Text(content, 0, 0);
		},
	});

	// ─── Tool: github_labels ────────────────────────────────────────────────

	pi.registerTool({
		name: "github_labels",
		label: "GitHub Labels",
		description: "Manage GitHub labels and milestones: list/create labels, list/create milestones.",
		promptSnippet: "List or create GitHub labels and milestones",
		parameters: Type.Object({
			action: StringEnum(["list_labels", "create_label", "list_milestones", "create_milestone"] as const),
			name: Type.Optional(Type.String({ description: "Label or milestone name (for create)" })),
			color: Type.Optional(Type.String({ description: "Label hex color without # (for create_label, e.g. 'ff0000')" })),
			description: Type.Optional(Type.String({ description: "Description (for create)" })),
			due_on: Type.Optional(Type.String({ description: "Milestone due date ISO 8601 (for create_milestone, e.g. '2025-12-31T00:00:00Z')" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			requireAuth();
			const repo = requireRepo(ctx.cwd);

			switch (params.action) {
				case "list_labels": {
					const labels = await listLabels(repo);
					return textResult(`Labels in ${repo.fullName}:\n\n${formatLabelList(labels)}`, { count: labels.length });
				}
				case "create_label": {
					if (!params.name) return textResult("Error: 'name' is required for create_label.");
					const labelGate = await confirmAction(ctx, `Create label "${params.name}"?`);
					if (labelGate) return labelGate;
					const label = await createLabel(repo, {
						name: params.name,
						color: params.color ?? "ededed",
						description: params.description,
					});
					return textResult(`Created label: ${label.name} (#${label.color})`, { label: { name: label.name } });
				}
				case "list_milestones": {
					const milestones = await listMilestones(repo);
					return textResult(`Milestones in ${repo.fullName}:\n\n${formatMilestoneList(milestones)}`, { count: milestones.length });
				}
				case "create_milestone": {
					if (!params.name) return textResult("Error: 'name' is required for create_milestone.");
					const milestoneGate = await confirmAction(ctx, `Create milestone "${params.name}"?`);
					if (milestoneGate) return milestoneGate;
					const ms = await createMilestone(repo, {
						title: params.name,
						description: params.description,
						due_on: params.due_on,
					});
					return textResult(`Created milestone: ${ms.title} (#${ms.number})`, { milestone: { number: ms.number, title: ms.title } });
				}
				default:
					return textResult(`Unknown action: ${params.action}`);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("github_labels "));
			text += theme.fg("muted", `${args.action ?? "?"}`);
			if (args.name) text += theme.fg("dim", ` "${args.name}"`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Fetching..."), 0, 0);
			const content = result.content?.[0]?.type === "text" ? result.content[0].text : "";
			if (!expanded) {
				const firstLine = content.split("\n")[0] ?? "";
				return new Text(theme.fg("success", "✓ ") + firstLine, 0, 0);
			}
			return new Text(content, 0, 0);
		},
	});

	// ─── Slash command: /gh ──────────────────────────────────────────────────

	pi.registerCommand("gh", {
		description: "GitHub helper: /gh issues|prs|view|create|labels|milestones|status",

		getArgumentCompletions: (prefix: string) => {
			const subcommands = ["issues", "prs", "view", "create", "labels", "milestones", "status"];
			const parts = prefix.trim().split(/\s+/);

			if (parts.length <= 1) {
				return subcommands
					.filter((cmd) => cmd.startsWith(parts[0] ?? ""))
					.map((cmd) => ({ value: cmd, label: cmd }));
			}

			if (parts[0] === "issues" || parts[0] === "prs") {
				const states = ["open", "closed", "all"];
				const statePrefix = parts[1] ?? "";
				return states
					.filter((s) => s.startsWith(statePrefix))
					.map((s) => ({ value: `${parts[0]} ${s}`, label: s }));
			}

			if (parts[0] === "create") {
				const types = ["issue", "pr"];
				const typePrefix = parts[1] ?? "";
				return types
					.filter((t) => t.startsWith(typePrefix))
					.map((t) => ({ value: `create ${t}`, label: t }));
			}

			return [];
		},

		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/);
			const sub = parts[0];
			const rest = parts.slice(1).join(" ");

			if (!isAuthenticated()) {
				ctx.ui.notify("Not authenticated to GitHub. Install `gh` CLI or set GITHUB_TOKEN.", "error");
				return;
			}

			const repo = detectRepo(ctx.cwd);
			if (!repo && sub !== "status") {
				ctx.ui.notify("Not in a GitHub repository.", "error");
				return;
			}

			try {
				switch (sub) {
					case "issues": {
						const state = (rest as "open" | "closed" | "all") || "open";
						const issues = await listIssues(repo!, { state });
						const display = `Issues in ${repo!.fullName} (${state}):\n\n${formatIssueList(issues)}`;
						pi.sendMessage({ customType: "github", content: display, display: true });
						break;
					}
					case "prs": {
						const state = (rest as "open" | "closed" | "all") || "open";
						const prs = await listPullRequests(repo!, { state });
						const display = `Pull requests in ${repo!.fullName} (${state}):\n\n${formatPRList(prs)}`;
						pi.sendMessage({ customType: "github", content: display, display: true });
						break;
					}
					case "view": {
						const num = parseInt(rest, 10);
						if (isNaN(num)) {
							ctx.ui.notify("Usage: /gh view <number>", "error");
							return;
						}
						// Try as issue first, then PR
						try {
							const issue = await getIssue(repo!, num);
							if (issue.pull_request) {
								// It's a PR
								const pr = await getPullRequest(repo!, num);
								const reviews = await listReviews(repo!, num);
								let text = formatPRDetail(pr);
								if (reviews.length) text += `\n\n## Reviews\n\n${formatReviewList(reviews)}`;
								pi.sendMessage({ customType: "github", content: text, display: true });
							} else {
								const comments = await listComments(repo!, num);
								let text = formatIssueDetail(issue);
								if (comments.length) text += `\n\n## Comments\n\n${formatCommentList(comments)}`;
								pi.sendMessage({ customType: "github", content: text, display: true });
							}
						} catch {
							ctx.ui.notify(`Could not find issue or PR #${num}`, "error");
						}
						break;
					}
					case "create": {
						const type = parts[1];
						if (type === "issue") {
							ctx.ui.notify("Use the agent to create an issue: tell it the title, description, and labels you want.", "info");
						} else if (type === "pr") {
							const branch = getCurrentBranch(ctx.cwd);
							const base = getDefaultBranch(ctx.cwd);
							ctx.ui.notify(
								`Current branch: ${branch}\nBase: ${base}\n\nTell the agent the PR title and description to create it.`,
								"info",
							);
						} else {
							ctx.ui.notify("Usage: /gh create issue|pr", "error");
						}
						break;
					}
					case "labels": {
						const labels = await listLabels(repo!);
						pi.sendMessage({ customType: "github", content: `Labels in ${repo!.fullName}:\n\n${formatLabelList(labels)}`, display: true });
						break;
					}
					case "milestones": {
						const milestones = await listMilestones(repo!);
						pi.sendMessage({
							customType: "github",
							content: `Milestones in ${repo!.fullName}:\n\n${formatMilestoneList(milestones)}`,
							display: true,
						});
						break;
					}
					case "status": {
						const auth = authMethod();
						const repoStr = repo ? `${repo.fullName}` : "not detected";
						const branch = repo ? getCurrentBranch(ctx.cwd) ?? "unknown" : "n/a";
						const text = `GitHub Extension Status\n\nAuth: ${auth}\nRepo: ${repoStr}\nBranch: ${branch}`;
						pi.sendMessage({ customType: "github", content: text, display: true });
						break;
					}
					default:
						ctx.ui.notify("Usage: /gh issues|prs|view|create|labels|milestones|status", "info");
				}
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : String(e);
				ctx.ui.notify(`GitHub error: ${msg}`, "error");
			}
		},
	});

	// ─── Message renderer ───────────────────────────────────────────────────

	pi.registerMessageRenderer("github", (message, _options, theme) => {
		const content = message.content ?? "";
		// Apply some light styling to the GitHub output
		const styled = content
			.replace(/^(# .+)$/gm, (m: string) => theme.fg("accent", theme.bold(m)))
			.replace(/(●)/g, theme.fg("success", "$1"))
			.replace(/(✓)/g, theme.fg("success", "$1"))
			.replace(/(✗)/g, theme.fg("error", "$1"))
			.replace(/(⊕)/g, theme.fg("accent", "$1"))
			.replace(/(◇)/g, theme.fg("dim", "$1"))
			.replace(/(https:\/\/github\.com\S+)/g, theme.fg("mdLink", "$1"));
		return new Text(styled, 0, 0);
	});

	// ─── Session start notification ─────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		const auth = authMethod();
		if (auth === "none") {
			ctx.ui.notify("GitHub extension: not authenticated. Install `gh` CLI or set GITHUB_TOKEN.", "warning");
		}
	});
}
