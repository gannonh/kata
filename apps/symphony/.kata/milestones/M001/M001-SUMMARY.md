# M001: Full Spec Conformance — Milestone Summary

## Completed Slices

### S01: Domain Types and Error Foundation
All §4.1 domain types (Issue, BlockerRef, WorkflowDefinition, ServiceConfig, OrchestratorState, AgentEvent, etc.), SymphonyError enum with all spec error categories, ApiKey with redacted Debug. 13 contract tests.

### S02: Workflow Loader and Config Layer
WORKFLOW.md parsing (YAML front matter + Liquid template body), ServiceConfig extraction with defaults/env-var resolution/tilde expansion, config validation, WorkflowStore with hot-reload via notify file watcher (400ms debounce). 19 tests.

### S03: Linear Tracker Client
LinearClient with GraphQL transport, 3 async fetch operations (candidates with cursor pagination, by-states, by-IDs with batch-splitting and order preservation), issue normalization (14 fields), assignee routing with "me" viewer resolution. TrackerAdapter trait (5 async methods) + LinearAdapter. 33 integration tests via mockito HTTP mocking. 80 total tests.

## Cumulative Stats
- 80 tests passing
- Key crates: tokio, reqwest, serde, liquid, chrono, tracing, notify, async-trait
- Key patterns: GraphQL transport, reverse+prepend pagination, order-index preservation, WorkflowStore hot-reload, typed error mapping

## Next
S04: Workspace Manager and Prompt Builder — depends on S01 + S02.
