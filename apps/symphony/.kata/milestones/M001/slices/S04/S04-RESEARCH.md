# S04: Workspace Manager and Prompt Builder — Research

**Date:** 2026-03-17

## Summary

S04 delivers three new Rust modules (`path_safety.rs`, `workspace.rs`, `prompt_builder.rs`) that map directly to their Elixir counterparts. The workspace manager creates per-issue directories under a configurable root, enforces path safety invariants (sanitization, root containment, symlink detection), runs lifecycle hooks with timeout enforcement, and manages cleanup. The prompt builder renders the WORKFLOW.md Liquid template with strict variable checking using the `issue` and `attempt` variables.

The Elixir reference implementation (~380 LOC across workspace.ex + path_safety.ex + prompt_builder.ex) is well-structured and the Rust port can follow the same logical structure using idiomatic Rust patterns. Key technical decisions center on (a) the `liquid_core::model::to_object` serialization path for converting `Issue` structs to Liquid template objects, (b) `std::fs::canonicalize` vs custom symlink-aware resolution for path safety, and (c) `tokio::process::Command` with timeout for hook execution.

All dependent types and modules are already in place from S01 and S02. The `liquid` crate (v0.26) already enforces strict unknown-variable rejection by default (proven in S02 tests), so no additional configuration is needed.

## Recommendation

Implement the three modules in dependency order: `path_safety.rs` first (pure functions, no I/O dependencies), then `prompt_builder.rs` (depends only on liquid + domain types), then `workspace.rs` (depends on both plus filesystem operations and subprocess execution). Write tests alongside each module. Follow the Elixir reference closely for behavioral parity while using idiomatic Rust patterns.

For path safety, use `std::fs::canonicalize` for the common case but add a custom resolution path for non-existent directories (canonicalize fails on missing paths, but the Elixir impl handles this by resolving existing segments and preserving unresolvable tail segments). For prompt rendering, use `liquid_core::model::to_object` to convert `Issue` → `liquid::Object`, which leverages the existing `Serialize` derive on `Issue`. For hook execution, use `tokio::process::Command` with `tokio::time::timeout` for timeout enforcement, but provide a synchronous wrapper for test compatibility since workspace operations are called from both sync and async contexts.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Liquid template rendering with strict mode | `liquid` crate v0.26 (already in deps) | Already proven in S02 to reject unknown variables by default. `ParserBuilder::with_stdlib()` is the standard setup. |
| Issue → Liquid object conversion | `liquid_core::model::to_object(&issue)` | Converts any `Serialize` type to a `liquid::Object` for template rendering. Issue already derives Serialize. Avoids hand-building the object map. |
| Path canonicalization | `std::fs::canonicalize` + custom fallback | Standard library handles the common case (existing paths). Custom fallback needed only for not-yet-created workspace paths. |
| Subprocess execution with timeout | `tokio::process::Command` + `tokio::time::timeout` | Standard Tokio pattern. Already in deps. |
| Identifier sanitization | `regex` crate (already in deps) | `Regex::new(r"[^A-Za-z0-9._-]")` replaces non-safe chars with `_`. |
| Temp directories in tests | `tempfile` crate (already in dev-deps) | Creates isolated temp dirs that auto-clean. Already used in S02 tests. |

## Existing Code and Patterns

- `src/domain.rs` — `Issue` (derives Serialize), `BlockerRef` (derives Serialize), `Workspace` struct (path, workspace_key, created_now), `WorkspaceConfig` (root field with default), `HooksConfig` (after_create/before_run/after_run/before_remove + timeout_ms with 60000ms default). All types are ready to use.
- `src/error.rs` — `WorkspaceOutsideRoot`, `WorkspaceHookFailed`, `WorkspaceHookTimeout`, `TemplateParseError`, `TemplateRenderError` variants already defined. Ready for use.
- `src/config.rs` — `from_workflow()` and `validate()` are fully implemented. `WorkspaceConfig.root` is already resolved via `$VAR` and `~` expansion in the config layer.
- `src/workflow_store.rs` — `WorkflowStore::effective_config()` returns `(WorkflowDefinition, ServiceConfig)`. The prompt_builder should accept the template string directly (from `WorkflowDefinition.prompt_template`) rather than coupling to the store.
- `tests/workflow_config_tests.rs` — Liquid strict mode already proven: `test_liquid_unknown_variable_error` and `test_liquid_known_variables_render`. Follow same test patterns.
- `src/lib.rs` — Module stubs for `path_safety`, `prompt_builder`, `workspace` are commented out. Uncomment when implementing.

## Constraints

- **No SSH in this slice.** The Elixir workspace.ex handles both local and remote (SSH) workspace operations. S04 implements only the local path — SSH is S08's scope. The `worker_host` parameter should be absent from the S04 API; S08 extends the interface later.
- **Hook execution must use `sh -lc <script>`** (Spec §9.4). The Elixir impl uses `System.cmd("sh", ["-lc", command])` with `cd: workspace`. Rust equivalent: `Command::new("sh").args(["-lc", &command]).current_dir(&workspace_path)`.
- **`std::fs::canonicalize` resolves symlinks but fails on non-existent paths.** The Elixir `PathSafety.canonicalize` handles this by walking path segments and only resolving symlinks for existing segments, preserving non-existent tail segments as-is. The Rust implementation needs the same behavior for workspace creation (workspace path doesn't exist yet when first validated).
- **`Issue` has `Option<DateTime<Utc>>` fields** (created_at, updated_at). Chrono with `serde` feature serializes `DateTime<Utc>` to ISO 8601 strings. When `None`, Liquid serialization produces `Nil`, which renders as empty string. This matches the Elixir behavior where nil fields produce empty output.
- **`ApiKey` does not derive Serialize** — but it's on `TrackerConfig`, not `Issue`. The `Issue` struct is fully serializable. No issue here.
- **liquid `to_object` requires all fields to be serializable as a map.** The `Issue` struct has only scalar, Vec, Option, and nested Serialize types. `BlockerRef` also derives Serialize. This should work out of the box.
- **Test compatibility.** S02 established `std::sync::RwLock + std::thread` (D018) for sync/async compatibility. Workspace hooks use subprocess execution which is naturally async. Tests can use `#[tokio::test]` since we need async timeout enforcement. Alternatively, provide a blocking sync API that uses `std::process::Command` with thread-based timeout (simpler, matches Elixir's Task.async + Task.yield pattern).

## Common Pitfalls

- **`std::fs::canonicalize` fails on non-existent paths.** The workspace directory doesn't exist before creation. Must implement a custom `canonicalize` that resolves existing prefix segments and appends remaining segments literally. This is exactly what the Elixir `PathSafety.resolve_segments` does.
- **Hook output capture and truncation.** The Elixir impl truncates hook output to 2KB for logging (`sanitize_hook_output_for_log`). The Rust implementation should do the same to prevent multi-MB hook output from flooding logs.
- **Race condition in workspace creation.** Multiple concurrent dispatch attempts for the same issue could race to create the workspace. The Elixir impl doesn't guard against this (it relies on the orchestrator's `claimed` set to prevent double-dispatch). The Rust impl should follow the same approach — workspace creation is not concurrency-safe by itself, but the orchestrator ensures single-dispatch per issue.
- **Liquid `object!` macro vs `to_object` function.** The `object!` macro builds a compile-time object literal. For dynamic Issue data, use `liquid_core::model::to_object(&issue)` which serializes at runtime via serde. Then build the outer globals object with `object!` containing the nested issue object.
- **Liquid value type for `attempt`.** The `attempt` parameter is `Option<u32>`. When `None` (first run), it should render as empty/nil. When `Some(n)`, it should render as the integer. `liquid_core::model::to_value(&attempt)` handles this: `None` → `Nil`, `Some(3)` → scalar 3.
- **Hook timeout must kill the child process.** Using `tokio::time::timeout` around a `child.wait_with_output()` future will cancel the wait but won't kill the child. Must explicitly call `child.kill()` on timeout. Alternatively, use `std::process::Command` with a separate watchdog thread (simpler, avoids async in workspace operations).
- **Symlink escape detection.** The Elixir impl has a three-way check: (1) canonical_workspace == canonical_root → reject (equals root), (2) canonical_workspace starts with canonical_root/ → accept, (3) expanded_workspace starts with expanded_root/ but canonical doesn't → reject (symlink escape). The Rust impl must handle all three cases.
- **`after_run` and `before_remove` hook failures are logged but ignored.** Only `after_create` and `before_run` failures are fatal. This asymmetry must be preserved.

## Open Risks

- **`liquid_core::model::to_object` with `chrono::DateTime<Utc>`.** Chrono serializes DateTime to a string, but the liquid Value serializer may not handle this as expected. Need to verify that `DateTime<Utc>` serializes to a string scalar that liquid can render. If it serializes to a map or complex type, we'll need a custom conversion step (like the Elixir `to_solid_value` that converts DateTime to ISO string). **Mitigation:** Write a test early that renders `{{ issue.created_at }}` and verify output.
- **`liquid_core::model::to_object` with `Option<T>` fields.** When `created_at: None`, serde serializes to `null`. Liquid's `to_object` may convert this to `Nil`. Accessing `{{ issue.created_at }}` with strict mode on a `Nil` value might error vs render empty. Need to verify behavior. **Mitigation:** Test with both `Some(dt)` and `None` values.
- **`liquid_core::model::to_object` with Vec<BlockerRef>.** The `blocked_by` field is `Vec<BlockerRef>`. Need to verify this serializes to a Liquid array of objects that can be iterated with `{% for blocker in issue.blocked_by %}`. **Mitigation:** Write a test with a for-loop template over blockers.
- **Workspace path with `~` in root.** `WorkspaceConfig.root` may contain `~` if expansion fails (e.g., `$HOME` not set). Path safety must handle this. In practice, the config layer does `~` expansion, so this is unlikely but should be tested.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Rust / Cargo | — | No Rust-specific agent skill needed; standard Cargo toolchain |
| Liquid templates | — | Shopify Liquid docs not applicable to Rust crate; crate source is the reference |

No additional skills to install — the core technologies (Rust, liquid crate, tokio) are well-understood and the Elixir reference provides the behavioral specification.

## Sources

- Spec §9.1–9.5 (Workspace Management and Safety) — authoritative behavioral contract for workspace creation, hooks, and safety invariants
- Spec §12.1–12.4 (Prompt Construction and Context Assembly) — rendering rules, retry/continuation semantics, failure semantics
- Spec §17.1 (Workflow and Config Parsing) — conformance tests for prompt rendering with strict mode
- Spec §17.2 (Workspace Manager and Safety) — conformance tests for deterministic paths, hooks, path sanitization, root containment
- Elixir `workspace.ex` (~230 LOC) — reference implementation with local+SSH paths, hook execution, validation
- Elixir `path_safety.ex` (~50 LOC) — segment-by-segment symlink resolution with non-existent path handling
- Elixir `prompt_builder.ex` (~55 LOC) — Solid (Liquid-compatible) rendering with strict mode, struct→map conversion, DateTime→ISO8601
- Elixir `workspace_and_config_test.exs` (~30 workspace tests) — extensive workspace lifecycle, hook, and path safety test coverage
- Elixir `core_test.exs` (prompt builder tests at line 767+) — prompt rendering with issue fields, DateTime, strict mode, template parse errors
- `liquid_core::model::to_object` (source: crate source at `liquid-core-0.26.11/src/model/object/ser.rs`) — serde-based struct→Object conversion
- `liquid_core::model::to_value` (source: crate source at `liquid-core-0.26.11/src/model/value/ser.rs`) — serde-based value→Value conversion including Option→Nil handling
