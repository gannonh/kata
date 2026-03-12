---
estimated_steps: 5
estimated_files: 2
---

# T02: Issue, sub-issue, milestone, and label CRUD operations

**Slice:** S01 — Linear GraphQL Client Extension
**Milestone:** M002

## Description

Add the remaining core entity operations to LinearClient: milestones (under projects), issues (including sub-issues via `parentId`), labels (including idempotent `ensureLabel`), and workflow state queries. These are the operations S03 (hierarchy mapping) and S05 (state derivation) depend on most heavily.

## Steps

1. Add milestone operations to LinearClient: `createMilestone(input: MilestoneCreateInput)` (requires `projectId` per research — milestones belong to projects, not teams), `getMilestone(id: string)`, `listMilestones(projectId: string)`, `updateMilestone(id: string, input: MilestoneUpdateInput)`. GraphQL mutation is `projectMilestoneCreate` / `projectMilestoneUpdate` (not `milestoneCreate`). Return typed `LinearMilestone`.

2. Add issue operations to LinearClient: `createIssue(input: IssueCreateInput)` supporting optional `parentId` (UUID, for sub-issues), `labelIds`, `projectId`, `projectMilestoneId`, `stateId`, `assigneeId`. `getIssue(id: string)` accepting UUID or identifier. `listIssues(filter: IssueFilter)` with filter support for `teamId`, `projectId`, `parentId`, `labelIds`, `stateId`. `updateIssue(id: string, input: IssueUpdateInput)`. All return typed `LinearIssue` with `parent`, `children`, `labels`, `state` populated.

3. Add workflow state operations: `listWorkflowStates(teamId: string)` returning `LinearWorkflowState[]` — needed by S03/S05 to map Kata phases to Linear states. Include `id`, `name`, `type` (backlog, unstarted, started, completed, cancelled), `position` fields.

4. Add label operations: `createLabel(input: LabelCreateInput)` with optional `teamId` (omit for workspace-level labels per research). `listLabels(teamId?: string)`. `getLabel(id: string)`. Add `ensureLabel(name: string, opts?: { teamId?: string, color?: string }): Promise<LinearLabel>` — queries for existing label by name first, creates only if not found. This prevents duplicate `kata:milestone` / `kata:slice` / `kata:task` labels.

5. Verify all operations manually against real Linear API: create a milestone under an existing project, create a parent issue, create a sub-issue under it with a label, query workflow states, use ensureLabel twice with the same name (should return same label). Confirm all return typed results matching LinearUI.

## Must-Haves

- [ ] `createMilestone()` / `getMilestone()` / `listMilestones()` / `updateMilestone()` work with `projectMilestoneCreate` / `projectMilestoneUpdate` mutations
- [ ] `createIssue()` supports `parentId` for sub-issues — verified by creating a parent + child and confirming hierarchy in Linear UI
- [ ] `createIssue()` supports `labelIds`, `projectId`, `projectMilestoneId`, `stateId` optional fields
- [ ] `getIssue()` returns populated `parent`, `children`, `labels`, `state` relations
- [ ] `listIssues()` supports filtering by `teamId`, `projectId`, `parentId`, `labelIds`
- [ ] `listWorkflowStates()` returns all states for a team with `type` field
- [ ] `ensureLabel()` is idempotent — calling twice with same name returns same label, not a duplicate
- [ ] All new methods have TypeScript return types from `linear-types.ts`

## Verification

- Manual: create milestone under project → `getMilestone()` returns it with correct `projectId`
- Manual: create issue, create sub-issue with `parentId` → `getIssue()` on parent shows child in `children`
- Manual: call `ensureLabel("kata:test")` twice → same `id` returned both times
- `npx tsc --noEmit` passes

## Observability Impact

- Signals added/changed: None beyond T01's error classification — all new methods use the same `graphql<T>()` core executor
- How a future agent inspects this: Call any method — errors are classified. Issue queries return full relation data (parent/children/labels/state).
- Failure state exposed: `parentId` must be UUID not identifier — error message will surface "Issue not found" if identifier is passed. Research pitfall documented.

## Inputs

- `src/resources/extensions/linear/linear-client.ts` — T01's LinearClient with core executor + team/project ops
- `src/resources/extensions/linear/linear-types.ts` — T01's type definitions
- `/tmp/linear-cli-inspect/src/utils/linear.ts` — Reference for issue/milestone/label query shapes
- `/tmp/linear-cli-inspect/src/commands/milestone/milestone-create.ts` — `projectMilestoneCreate` mutation signature
- `/tmp/linear-cli-inspect/src/commands/issue/issue-create.ts` — `issueCreate` with `parentId`
- S01-RESEARCH.md — Pitfalls: milestones belong to projects, labels are team-scoped by default, parentId must be UUID

## Expected Output

- `src/resources/extensions/linear/linear-client.ts` — Extended with milestone, issue, label, and workflow state CRUD methods
- `src/resources/extensions/linear/linear-types.ts` — Extended with any additional input/filter types needed
