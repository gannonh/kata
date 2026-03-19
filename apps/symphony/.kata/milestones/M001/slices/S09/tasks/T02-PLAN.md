---
estimated_steps: 5
estimated_files: 1
---

# T02: Write operator-grade README

**Slice:** S09 — Conformance Sweep and Integration Polish
**Milestone:** M001

## Description

The current `README.md` is a development reference guide (AGENTS.md clone with build commands and project structure). It does not serve operators who need to deploy and run Symphony against their Linear workspace. This task replaces it with an operator-oriented document covering everything needed to go from source to running service.

The README must accurately reflect the current implementation — every CLI flag, config field, default, and endpoint is already implemented and tested. This is purely documentation work; no code changes.

## Steps

1. Read `src/main.rs` to confirm exact CLI flags (`--port`, `--logs-root`, positional `workflow_path`, any other flags), exit codes, and startup behavior.

2. Read `src/config.rs` to extract the full WORKFLOW.md front-matter schema: every field name, type, default value, env-var resolution behavior, and validation rule.

3. Read `src/http_server.rs` to extract endpoint paths, methods, and response shapes for the API reference section. Note the JSON shapes from the snapshot projection.

4. Read `src/ssh.rs` to confirm `ssh_hosts` format (host:port), `max_concurrent_agents_per_host`, and `SYMPHONY_SSH_CONFIG` env var injection.

5. Write `README.md` with these sections in order:
   - **Symphony** (H1 title + one-paragraph description of what it does)
   - **Prerequisites** — Rust stable toolchain; `cargo build --release` produces `target/release/symphony`
   - **Running** — `symphony WORKFLOW.md [--port N] [--logs-root PATH]`; CLI flag table; exit codes (0 = clean shutdown, non-zero = startup failure); `RUST_LOG` env var for log verbosity
   - **WORKFLOW.md Format** — YAML front-matter schema table with columns: Field, Type, Default, Description. Cover all config fields. Include a minimal working example.
   - **Configuration Reference** — Environment variable table: `LINEAR_API_KEY`, `$VAR` indirection pattern, `SYMPHONY_SSH_CONFIG`
   - **HTTP Dashboard and API** — Enable with `--port 8080`; endpoint table: `GET /` (dashboard), `GET /api/v1/state`, `GET /api/v1/:issue_identifier`, `POST /api/v1/refresh`; sample JSON for state response
   - **SSH Remote Workers** — `ssh_hosts` list format, `max_concurrent_agents_per_host`, `SYMPHONY_SSH_CONFIG` for custom ssh_config file, continuation host preference, pool-exhaustion behavior
   - **Testing** — `cargo test` (runs all harnesses); `cargo clippy -- -D warnings` (zero-warning gate); brief note on test harness layout
   - **Development** — pointer to `AGENTS.md` for architecture, module layout, and contribution notes

## Must-Haves

- [ ] README contains section "WORKFLOW.md Format" with a config field schema table
- [ ] README contains section "HTTP Dashboard and API" with all four endpoint paths
- [ ] README contains section "SSH Remote Workers" covering ssh_hosts and SYMPHONY_SSH_CONFIG
- [ ] README contains section "Testing" with `cargo test` command
- [ ] README contains section "Running" with the full CLI invocation and flag table
- [ ] All CLI flags documented match what `src/main.rs` actually accepts
- [ ] All config fields documented match what `src/config.rs` actually parses

## Verification

- `grep -c "^## " README.md` returns ≥7 (all required H2 sections present)
- `grep "GET /api/v1/state" README.md` returns a match
- `grep "ssh_hosts" README.md` returns a match
- `grep "WORKFLOW.md Format" README.md` returns a match
- `grep "cargo test" README.md` returns a match

## Observability Impact

- Signals added/changed: None (documentation only)
- How a future agent inspects this: `cat README.md`
- Failure state exposed: None

## Inputs

- `src/main.rs` — CLI flag definitions (clap derive), startup behavior, exit codes
- `src/config.rs` — full config schema, field defaults, env-var resolution, validation rules
- `src/http_server.rs` — endpoint routes, handler names, JSON response shapes
- `src/ssh.rs` — ssh_hosts format, SYMPHONY_SSH_CONFIG injection, WorkerHostSelection semantics

## Expected Output

- `README.md` — full operator guide (≥300 lines) with all required sections documented accurately
