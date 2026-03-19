# S07: HTTP Dashboard and JSON API — Research

**Date:** 2026-03-19

## Summary

S07 directly owns **R010 (HTTP observability server)** and supports **R015 (token/rate-limit visibility through API/dashboard)** plus the observability side of **R006** (runtime refresh trigger integration). The spec contract is concrete: if the extension is shipped, it must serve `/`, `GET /api/v1/state`, `GET /api/v1/<issue_identifier>`, and `POST /api/v1/refresh`, with explicit 404/405 behavior and JSON error envelopes (Spec §13.7). CLI `--port` must override `server.port`, and safe loopback default binding is expected.

Current Rust code has the right upstream foundation from S06 (`Orchestrator::snapshot`, retry diagnostics, aggregate token/rate-limit fields), but the S07 surfaces do not exist yet: there is no `src/http_server.rs`, no `axum` dependency in `Cargo.toml`, and no orchestrator refresh API/channel equivalent to Elixir `request_refresh`. `main.rs` currently boots only the orchestrator loop and blocks there, so HTTP serving requires a concurrency/wiring seam.

The largest implementation risk is not route wiring; it is **state/control integration**. The HTTP layer needs read access to snapshots and write access to a best-effort refresh trigger without violating D002 single-authority state ownership. A channel-driven control surface (snapshot read handle + refresh request channel) is the safest match to existing architecture and Elixir behavior.

## Recommendation

Implement S07 as a thin projection/control layer over orchestrator state, not as a second state machine.

1. **Add a dedicated HTTP module** (`src/http_server.rs`) and wire it from `main.rs` only when an effective port is configured.
2. **Use a shared orchestrator handle** with:
   - snapshot read surface (latest `OrchestratorSnapshot` + timestamp)
   - refresh trigger sender (coalesced best-effort)
3. **Keep orchestrator as sole mutable authority**; HTTP handlers should never mutate runtime maps directly.
4. **Use axum router-level fallback controls**:
   - `fallback(...)` for 404 JSON envelope
   - `method_not_allowed_fallback(...)` for 405 JSON envelope
5. **Serve `/` as server-rendered HTML with lightweight polling** of `/api/v1/state` (simple and consistent with D005).
6. **Project `/api/v1/:issue_identifier` from snapshot running+retry views** and return `404 issue_not_found` when absent.
7. **Implement `POST /api/v1/refresh` as best-effort queue/coalesce**, returning `202` with `queued/coalesced/requested_at/operations` payload.

This keeps S07 focused on R010 delivery while minimizing churn in S06 scheduling logic.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Route matching + 404/405 semantics | Axum `Router::fallback` + `method_not_allowed_fallback` | Directly matches spec-required error behavior with less brittle route-by-route guards. |
| Shared HTTP state injection | Axum `State` extractor + `Router::with_state` | Type-safe, clone-friendly state access pattern; avoids global mutable statics. |
| JSON serialization for API payloads | `serde`/`serde_json` structs | Prevents manual map-building drift and stabilizes response contracts for tests. |
| Refresh trigger signaling | `tokio::sync::mpsc` + coalescing flag | Clean one-way control flow into orchestrator authority loop; avoids lock-heavy cross-thread mutation. |
| Ephemeral port tests | `tokio::net::TcpListener::bind((host, 0))` + `local_addr()` | Deterministic integration testing without hard-coded ports. |

## Existing Code and Patterns

- `src/orchestrator.rs` — `snapshot(now_ms)` already exposes `running`, `retry_queue`, `codex_totals`, and `codex_rate_limits`; this is the canonical data source for S07.
- `src/domain.rs` — `OrchestratorSnapshot`, `RetrySnapshotEntry`, and `PollingSnapshot` serialization shapes already exist (S06→S07 boundary).
- `tests/domain_tests.rs` (`test_orchestrator_snapshot_serializes`) — confirms deterministic JSON ordering expectations (`BTreeMap/BTreeSet`) that API responses should preserve.
- `src/main.rs` — already applies CLI `--port` override into `effective_config.server.port`; S07 should reuse this precedence path instead of re-parsing args.
- `src/config.rs` + `src/domain.rs::ServerConfig` — `server.port` and default host `127.0.0.1` are already modeled.
- Elixir reference:
  - `lib/symphony_elixir_web/controllers/observability_api_controller.ex` — baseline endpoint/status/error semantics.
  - `lib/symphony_elixir_web/presenter.ex` — state + issue payload projection and refresh response shape.
  - `lib/symphony_elixir/orchestrator.ex` (`snapshot`, `request_refresh`) — refresh coalescing behavior and snapshot contract.
  - `test/symphony_elixir/extensions_test.exs` — high-value parity assertions for 200/202/404/405/503 behavior.

## Constraints

- S07 must satisfy Spec §13.7 endpoint baseline (`/`, `/api/v1/state`, `/api/v1/:issue_identifier`, `POST /api/v1/refresh`).
- CLI `--port` must override workflow `server.port` (Spec §13.7 + roadmap acceptance sentence).
- Bind host should default to loopback unless explicitly configured (`127.0.0.1`).
- 404 and 405 responses must be JSON envelopes for API routes.
- Refresh endpoint is best-effort and may coalesce duplicate requests.
- HTTP layer must remain observability/control only; orchestrator correctness cannot depend on dashboard/API availability.
- No secret material (tracker API key) may leak via API payloads or logs (D014).

## Common Pitfalls

- **Starting HTTP unconditionally** — S07 should start server only when effective port is configured.
- **Violating single-authority state ownership** — avoid shared mutable orchestrator maps through locks in handlers; read snapshot, signal via channel.
- **Missing 405 semantics** — plain route definitions often return 404 on wrong method unless method fallback is explicitly configured.
- **Implementing `/api/v1/:issue` against stale ad hoc caches** — derive from orchestrator snapshot each request or from a single synchronized snapshot cache.
- **Skipping refresh coalescing** — repeated `POST /refresh` bursts should not queue unbounded immediate ticks.
- **Forgetting runtime totals nuance** — `codex_totals.seconds_running` may need live augmentation from active sessions at render time to match spec guidance (§13.5).

## Open Risks

- `OrchestratorSnapshot.running` currently stores `RunAttempt` rows, which lack session-level fields (`session_id`, `turn_count`, last event/message/tokens) shown in the spec’s recommended state payload. S07 may need either projection fallbacks or snapshot enrichment.
- Rust orchestrator currently has no public `request_refresh` control seam; adding one without introducing race conditions is the key design risk.
- `PollingSnapshot` is currently projected with static `checking: false` and fixed `next_poll_in_ms`; this may under-represent real poll state unless S07 (or a small S06 follow-up) tightens runtime polling telemetry.
- No Rust HTTP tests exist yet; extension semantics can regress unless S07 introduces dedicated integration tests akin to Elixir `extensions_test.exs` coverage.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Axum | `bobmatnyc/claude-mpm-skills@axum` — install via `npx skills add bobmatnyc/claude-mpm-skills@axum` | available (not installed, 136 installs) |
| Axum | `manutej/luxor-claude-marketplace@axum-web-framework` — install via `npx skills add manutej/luxor-claude-marketplace@axum-web-framework` | available (not installed, 72 installs) |
| Tokio concurrency | `geoffjay/claude-plugins@tokio-patterns` — install via `npx skills add geoffjay/claude-plugins@tokio-patterns` | available (not installed, 44 installs) |
| Tokio concurrency | `geoffjay/claude-plugins@tokio-concurrency` — install via `npx skills add geoffjay/claude-plugins@tokio-concurrency` | available (not installed, 34 installs) |

## Sources

- HTTP extension contract and endpoint/error semantics (source: `SPEC.md` §13.7, §13.7.1, §13.7.2, §18.2) — `/Volumes/EVO/kata/openai-symphony/SPEC.md`
- Observability/token/runtime snapshot expectations (source: `SPEC.md` §13.3, §13.5, §17.6) — `/Volumes/EVO/kata/openai-symphony/SPEC.md`
- Rust orchestrator snapshot surfaces (source: `src/orchestrator.rs`, `src/domain.rs`, `tests/orchestrator_tests.rs`, `tests/domain_tests.rs`) — local codebase
- CLI/server config precedence seams (source: `src/main.rs`, `src/config.rs`) — local codebase
- Elixir HTTP reference implementation (source: `http_server.ex`, `router.ex`, `observability_api_controller.ex`, `presenter.ex`) — `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/...`
- Elixir extension behavior tests (source: `extensions_test.exs`) — `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/extensions_test.exs`
- Axum routing and state APIs (source: Context7 `/websites/rs_axum_axum`, queries: method fallback, router fallback, state with_state, serve listener)
- Skill discovery commands run: `npx skills find "axum"`, `npx skills find "tokio"`
