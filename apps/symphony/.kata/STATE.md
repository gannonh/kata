# Kata State

**Active Milestone:** M001 — Full Spec Conformance
**Active Slice:** S05 — Codex App-Server Client
**Active Task:** —
**Phase:** Ready for S05 planning

## Progress

- [x] S01: Domain Types and Error Foundation — 13 contract tests, all §4.1 types, AgentEvent enum, error categories
- [x] S02: Workflow Loader and Config Layer — 19 tests; parse_workflow, from_workflow, validate, WorkflowStore hot-reload all proven
- [x] S03: Linear Tracker Client — TrackerAdapter trait + LinearAdapter + 33 integration tests; all slice verification items pass; 80 total tests
- [x] S04: Workspace Manager and Prompt Builder — 28 tests; path_safety, prompt_builder, workspace modules; 111 total tests; R004+R007 validated
- [ ] S05: Codex App-Server Client
- [ ] S06: Orchestrator Core
- [ ] S07: HTTP Dashboard and JSON API
- [ ] S08: SSH Remote Worker Extension
- [ ] S09: Conformance Sweep and Integration Polish

## Recent Decisions

- D022: extern "C" kill(2) FFI for hook timeout kill (avoids libc crate dependency)
- D023: liquid::to_object serde serialization for Issue → Liquid Object conversion

## Blockers

- None

## Next Action

Begin S05: Codex App-Server Client — subprocess launch, JSON-RPC over stdio, turn streaming, token accounting, linear_graphql dynamic tool.

## Validated Requirements

- R001 (WORKFLOW.md Parsing and Dynamic Reload) — S02
- R002 (Typed Config Layer) — S02
- R004 (Workspace Manager with Safety Invariants) — S04
- R007 (Prompt Builder with Strict Liquid Rendering) — S04
