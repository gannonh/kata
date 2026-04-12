# Linear/Kata Tool Output Hardening

**Date:** 2026-04-12  
**Status:** Approved for planning  
**Scope:** Harden every `linear_*` and `kata_*` tool against context overruns while preserving additive/backward-compatible tool contracts

---

## Problem

Symphony and Kata agent runs are failing because a single Linear/Kata tool call can inject an oversized payload into the conversation before auto-compaction has any chance to recover.

Observed failure modes:

1. `kata_list_documents({ projectId })` can dump large project-wide document bodies into context because document list responses include full `content`.
2. `linear_get_issue` and document read tools can return very large human-authored markdown bodies in one shot.
3. The current Linear/Kata success path in `apps/cli/src/resources/extensions/linear/linear-tools.ts` renders results with a raw `JSON.stringify(data, null, 2)`, which treats valid JSON as safe output even when it is too large for agent context.
4. Even when prompt guidance exists, a single broad tool call can still fail the run immediately. Prompt guardrails help, but tool-layer safety must be the primary defense.

This is not limited to the obvious document tools. Every tool in the `linear_*` and `kata_*` families must be explicitly reviewed and hardened so no tool can silently or abruptly flood context.

---

## Goals

1. Ensure no `linear_*` or `kata_*` tool result can inject more than **50.0KB** of text into agent context.
2. Ensure partial results are **explicitly labeled as partial**.
3. Ensure every partial result provides a **deterministic next retrieval step**.
4. Preserve **additive/backward-compatible** tool contracts:
   - same tool names
   - same main purpose
   - new parameters optional only
5. Replace unsafe raw JSON dumping with **category-aware result rendering**.
6. Complete the work in **one PR / one release**, even if implementation proceeds internally in phases.

---

## Non-goals

1. Hardening `bash`, `read`, or other non-Linear/Kata tool families in this effort.
2. Relying on Symphony prompt changes for correctness.
3. Renaming or redesigning the Linear/Kata tool families from scratch.
4. Shipping a partial rollout where only the highest-risk tools are protected.

Prompt improvements may be added later as a secondary optimization, but they are not part of the core correctness mechanism for this spec.

---

## Reference behavior from pi core tools

The design should mirror the safety properties of pi core tools such as `read`:

- **50KB maximum text output**
- **1-indexed paging offsets**
- clear continuation messaging, e.g.:
  - `[Showing lines X-Y of Z (50.0KB limit). Use offset=N to continue.]`
  - `[N more lines in file. Use offset=N to continue.]`

Relevant reference code:

- `pi-mono/packages/agent/src/core/tools/read.ts`
- `pi-mono/packages/agent/src/core/tools/truncate.ts`

The Linear/Kata tools should reuse the same truncation constants and byte-counting behavior where possible, but should not blindly page raw JSON text. Large text-bearing entity fields must be paged semantically.

---

## Core output contract

Every `linear_*` and `kata_*` tool must satisfy the following invariants:

### 1. Hard cap
A single rendered tool result must never exceed **50.0KB** of text.

### 2. Explicit partial-result signaling
If the tool returns only part of the total result, the output must say so clearly.

Examples:

- `Showing items 1-25 of 93. Use offset=26 to continue.`
- `Showing description lines 1-140 of 610. Use offset=141 to continue.`
- `Large fields omitted from list output. Use linear_get_issue to inspect one issue.`

### 3. Safe continuation path
Every partial-result mode must give the agent a deterministic next step:

- `offset` paging when paging is the right model
- explicit follow-up tool calls when list responses intentionally omit large fields
- compact mutation summaries that point to the correct read/get tool when full inspection is needed

### 4. No silent omission
A result may be compact, summarized, or paged, but it must never look complete when it is only partial.

---

## High-level design

## Shared hardening layer

Add a shared output-hardening module under:

- `apps/cli/src/resources/extensions/linear/`

Suggested names:

- `tool-output.ts`
- or `tool-pagination.ts`

Responsibilities:

1. Apply the 50KB cap consistently
2. Generate consistent continuation messages
3. Support **line-based paging** for large text fields
4. Support **item-based paging** for enumeration tools
5. Render compact summaries for mutations
6. Provide a safe fallback formatter for small structured objects

This module replaces the current unsafe pattern in `linear-tools.ts`:

```ts
function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
```

The new design explicitly renders tool results by category instead of dumping raw JSON.

---

## Tool categories

The full family should be hardened using five strategies.

### A. Content-read tools
Use **line-based paging** over large human-authored text fields.

Contract:

- add optional `offset?: number`
- add optional `limit?: number`
- `offset` is **1-indexed**
- `limit` is the maximum number of lines to return from the large body field
- always include compact metadata
- page the large field semantically instead of paging escaped JSON

Examples:

- `linear_get_document`
- `kata_read_document`
- `linear_get_issue`

### B. Enumeration/list tools
Use **item-based paging** and return compact inventories only.

Contract:

- add optional `offset?: number`
- add optional `limit?: number`
- `offset` is **1-indexed item offset**
- `limit` is max items returned
- omit heavyweight fields such as `content` and `description` by default
- clearly direct the agent to the matching read/get tool for full details

Examples:

- `linear_list_documents`
- `kata_list_documents`
- `linear_list_issues`
- `kata_list_slices`
- `kata_list_tasks`
- `kata_list_milestones`
- all other `*_list_*` tools in the families

### C. Mutation tools
Return **compact success summaries** only.

Contract:

- no paging required in most cases
- do not echo large updated bodies
- include identifiers, timestamps, and safe metadata only
- tell the agent which read/get tool to call if it wants the full content

Examples:

- `kata_write_document`
- `linear_update_document`
- `linear_update_issue`
- `kata_create_slice`
- `kata_create_task`
- `linear_create_document`

### D. Compact read tools
Return safe structured output with the 50KB hard cap, but without paging unless a large field later proves it is needed.

Examples:

- `linear_get_team`
- `linear_get_project`
- `linear_get_milestone`
- `linear_get_viewer`

### E. State/introspection tools
Return compact structured summaries and remain bounded even as payloads evolve.

Example:

- `kata_derive_state`

---

## Family-wide wording standard

All hardened tools should use consistent wording so agents can learn the pattern once.

### Paged content
- `Showing content lines 1-180 of 920. Use offset=181 to continue.`
- `Showing description lines 1-140 of 610. Use offset=141 to continue.`

### Paged lists
- `Showing items 1-25 of 93. Use offset=26 to continue.`

### Omitted heavy fields
- `Large fields omitted from list output. Use linear_get_issue to inspect one issue.`
- `Document contents omitted from list output. Use kata_read_document to read one document.`

### Mutation summaries
- `Document updated. Full content not echoed. Use kata_read_document to inspect content.`

Exact wording does not need to match `read`, but the requirements are the same: the result must be clearly partial and must tell the agent what to do next.

---

## Parameter model

### Content-read tools
Add:

```ts
offset?: number
limit?: number
```

Meaning:

- `offset`: 1-indexed body line to start from
- `limit`: maximum number of body lines to return

### List tools
Add:

```ts
offset?: number
limit?: number
```

Meaning:

- `offset`: 1-indexed item offset
- `limit`: maximum number of items to return

### Mutation tools
Do not add paging parameters unless a specific tool proves it needs them. The default hardening strategy is compact success summaries.

This keeps the change additive while avoiding unnecessary parameters on tools that should never return large bodies in the first place.

---

## Tool-by-tool hardening plan

The following audit is required for this PR. Every tool must be explicitly reviewed and assigned a hardening strategy.

| Tool | Category | Risk | Hardening action |
| --- | --- | --- | --- |
| `linear_list_teams` | list | low | Compact inventory + item paging if needed |
| `linear_get_team` | compact read | low | Safe structured output + 50KB cap |
| `linear_create_project` | mutation | low | Compact success summary |
| `linear_get_project` | compact read | low | Safe structured output + 50KB cap |
| `linear_list_projects` | list | medium | Compact inventory + item paging |
| `linear_update_project` | mutation | low | Compact success summary |
| `linear_delete_project` | mutation | low | Compact success summary |
| `linear_create_milestone` | mutation | low | Compact success summary |
| `linear_get_milestone` | compact read | low | Safe structured output + 50KB cap |
| `linear_list_milestones` | list | medium | Compact inventory + item paging |
| `linear_update_milestone` | mutation | low | Compact success summary |
| `linear_delete_milestone` | mutation | low | Compact success summary |
| `linear_create_issue` | mutation | medium | Compact success summary; do not echo large description |
| `linear_get_issue` | content-read | high | Metadata + paged `description`; compact nested summaries |
| `linear_list_issues` | list | very high | Compact issue inventory only; omit `description`; item paging |
| `linear_create_relation` | mutation | low | Compact success summary |
| `linear_list_relations` | list | medium | Compact inventory + item paging |
| `linear_update_issue` | mutation | high | Compact success summary; do not echo large description |
| `linear_delete_issue` | mutation | low | Compact success summary |
| `linear_list_workflow_states` | list | low | Compact inventory + item paging if needed |
| `linear_create_label` | mutation | low | Compact success summary |
| `linear_list_labels` | list | low | Compact inventory + item paging if needed |
| `linear_delete_label` | mutation | low | Compact success summary |
| `linear_add_comment` | mutation | medium | Compact success summary; do not echo large body |
| `linear_ensure_label` | mutation | low | Compact success summary |
| `linear_create_document` | mutation | high | Compact success summary; do not echo full `content` |
| `linear_get_document` | content-read | very high | Metadata + paged `content` |
| `linear_list_documents` | list | very high | Inventory only; omit `content`; item paging |
| `linear_delete_document` | mutation | low | Compact success summary |
| `linear_update_document` | mutation | high | Compact success summary; do not echo full `content` |
| `linear_get_viewer` | compact read | low | Safe structured output + 50KB cap |
| `kata_ensure_labels` | mutation | low | Compact success summary |
| `kata_create_milestone` | mutation | low | Compact success summary |
| `kata_create_slice` | mutation | medium | Compact success summary; do not echo large description |
| `kata_create_task` | mutation | medium | Compact success summary; do not echo large description |
| `kata_list_slices` | list | high | Compact slice inventory only; item paging; explicit guidance when broad |
| `kata_list_tasks` | list | medium/high | Compact task inventory only; item paging |
| `kata_write_document` | mutation | high | Compact success summary; do not echo full `content` |
| `kata_read_document` | content-read | very high | Metadata + paged `content` |
| `kata_list_documents` | list | very high | Inventory only; omit `content`; item paging |
| `kata_list_milestones` | list | medium | Compact milestone inventory only; item paging |
| `kata_derive_state` | state/introspection | medium | Compact structured summary; no unbounded embedded fields |
| `kata_update_issue_state` | mutation | low | Compact success summary |

If a tool is discovered to have a larger payload surface than this table assumes, the implementation must tighten the strategy before merge.

---

## Query-shape guidance

Primary hardening should live in the tool/render layer. However, some list tools currently fetch heavyweight fields that they do not need for safe default output.

Example:

- `LinearClient.DOCUMENT_FIELDS` includes `content`, which makes `linear_list_documents` and `kata_list_documents` inherently dangerous when used for inventories.

Implementation guidance:

1. Prefer keeping `LinearClient` as the data-fetch layer.
2. If a client query eagerly fetches heavyweight fields that the tool will now omit by design, add lighter query variants or lighter field sets where necessary.
3. Do not keep paying the network/processing cost for very large fields if the tool contract no longer needs them by default.

---

## Error handling

The hardening layer must preserve existing error classification behavior while improving output safety.

Requirements:

1. Error outputs must also stay bounded by 50.0KB.
2. Paging parameters must fail clearly when invalid, for example:
   - `offset < 1`
   - `offset` beyond end of content
   - invalid `limit`
3. A paged content tool should distinguish between:
   - content exists but requested page is out of range
   - resource not found
4. A list tool should distinguish between:
   - no items matched
   - items exist but requested page is out of range

Errors must remain compact and actionable.

---

## Testing strategy

### 1. Shared hardening-layer unit tests

Add dedicated tests for the new output helper(s).

Must cover:

1. Under-limit result returns fully
2. Over-limit result is capped at 50.0KB
3. Content paging uses 1-indexed offsets
4. Content paging respects `limit`
5. Content continuation notes produce the correct next offset
6. Item paging uses 1-indexed item offsets
7. Item continuation notes produce the correct next offset
8. Omitted-field guidance is present for inventory tools
9. Mutation summaries do not echo large bodies
10. Exact-boundary 50KB cases
11. Empty content and empty list cases
12. Very large multiline markdown bodies with code fences and lists

### 2. Tool-level tests

Add or extend tests for the highest-risk tools:

- `kata_list_documents`
- `linear_list_documents`
- `kata_read_document`
- `linear_get_document`
- `linear_get_issue`
- `linear_list_issues`
- `kata_list_slices`
- `kata_write_document`
- `linear_update_document`
- `linear_update_issue`

Must verify:

- no full large bodies in list responses
- `offset` / `limit` work for content-read tools
- list paging is item-based, not raw JSON-line based
- mutation responses stay compact
- continuation instructions are explicit and accurate

### 3. Regression tests for the real failure patterns

Regression coverage must explicitly target the known overflow patterns.

#### Project-wide document inventory flood
Simulate a project with many large documents and verify:

- `kata_list_documents({ projectId })` stays under 50KB
- document `content` is omitted from list output
- output clearly directs the agent to `kata_read_document`
- paging through document inventory remains safe

#### Large issue description flood
Simulate a large issue description and verify:

- `linear_get_issue(id)` stays under 50KB
- `description` is paged by lines
- output clearly directs the agent to use `offset` to continue

The PR is not complete without regression coverage for both patterns.

---

## Development sequencing and delivery

Implementation may proceed internally in phases, for example:

1. shared hardening layer
2. highest-risk content/list tools
3. remaining family audit
4. tests and regressions

However, delivery is **one PR / one release**.

### Merge bar
The PR is only ready when:

1. **Every** `linear_*` and `kata_*` tool has been explicitly reviewed
2. The audit table has been fully implemented
3. High-risk regression tests are present
4. The full family satisfies the 50KB hard cap and explicit continuation rules

Fixing only the biggest offenders is not sufficient for merge.

---

## Acceptance criteria

### Functional
1. No `linear_*` or `kata_*` tool can emit more than **50.0KB** of text.
2. Content-read tools page large body fields safely with optional `offset` / `limit`.
3. Enumeration tools use compact inventories and item-based paging.
4. Mutation tools return compact summaries instead of echoing large bodies.
5. Partial results explicitly state that they are partial and tell the agent how to continue.

### Behavioral
6. An agent can safely inspect a large project's documents without a single tool call flooding context.
7. An agent can safely inspect a large issue description/task plan without overflowing context.
8. An agent can safely enumerate broad slice/task/project inventories without silent result expansion.

### Regression
9. The previously observed `kata_list_documents(projectId)` flood path is eliminated.
10. The large `linear_get_issue` description path is eliminated.

### Compatibility
11. Tool names remain unchanged.
12. New parameters are optional.
13. Existing callers continue to work, but now receive safe bounded output instead of unbounded dumps.

---

## Implementation notes

### Recommended file touch points

Likely implementation files:

- `apps/cli/src/resources/extensions/linear/linear-tools.ts`
- new shared helper under `apps/cli/src/resources/extensions/linear/`
- `apps/cli/src/resources/extensions/linear/linear-client.ts` for lighter query variants where necessary
- `apps/cli/src/resources/extensions/linear/tests/linear-tools.vitest.test.ts`
- additional focused tests under `apps/cli/src/resources/extensions/linear/tests/`

### Design constraint
The implementation should prefer **deliberate rendered outputs** over raw object dumps. A result that is valid JSON is not automatically a safe tool result.

---

## Final recommendation

Implement a shared Linear/Kata output hardening layer that enforces a **50.0KB maximum output** across the full `linear_*` and `kata_*` families, uses **line-based paging** for content reads, uses **item-based paging** for enumerations, returns **compact summaries** for mutations, and requires every partial result to explicitly describe what was omitted and how to continue safely. Complete the entire family audit, tests, and regressions in a **single PR / single release**.
