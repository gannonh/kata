# Requirements: v1.12.0 Codebase Intelligence

## Knowledge Capture

- [x] **CAP-01**: Greenfield projects build codebase docs progressively during the project lifecycle (not requiring a separate brownfield remap command)
- [x] **CAP-02**: Codebase intel updates incrementally during phase execution (in-skill step after plan completion, scanning changed files and updating index.json)
- [x] **CAP-03**: System detects naming conventions from code (camelCase, PascalCase, snake_case, SCREAMING_SNAKE) with confidence thresholds (5+ samples, 70%+ match)
- [x] **CAP-04**: System detects directory purposes and file suffix patterns from the codebase (components/, hooks/, .test.ts, .service.ts)
- [x] **CAP-05**: System builds a dependency graph from import/export scanning stored in index.json (which files import which)

## Workflow Integration

- [x] **INTEG-01**: Planner agents receive codebase knowledge (architecture, conventions, patterns) in their context when spawned
- [x] **INTEG-02**: Executor agents receive relevant codebase conventions and patterns in their context when spawned
- [x] **INTEG-03**: Verifier agents can check work against established codebase conventions
- [x] **INTEG-04**: Summary.md is auto-generated from .planning/codebase/ docs as a compressed, agent-readable entry point
- [x] **INTEG-05**: Context injection is task-type aware (UI tasks get conventions + structure, API tasks get architecture + integrations)
- [x] **INTEG-06**: Knowledge discovered by one agent (e.g., planner) is available to subsequent agents (e.g., executor) in the same phase

## Knowledge Architecture

- [x] **ARCH-01**: .planning/intel/ directory with index.json, conventions.json, and summary.md as the structured knowledge store
- [x] **ARCH-02**: Progressive disclosure: summary.md serves as entry point (~80-150 lines), pointing to deeper codebase/ docs on demand
- [x] **ARCH-03**: Greenfield knowledge scaffolding during kata-new-project (initial codebase docs generated as code is written, not requiring a separate mapping step)

## Knowledge Maintenance

- [ ] **MAINT-01**: System detects when codebase docs are stale relative to recent code changes (git blame comparison)
- [ ] **MAINT-02**: Doc gardening triggers partial re-analysis of codebase docs when documented code areas change significantly
- [ ] **MAINT-03**: Convention enforcement validates new code against detected patterns during execution (in-skill check, not hook)
- [x] **MAINT-04**: Knowledge artifacts include freshness metadata (generation timestamps, confidence scores, last-indexed commit hash)

## Future Requirements (Deferred)

- Cross-repository intelligence (multi-repo awareness)
- Vector embedding / semantic search
- AST parsing via tree-sitter
- Real-time file watching
- Custom query language for intel
- IDE / LSP integration
- Full git history mining

## Out of Scope

- **Vector databases / embedding infrastructure** — Kata is zero-dependency CLI. Claude's native understanding + Grep/Glob is sufficient retrieval.
- **Tree-sitter / AST parsing** — Native binaries and multi-language grammars add too much complexity. Regex-based scanning covers 80% of use cases.
- **Cloud-hosted indexing** — Kata runs locally, no server, no accounts.
- **Automatic refactoring suggestions** — CONCERNS.md captures tech debt. Human decides when to act.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAP-01 | 56 | Complete |
| CAP-02 | 55 | Complete |
| CAP-03 | 55 | Complete |
| CAP-04 | 55 | Complete |
| CAP-05 | 55 | Complete |
| INTEG-01 | 54 | Complete |
| INTEG-02 | 54 | Complete |
| INTEG-03 | 54 | Complete |
| INTEG-04 | 54 | Complete |
| INTEG-05 | 54 | Complete |
| INTEG-06 | 54 | Complete |
| ARCH-01 | 54 | Complete |
| ARCH-02 | 54 | Complete |
| ARCH-03 | 56 | Complete |
| MAINT-01 | 57 | Pending |
| MAINT-02 | 57 | Pending |
| MAINT-03 | 57 | Pending |
| MAINT-04 | 55 | Complete |
