---
id: T02
parent: S09
milestone: M001
provides:
  - Operator-grade README.md covering build, run, config, HTTP API, SSH pool, and testing
  - CLI flag reference table (workflow_path, --port, --logs-root, --i-understand-that-this-will-be-running-without-the-usual-guardrails)
  - Full WORKFLOW.md front-matter schema table with field types, defaults, and descriptions for all 8 config sections
  - HTTP endpoint reference with sample JSON for /api/v1/state, /api/v1/:issue_identifier, /api/v1/refresh, and GET /
  - SSH remote worker documentation covering ssh_hosts format, SYMPHONY_SSH_CONFIG, host selection, and pool-exhaustion behaviour
key_files:
  - README.md
key_decisions:
  - "README uses AGENTS.md as the development/architecture pointer rather than duplicating module documentation"
patterns_established:
  - "Config field tables document: Field, Type, Default, Description — all defaults cross-checked against domain.rs Default impls"
observability_surfaces:
  - "cat README.md"
duration: 25min
verification_result: passed
completed_at: 2026-03-19T00:00:00Z
blocker_discovered: false
---

# T02: Write operator-grade README

**Replaced placeholder AGENTS.md-clone README with a 425-line operator guide covering CLI, WORKFLOW.md schema, HTTP API, SSH pool, and testing — all defaults and flags verified against source.**

## What Happened

Read `src/main.rs` (Clap derive struct), `src/config.rs` (all Raw* structs and Default impls), `src/http_server.rs` (Router build, response types), `src/ssh.rs` (parse_target, ssh_args, select_worker_host, SYMPHONY_SSH_CONFIG env var), and `src/domain.rs` (Default impls for every config struct to extract authoritative defaults).

Authored README.md with 8 H2 sections:
1. **Prerequisites** — Rust stable, cargo build --release
2. **Running** — full CLI invocation, flag table (workflow_path positional, --port, --logs-root, --i-understand-that-this-will-be-running-without-the-usual-guardrails), exit codes (0/1/2), RUST_LOG
3. **WORKFLOW.md Format** — per-section field tables (tracker, polling, workspace, agent, codex, hooks, worker, server) with types, defaults, and descriptions; minimal and full examples
4. **Configuration Reference** — env var table (LINEAR_API_KEY, RUST_LOG, HOME, SYMPHONY_SSH_CONFIG) and $VAR indirection pattern
5. **HTTP Dashboard and API** — all 4 endpoints with method/path/description table; sample JSON for /api/v1/state, /api/v1/:issue_identifier, and /api/v1/refresh
6. **SSH Remote Workers** — ssh_hosts format examples, host selection behaviour, SYMPHONY_SSH_CONFIG, remote command construction
7. **Testing** — cargo test, per-harness descriptions, cargo clippy
8. **Development** — pointer to AGENTS.md

## Verification

```
grep -c "^## " README.md      → 8  (≥7 required)
grep "GET /api/v1/state"      → match
grep "ssh_hosts"              → match
grep "WORKFLOW.md Format"     → match
grep "cargo test"             → match
wc -l README.md               → 425 (≥300 required)
```

All must-haves confirmed. All CLI flags match src/main.rs Cli struct. All config field defaults match domain.rs Default implementations.

## Diagnostics

- Inspect README: `cat README.md`

## Deviations

None. Task plan was followed exactly.

## Known Issues

None.

## Files Created/Modified

- `README.md` — Full operator guide (425 lines, 8 H2 sections)
