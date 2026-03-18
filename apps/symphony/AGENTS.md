# Agent Instructions — Symphony-Rust

## What This Project Is

Symphony-Rust is a **feature-parity Rust port** of the Elixir Symphony orchestrator. The goal is not a clean-room reimagining — it is a conforming implementation of the same spec, delivering the same behaviors, with the same edge-case handling.

Elixir implementation: `/Volumes/EVO/kata/openai-symphony/elixir/` (lib + tests)

## Reference Materials — Read Before Implementing

Every slice of work must be grounded in these two sources:

| Source               | Path                                        | What It Is                                                                                                                         |
| -------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **SPEC.md**          | `/Volumes/EVO/kata/openai-symphony/SPEC.md` | Authoritative behavioral contract (2175 lines). Section numbers (§5, §10.4, §14.1, etc.) referenced throughout planning artifacts. |
| **Elixir reference** | `/Volumes/EVO/kata/openai-symphony/elixir/` | Complete working implementation (~9500 LOC lib, ~9800 LOC tests). This is the behavior to match.                                   |

### Key Elixir Source Files (module → Rust target)

| Elixir module           | Path                                        | Rust equivalent                |
| ----------------------- | ------------------------------------------- | ------------------------------ |
| `orchestrator.ex`       | `lib/symphony_elixir/orchestrator.ex`       | `src/orchestrator.rs`          |
| `workflow.ex`           | `lib/symphony_elixir/workflow.ex`           | `src/workflow.rs`              |
| `workflow_store.ex`     | `lib/symphony_elixir/workflow_store.ex`     | `src/workflow_store.rs`        |
| `config.ex`             | `lib/symphony_elixir/config.ex`             | `src/config.rs`                |
| `linear/client.ex`      | `lib/symphony_elixir/linear/client.ex`      | `src/linear/client.rs`         |
| `linear/adapter.ex`     | `lib/symphony_elixir/linear/adapter.ex`     | `src/linear/adapter.rs`        |
| `linear/issue.ex`       | `lib/symphony_elixir/linear/issue.ex`       | `src/domain.rs` (Issue struct) |
| `workspace.ex`          | `lib/symphony_elixir/workspace.ex`          | `src/workspace.rs`             |
| `path_safety.ex`        | `lib/symphony_elixir/path_safety.ex`        | `src/path_safety.rs`           |
| `prompt_builder.ex`     | `lib/symphony_elixir/prompt_builder.ex`     | `src/prompt_builder.rs`        |
| `codex/app_server.ex`   | `lib/symphony_elixir/codex/app_server.ex`   | `src/codex/app_server.rs`      |
| `codex/dynamic_tool.ex` | `lib/symphony_elixir/codex/dynamic_tool.ex` | `src/codex/dynamic_tool.rs`    |
| `http_server.ex`        | `lib/symphony_elixir/http_server.ex`        | `src/http_server.rs`           |
| `ssh.ex`                | `lib/symphony_elixir/ssh.ex`                | `src/ssh.rs`                   |
| `cli.ex`                | `lib/symphony_elixir/cli.ex`                | `src/main.rs`                  |
| `agent_runner.ex`       | `lib/symphony_elixir/agent_runner.ex`       | `src/agent_runner.rs`          |

### Key Elixir Test Files

| Test file                       | What it covers                                     |
| ------------------------------- | -------------------------------------------------- |
| `core_test.exs`                 | Orchestrator loop, dispatch, retry, reconciliation |
| `workspace_and_config_test.exs` | Config parsing, workspace lifecycle, path safety   |
| `extensions_test.exs`           | HTTP server, SSH, linear_graphql                   |
| `cli_test.exs`                  | CLI argument parsing, startup validation           |
| `dynamic_tool_test.exs`         | linear_graphql tool handling                       |
| `live_e2e_test.exs`             | End-to-end integration with real subprocess        |
| `specs_check_test.exs`          | Spec §17 conformance validation                    |

## Hard Rules for Every Agent Session

1. **Consult the Elixir reference before implementing any non-trivial behavior.** Read the corresponding Elixir module to understand edge cases, error handling, and behavioral nuances that the spec may describe abstractly. Use `read` on the relevant `.ex` file.

2. **Consult SPEC.md for the authoritative contract.** The spec defines what "correct" means. The Elixir code shows one way to achieve it. When they disagree, the spec wins — but flag the disagreement in `.kata/DECISIONS.md`.

3. **Don't invent new behavior.** If the Elixir implementation handles an edge case a certain way and the spec doesn't contradict it, match that behavior. This is a port, not a redesign.

4. **Check the Elixir tests for cases you might miss.** The Elixir test suite (~9800 LOC) encodes many behavioral expectations. When writing tests for a Rust module, scan the corresponding Elixir test file for cases to port.

5. **Use idiomatic Rust, not transliterated Elixir.** Match the *behavior*, not the code structure. GenServer → tokio task + mpsc. Pattern matching → Rust enums. Supervisor trees → structured error handling. ETS → HashMap/BTreeMap.

6. **Flag parity gaps immediately.** If you discover the Rust implementation is missing a behavior that the Elixir version has, add it to the current task or create a follow-up. Don't silently skip it.

## Consultation Workflow

When starting a new slice or task:

```text
1. Read the task plan (what to build)
2. Read SPEC.md sections referenced in the plan (what "correct" means)
3. Read the corresponding Elixir module(s) (how the reference does it)
4. Read the corresponding Elixir test(s) (what edge cases exist)
5. Implement in idiomatic Rust
6. Verify against the spec contract
```

Steps 2-4 are not optional. Skipping them is how parity drift happens.

## Project-Level Pointers

- Kata planning artifacts: `.kata/` (state, decisions, milestones, slices)
- Domain types: `src/domain.rs`
- Error types: `src/error.rs`
- Decisions register: `.kata/DECISIONS.md` (append-only, read during planning)
- Requirements: `.kata/REQUIREMENTS.md`
