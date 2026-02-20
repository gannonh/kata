# Context Retrieval Contract v1

> Reference-only document: this contract is supporting context. Active execution tracking is managed in Linear (`Kata Desktop App` project).

Status: Proposed v1 contract for Context Engine integration with Kata Cloud.
Audience: Context Engine team and Kata Cloud integration owners.

## 1. Purpose

Define a stable request/response contract for context retrieval used by orchestrator runs.
This contract is the integration boundary. Engine internals can vary as long as the contract is honored.

## 2. Current Integration Boundary in Kata Cloud

Kata Cloud currently uses typed retrieval contracts in:
- `src/context/types.ts`
- `src/context/context-adapter.ts`
- `src/main/index.ts` (`kata-cloud/context:retrieve` IPC handler)
- `src/shared/shell-api.ts` (`retrieveContext` bridge API)

Kata Cloud expects retrieval to return ranked snippets, or an empty list when no match exists.

## 3. Contract v1

### 3.1 Request

```ts
export type ContextProviderId = "filesystem" | "mcp";

export interface ContextRetrievalRequest {
  prompt: string;
  spaceId: string;
  sessionId: string;
  rootPath: string;
  providerId: ContextProviderId;
  limit?: number; // default handled by provider/adapter
}
```

Rules:
1. `prompt`, `spaceId`, `sessionId`, and `rootPath` are required.
2. `limit` is optional; provider SHOULD cap to a safe max.
3. `providerId` selects retrieval backend. For Context Engine project kickoff, treat `"mcp"` as the engine-backed path.

### 3.2 Response

```ts
export interface ContextSnippet {
  id: string;
  provider: ContextProviderId;
  path: string;
  source: string;
  content: string;
  score: number;
}
```

Rules:
1. Return `ContextSnippet[]` sorted by descending relevance (`score`).
2. Return `[]` for no matches (do not throw for empty-result queries).
3. `id` MUST be stable within a retrieval source (for traceability/debugging).
4. `score` MUST be finite and comparable across results in the same response.
5. `content` SHOULD be concise snippet text suitable for prompt inclusion.

### 3.3 Error Contract

For invalid input or system faults, throw an error with one of these categories:
- `invalid_request`
- `unauthorized`
- `unavailable`
- `timeout`
- `internal`

Guidelines:
1. Error messages returned to UI MUST be safe and non-secret.
2. Sensitive internals MAY be logged server-side but MUST NOT be surfaced to user.
3. Empty results are not errors.

## 4. Behavioral Expectations

1. Deterministic ordering: same request over unchanged corpus should produce stable top ordering.
2. Bounded latency: optimized for interactive orchestrator flow; target p95 under 1.5s for small-medium local repos.
3. Bounded payload: respect `limit`; truncate snippet text to practical size.
4. Resilience: unreadable files or partial index failures SHOULD degrade gracefully, not fail the full request.

## 5. Security and Scope

1. Retrieval scope MUST remain under the requested `rootPath` boundary.
2. Path traversal and symlink escape protections are required.
3. Secrets in snippet content should be filtered/redacted where feasible.

## 6. Compatibility and Versioning

1. This is `v1` contract behavior.
2. Backward-compatible additions are allowed (optional fields only).
3. Breaking field changes require a new contract version and adapter update in Kata Cloud.

## 7. Acceptance Tests for Engine Team

A provider implementation is v1-ready when all pass:
1. Valid request returns ranked `ContextSnippet[]` with required fields.
2. Empty corpus/query returns `[]`.
3. `limit` is honored.
4. Out-of-scope path request is rejected safely (`invalid_request`).
5. Error categories map to contract values.
6. Response ordering is deterministic for identical inputs.

## 8. Implementation Guidance for Current Project Kickoff

1. Deliver engine-backed retrieval behind the `"mcp"` provider path first.
2. Keep filesystem provider behavior as current fallback in Kata Cloud.
3. Do not couple engine internals to renderer/UI types; integrate only through this contract.
