# Phase 1: Minimum Viable Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get Symphony's autonomous work loop running end-to-end — orchestrator dispatches a ticket, agent does the work, opens PR, moves issue through Linear states, human approves, agent lands PR, next ticket dispatched.

**Architecture:** Five independent changes: (1) wire real LinearClient into worker tasks for `linear_graphql` tool, (2) implement tracker writeback in LinearAdapter so orchestrator can move issues to In Progress, (3) port the Elixir WORKFLOW.md prompt, (4) port 5 Codex skills, (5) Linear states already configured by user.

**Tech Stack:** Rust, Linear GraphQL API, Codex app-server, Liquid templates

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/orchestrator.rs` | Modify | Add TrackerConfig to worker task, add In Progress writeback call |
| `src/linear/adapter.rs` | Modify | Implement `create_comment` and `update_issue_state` (currently stubs) |
| `src/linear/client.rs` | Modify | Add `resolve_state_id` and `update_issue_state` GraphQL methods |
| `src/main.rs` | Modify | Pass TrackerAdapter to orchestrator for writeback calls |
| `WORKFLOW.md` | Rewrite | Port Elixir WORKFLOW.md with adaptations |
| `.codex/skills/linear/SKILL.md` | Create | Copy from Elixir reference (no changes needed) |
| `.codex/skills/commit/SKILL.md` | Create | Copy from Elixir reference (no changes needed) |
| `.codex/skills/pull/SKILL.md` | Create | Copy from Elixir reference, remove Elixir-specific commands |
| `.codex/skills/push/SKILL.md` | Create | Copy from Elixir reference, adapt validation commands |
| `.codex/skills/land/SKILL.md` | Create | Copy from Elixir reference, remove Elixir-specific commands |
| `tests/linear_client_tests.rs` | Modify | Add tests for resolve_state_id and update_issue_state |

---

### Task 1: Implement LinearClient GraphQL write methods

**Files:**
- Modify: `src/linear/client.rs`
- Test: `tests/linear_client_tests.rs`

- [ ] **Step 1: Write failing test for `resolve_state_id`**

Add `test_resolve_state_id_returns_matching_state` to `tests/linear_client_tests.rs`. Mock the GraphQL response that returns team states for an issue. Assert the resolved state ID matches.

```rust
#[tokio::test]
async fn test_resolve_state_id_returns_matching_state() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", "/")
        .with_body(json!({
            "data": {
                "issue": {
                    "team": {
                        "states": {
                            "nodes": [{"id": "state-123"}]
                        }
                    }
                }
            }
        }).to_string())
        .create_async().await;

    let client = test_client(&server);
    let result = client.resolve_state_id("issue-1", "In Progress").await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "state-123");
    mock.assert_async().await;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test linear_client_tests test_resolve_state_id -- --nocapture`
Expected: FAIL — method does not exist

- [ ] **Step 3: Implement `resolve_state_id` on LinearClient**

Add to `src/linear/client.rs`:

```rust
const STATE_LOOKUP_QUERY: &str = r#"
    query SymphonyResolveStateId($issueId: String!, $stateName: String!) {
        issue(id: $issueId) {
            team {
                states(filter: {name: {eq: $stateName}}, first: 1) {
                    nodes { id }
                }
            }
        }
    }
"#;

pub async fn resolve_state_id(&self, issue_id: &str, state_name: &str) -> Result<String> {
    let variables = json!({"issueId": issue_id, "stateName": state_name});
    let response = self.graphql(STATE_LOOKUP_QUERY, variables).await?;
    response["data"]["issue"]["team"]["states"]["nodes"][0]["id"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| SymphonyError::Other(format!("state '{}' not found", state_name)))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test linear_client_tests test_resolve_state_id -- --nocapture`
Expected: PASS

- [ ] **Step 5: Write failing test for `update_issue_state`**

Add `test_update_issue_state_resolves_and_updates`. Two mock responses: first for state lookup, second for issue update mutation.

- [ ] **Step 6: Implement `update_issue_state` on LinearClient**

```rust
const UPDATE_STATE_MUTATION: &str = r#"
    mutation SymphonyUpdateIssueState($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: {stateId: $stateId}) {
            success
        }
    }
"#;

pub async fn update_issue_state(&self, issue_id: &str, state_name: &str) -> Result<()> {
    let state_id = self.resolve_state_id(issue_id, state_name).await?;
    let variables = json!({"issueId": issue_id, "stateId": state_id});
    let response = self.graphql(UPDATE_STATE_MUTATION, variables).await?;
    match response["data"]["issueUpdate"]["success"].as_bool() {
        Some(true) => Ok(()),
        _ => Err(SymphonyError::Other("issueUpdate failed".to_string())),
    }
}
```

- [ ] **Step 7: Run tests to verify both pass**

Run: `cargo test --test linear_client_tests test_resolve_state_id test_update_issue_state -- --nocapture`
Expected: PASS

- [ ] **Step 8: Write failing test for state not found**

Test that `resolve_state_id` returns an error when the state name doesn't match any team states.

- [ ] **Step 9: Implement and verify**

Run: `cargo test --test linear_client_tests -- --nocapture`
Expected: All new tests PASS

- [ ] **Step 10: Commit**

```bash
git add src/linear/client.rs tests/linear_client_tests.rs
git commit -m "feat(symphony): add resolve_state_id and update_issue_state to LinearClient"
```

---

### Task 2: Wire LinearAdapter write methods

**Files:**
- Modify: `src/linear/adapter.rs`

- [ ] **Step 1: Replace `create_comment` stub with real implementation**

```rust
async fn create_comment(&self, issue_id: &str, body: &str) -> Result<()> {
    self.client.create_comment(issue_id, body).await
}
```

(Also add `create_comment` to `LinearClient` in `client.rs` — same pattern as Elixir's `@create_comment_mutation`)

- [ ] **Step 2: Replace `update_issue_state` stub with real implementation**

```rust
async fn update_issue_state(&self, issue_id: &str, state_name: &str) -> Result<()> {
    self.client.update_issue_state(issue_id, state_name).await
}
```

- [ ] **Step 3: Verify build**

Run: `cargo build`
Expected: Compiles clean

- [ ] **Step 4: Commit**

```bash
git add src/linear/adapter.rs src/linear/client.rs
git commit -m "feat(symphony): implement TrackerAdapter write methods (create_comment, update_issue_state)"
```

---

### Task 3: Wire real `linear_graphql` executor into worker tasks

**Files:**
- Modify: `src/orchestrator.rs`

- [ ] **Step 1: Add `TrackerConfig` parameter to `run_worker_task`**

Add `tracker_config: &crate::domain::TrackerConfig` as the last parameter.

- [ ] **Step 2: Replace dummy executor with real LinearClient**

```rust
let linear_client = crate::linear::client::LinearClient::new(tracker_config.clone());
let graphql_executor = move |query: String, vars: serde_json::Value| {
    let client = linear_client.clone();
    async move { client.graphql_raw(&query, vars).await }
};
```

- [ ] **Step 3: Pass `tracker_config` from `spawn_workers_for_dispatched`**

Add `let tracker_config = self.config.tracker.clone();` and pass it to `run_worker_task`.

- [ ] **Step 4: Verify build**

Run: `cargo build`
Expected: Compiles clean

- [ ] **Step 5: Run full test suite**

Run: `cargo test`
Expected: All 211 tests pass (existing tests don't call `run_worker_task` directly)

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator.rs
git commit -m "feat(symphony): wire real linear_graphql executor into worker tasks"
```

---

### Task 4: Add "In Progress" writeback on dispatch

**Files:**
- Modify: `src/orchestrator.rs`
- Modify: `src/main.rs`

- [ ] **Step 1: Add `update_issue_state` to `OrchestratorPort` trait**

```rust
fn update_issue_state(&mut self, issue_id: &str, state_name: &str) -> Result<()>;
```

- [ ] **Step 2: Implement in `LinearOrchestratorPort` in `main.rs`**

```rust
fn update_issue_state(&mut self, issue_id: &str, state_name: &str) -> Result<()> {
    self.block_on(self.adapter.update_issue_state(issue_id, state_name))
}
```

- [ ] **Step 3: Update fake port in `tests/orchestrator_tests.rs`**

Add a no-op implementation to the fake port used in tests:

```rust
fn update_issue_state(&mut self, _issue_id: &str, _state_name: &str) -> Result<()> {
    Ok(())
}
```

- [ ] **Step 4: Call writeback in `spawn_workers_for_dispatched`**

Before spawning each worker task, call the port. But `spawn_workers_for_dispatched` doesn't have access to `port`. We need to pass it in.

Change `spawn_workers_for_dispatched` signature to accept `port: &mut dyn OrchestratorPort`:

```rust
fn spawn_workers_for_dispatched(&mut self, dispatched: &[DispatchedIssue], port: &mut dyn OrchestratorPort) {
    for d in dispatched {
        // Move to In Progress in Linear (best-effort, don't block dispatch on failure)
        if let Err(err) = port.update_issue_state(&d.issue.id, "In Progress") {
            tracing::warn!(
                event = "writeback_failed",
                issue_id = %d.issue.id,
                issue_identifier = %d.issue.identifier,
                error = %err,
                "failed to move issue to In Progress; continuing with dispatch"
            );
        }
        // ... rest of spawn logic
    }
}
```

Update call sites in `run()` to pass `port`.

- [ ] **Step 5: Verify build and tests**

Run: `cargo test`
Expected: All tests pass

- [ ] **Step 6: Run clippy**

Run: `cargo clippy -- -D warnings`
Expected: Clean

- [ ] **Step 7: Commit**

```bash
git add src/orchestrator.rs src/main.rs tests/orchestrator_tests.rs
git commit -m "feat(symphony): move issue to In Progress on dispatch (orchestrator writeback)"
```

---

### Task 5: Port WORKFLOW.md from Elixir reference

**Files:**
- Rewrite: `apps/symphony/WORKFLOW.md`

- [ ] **Step 1: Copy Elixir WORKFLOW.md**

```bash
cp /Volumes/EVO/kata/openai-symphony/elixir/WORKFLOW.md /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony/apps/symphony/WORKFLOW.md
```

- [ ] **Step 2: Update front-matter**

- `tracker.project_slug` → `89d4761fddf0`
- `workspace.root` → `~/symphony-workspaces`
- `hooks.after_create` → `git clone /Volumes/EVO/kata/kata-mono . --single-branch --branch elixir-feature-parity && git checkout -b symphony/$(basename $PWD)`
- `hooks.before_remove` → remove (no Elixir cleanup needed)
- `active_states` → `[Todo, In Progress, Merging, Rework]`
- `codex.command` → keep as-is (includes `--model gpt-5.3-codex`)
- `approval_policy` → `never`

- [ ] **Step 3: Adapt prompt body**

- Replace references to "this repository" with context about `apps/symphony/` in the kata-mono monorepo
- Remove `mise` references (we use `cargo`)
- Replace `make -C elixir all` validation with `cd apps/symphony && cargo test && cargo clippy -- -D warnings`
- Replace `mix pr_body.check` with equivalent or remove
- Update Step 0 to note that orchestrator already moved to In Progress (agent verifies rather than transitions)

- [ ] **Step 4: Verify template renders**

Run Symphony briefly and check logs for template errors:
```bash
RUST_LOG=info ./target/release/symphony WORKFLOW.md --port 8080 --i-understand-that-this-will-be-running-without-the-usual-guardrails
```
Kill after first dispatch. Confirm no Liquid template errors in logs.

- [ ] **Step 5: Commit**

```bash
git add apps/symphony/WORKFLOW.md
git commit -m "feat(symphony): port Elixir WORKFLOW.md with full agent state machine"
```

---

### Task 6: Port Codex skills

**Files:**
- Create: `.codex/skills/linear/SKILL.md`
- Create: `.codex/skills/commit/SKILL.md`
- Create: `.codex/skills/pull/SKILL.md`
- Create: `.codex/skills/push/SKILL.md`
- Create: `.codex/skills/land/SKILL.md`

- [ ] **Step 1: Copy `linear` skill (no changes needed)**

```bash
mkdir -p .codex/skills/linear
cp /Volumes/EVO/kata/openai-symphony/.codex/skills/linear/SKILL.md .codex/skills/linear/SKILL.md
```

- [ ] **Step 2: Copy `commit` skill (no changes needed)**

```bash
mkdir -p .codex/skills/commit
cp /Volumes/EVO/kata/openai-symphony/.codex/skills/commit/SKILL.md .codex/skills/commit/SKILL.md
```

- [ ] **Step 3: Copy `pull` skill (no changes needed)**

```bash
mkdir -p .codex/skills/pull
cp /Volumes/EVO/kata/openai-symphony/.codex/skills/pull/SKILL.md .codex/skills/pull/SKILL.md
```

- [ ] **Step 4: Copy and adapt `push` skill**

```bash
mkdir -p .codex/skills/push
cp /Volumes/EVO/kata/openai-symphony/.codex/skills/push/SKILL.md .codex/skills/push/SKILL.md
```

Then edit: replace `make -C elixir all` with `cd apps/symphony && cargo test && cargo clippy -- -D warnings`. Remove `mix pr_body.check` references.

- [ ] **Step 5: Copy and adapt `land` skill**

```bash
mkdir -p .codex/skills/land
cp /Volumes/EVO/kata/openai-symphony/.codex/skills/land/SKILL.md .codex/skills/land/SKILL.md
```

Read and remove any Elixir-specific references (`mix`, `mise`, `iex`).

- [ ] **Step 6: Commit**

```bash
git add .codex/skills/
git commit -m "feat(symphony): port Codex skills from Elixir reference (linear, commit, push, pull, land)"
```

---

### Task 7: Final verification and push

**Files:** None new

- [ ] **Step 1: Run full test suite**

Run: `cargo test`
Expected: All tests pass (211 + new write method tests)

- [ ] **Step 2: Run clippy**

Run: `cargo clippy -- -D warnings`
Expected: Clean

- [ ] **Step 3: Run cargo fmt**

Run: `cargo fmt`

- [ ] **Step 4: Build release binary**

Run: `cargo build --release`

- [ ] **Step 5: Push branch**

```bash
git push origin elixir-feature-parity
```

- [ ] **Step 6: Clean stale workspace and test end-to-end**

```bash
rm -rf ~/symphony-workspaces/KAT-800
RUST_LOG=info ./target/release/symphony WORKFLOW.md --port 8080 --i-understand-that-this-will-be-running-without-the-usual-guardrails
```

Verify in logs:
- Issue moved to In Progress ✓
- Workspace cloned ✓
- Codex session started ✓
- No template errors ✓
- `linear_graphql` tool available (no dummy error) ✓
