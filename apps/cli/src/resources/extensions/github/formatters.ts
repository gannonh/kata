/**
 * Formatters — produce text summaries for issues, PRs, comments, etc.
 *
 * Used by both tools (LLM context) and renderers (TUI display).
 */

import type { GhIssue, GhPullRequest, GhComment, GhReview, GhLabel, GhMilestone } from "./gh-api.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
	const now = Date.now();
	const then = new Date(dateStr).getTime();
	const diff = now - then;
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}

function stateIcon(state: string, draft?: boolean): string {
	if (draft) return "◇";
	switch (state) {
		case "open":
			return "●";
		case "closed":
			return "✓";
		case "merged":
			return "⊕";
		default:
			return "○";
	}
}

function truncateBody(body: string | null, maxLines = 10): string {
	if (!body) return "(no description)";
	const lines = body.split("\n");
	if (lines.length <= maxLines) return body;
	return lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} more lines)`;
}

// ─── Issue formatting ─────────────────────────────────────────────────────────

export function formatIssueOneLiner(issue: GhIssue): string {
	const icon = stateIcon(issue.state);
	const labels = issue.labels.map((l) => l.name).join(", ");
	const labelStr = labels ? ` [${labels}]` : "";
	const assignee = issue.assignees.length ? ` → ${issue.assignees.map((a) => a.login).join(", ")}` : "";
	return `${icon} #${issue.number} ${issue.title}${labelStr}${assignee} (${timeAgo(issue.updated_at)})`;
}

export function formatIssueDetail(issue: GhIssue): string {
	const lines: string[] = [];
	lines.push(`# Issue #${issue.number}: ${issue.title}`);
	lines.push(`State: ${issue.state} | Author: @${issue.user.login} | Created: ${timeAgo(issue.created_at)} | Updated: ${timeAgo(issue.updated_at)}`);

	if (issue.assignees.length) {
		lines.push(`Assignees: ${issue.assignees.map((a) => `@${a.login}`).join(", ")}`);
	}
	if (issue.labels.length) {
		lines.push(`Labels: ${issue.labels.map((l) => l.name).join(", ")}`);
	}
	if (issue.milestone) {
		lines.push(`Milestone: ${issue.milestone.title}`);
	}
	lines.push(`Comments: ${issue.comments}`);
	lines.push(`URL: ${issue.html_url}`);
	lines.push("");
	lines.push(truncateBody(issue.body, 30));
	return lines.join("\n");
}

export function formatIssueList(issues: GhIssue[]): string {
	if (!issues.length) return "No issues found.";
	return issues.map(formatIssueOneLiner).join("\n");
}

// ─── PR formatting ────────────────────────────────────────────────────────────

export function formatPROneLiner(pr: GhPullRequest): string {
	const icon = stateIcon(pr.merged_at ? "merged" : pr.state, pr.draft);
	const labels = pr.labels.map((l) => l.name).join(", ");
	const labelStr = labels ? ` [${labels}]` : "";
	const draftStr = pr.draft ? " (draft)" : "";
	const reviewers = pr.requested_reviewers.map((r) => r.login).join(", ");
	const reviewerStr = reviewers ? ` ⟵ ${reviewers}` : "";
	return `${icon} #${pr.number} ${pr.title}${draftStr}${labelStr}${reviewerStr} (${timeAgo(pr.updated_at)})`;
}

export function formatPRDetail(pr: GhPullRequest): string {
	const lines: string[] = [];
	const mergedState = pr.merged_at ? "merged" : pr.state;
	lines.push(`# PR #${pr.number}: ${pr.title}`);
	lines.push(`State: ${mergedState}${pr.draft ? " (draft)" : ""} | Author: @${pr.user.login} | Created: ${timeAgo(pr.created_at)} | Updated: ${timeAgo(pr.updated_at)}`);
	lines.push(`Branch: ${pr.head.ref} → ${pr.base.ref}`);

	if (pr.assignees.length) {
		lines.push(`Assignees: ${pr.assignees.map((a) => `@${a.login}`).join(", ")}`);
	}
	if (pr.labels.length) {
		lines.push(`Labels: ${pr.labels.map((l) => l.name).join(", ")}`);
	}
	if (pr.milestone) {
		lines.push(`Milestone: ${pr.milestone.title}`);
	}
	if (pr.requested_reviewers.length) {
		lines.push(`Reviewers: ${pr.requested_reviewers.map((r) => `@${r.login}`).join(", ")}`);
	}

	lines.push(`Mergeable: ${pr.mergeable === null ? "checking..." : pr.mergeable ? "yes" : "no"} (${pr.mergeable_state})`);
	lines.push(`Comments: ${pr.comments} | Review comments: ${pr.review_comments}`);
	lines.push(`URL: ${pr.html_url}`);
	lines.push("");
	lines.push(truncateBody(pr.body, 30));
	return lines.join("\n");
}

export function formatPRList(prs: GhPullRequest[]): string {
	if (!prs.length) return "No pull requests found.";
	return prs.map(formatPROneLiner).join("\n");
}

// ─── Comment formatting ──────────────────────────────────────────────────────

export function formatComment(comment: GhComment): string {
	return `@${comment.user.login} (${timeAgo(comment.created_at)}):\n${truncateBody(comment.body, 8)}`;
}

export function formatCommentList(comments: GhComment[]): string {
	if (!comments.length) return "No comments.";
	return comments.map(formatComment).join("\n\n---\n\n");
}

// ─── Review formatting ───────────────────────────────────────────────────────

function reviewStateIcon(state: string): string {
	switch (state) {
		case "APPROVED":
			return "✓";
		case "CHANGES_REQUESTED":
			return "✗";
		case "COMMENTED":
			return "💬";
		case "DISMISSED":
			return "—";
		case "PENDING":
			return "…";
		default:
			return "?";
	}
}

export function formatReview(review: GhReview): string {
	const icon = reviewStateIcon(review.state);
	const body = review.body ? `\n${truncateBody(review.body, 5)}` : "";
	return `${icon} @${review.user.login}: ${review.state} (${timeAgo(review.submitted_at)})${body}`;
}

export function formatReviewList(reviews: GhReview[]): string {
	if (!reviews.length) return "No reviews.";
	return reviews.map(formatReview).join("\n\n");
}

// ─── Label / Milestone formatting ─────────────────────────────────────────────

export function formatLabel(label: GhLabel): string {
	const desc = label.description ? ` — ${label.description}` : "";
	return `• ${label.name} (#${label.color})${desc}`;
}

export function formatLabelList(labels: GhLabel[]): string {
	if (!labels.length) return "No labels.";
	return labels.map(formatLabel).join("\n");
}

export function formatMilestone(ms: GhMilestone): string {
	const progress = ms.open_issues + ms.closed_issues > 0 ? Math.round((ms.closed_issues / (ms.open_issues + ms.closed_issues)) * 100) : 0;
	const due = ms.due_on ? ` | Due: ${new Date(ms.due_on).toISOString().split("T")[0]}` : "";
	return `• ${ms.title} (${ms.state}) — ${progress}% complete (${ms.closed_issues}/${ms.open_issues + ms.closed_issues})${due}`;
}

export function formatMilestoneList(milestones: GhMilestone[]): string {
	if (!milestones.length) return "No milestones.";
	return milestones.map(formatMilestone).join("\n");
}

// ─── File change formatting ───────────────────────────────────────────────────

export function formatFileChanges(
	files: { filename: string; status: string; additions: number; deletions: number; changes: number }[],
): string {
	if (!files.length) return "No files changed.";
	const lines = files.map((f) => {
		const statusIcon = f.status === "added" ? "+" : f.status === "removed" ? "-" : "~";
		return `${statusIcon} ${f.filename}  (+${f.additions} -${f.deletions})`;
	});
	const totalAdd = files.reduce((s, f) => s + f.additions, 0);
	const totalDel = files.reduce((s, f) => s + f.deletions, 0);
	lines.push(`\n${files.length} files changed, +${totalAdd} -${totalDel}`);
	return lines.join("\n");
}
