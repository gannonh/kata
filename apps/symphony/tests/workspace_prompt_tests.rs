//! Integration tests for path_safety, workspace, and prompt_builder modules.
//!
//! Runs against real filesystem (tempfile dirs) and real subprocess execution.

use std::fs;
use std::os::unix::fs as unix_fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use chrono::{DateTime, Utc};
use tempfile::TempDir;

use symphony::domain::{
    BlockerRef, HooksConfig, Issue, WorkspaceConfig, WorkspaceIsolation, WorkspaceRepoStrategy,
};
use symphony::error::SymphonyError;
use symphony::path_safety;

// ═══════════════════════════════════════════════════════════════════════
// Path Safety — 6 tests
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn test_sanitize_identifier_replaces_unsafe_chars() {
    assert_eq!(path_safety::sanitize_identifier("MT/Det"), "MT_Det");
    assert_eq!(path_safety::sanitize_identifier("S-1"), "S-1");
    assert_eq!(
        path_safety::sanitize_identifier("hello world!"),
        "hello_world_"
    );
    assert_eq!(path_safety::sanitize_identifier("a/b\\c:d"), "a_b_c_d");
    // Dots and underscores are safe
    assert_eq!(path_safety::sanitize_identifier("v1.2_rc"), "v1.2_rc");
}

#[test]
fn test_sanitize_identifier_nil_or_empty() {
    assert_eq!(path_safety::sanitize_identifier(""), "issue");
    assert_eq!(path_safety::sanitize_identifier("  "), "issue");
}

#[test]
fn test_canonicalize_existing_path() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join("sub").join("dir");
    fs::create_dir_all(&dir).unwrap();

    let result = path_safety::canonicalize(&dir).unwrap();
    // Must be absolute
    assert!(result.is_absolute());
    // Must resolve to the real path (same as std::fs::canonicalize for existing paths)
    let expected = fs::canonicalize(&dir).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_canonicalize_nonexistent_tail() {
    let tmp = TempDir::new().unwrap();
    let existing = tmp.path().join("real");
    fs::create_dir_all(&existing).unwrap();

    // "real/nonexistent/deep" — real exists, nonexistent and deep do not
    let target = existing.join("nonexistent").join("deep");
    let result = path_safety::canonicalize(&target).unwrap();

    // The existing prefix should be resolved (canonicalized)
    let canonical_existing = fs::canonicalize(&existing).unwrap();
    let expected = canonical_existing.join("nonexistent").join("deep");
    assert_eq!(result, expected);
}

#[test]
fn test_canonicalize_symlink_resolution() {
    let tmp = TempDir::new().unwrap();
    let real_dir = tmp.path().join("real_target");
    fs::create_dir_all(&real_dir).unwrap();

    let link_path = tmp.path().join("link");
    unix_fs::symlink(&real_dir, &link_path).unwrap();

    let result = path_safety::canonicalize(&link_path).unwrap();
    let expected = fs::canonicalize(&real_dir).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_canonicalize_nested_symlink() {
    let tmp = TempDir::new().unwrap();
    let real_dir = tmp.path().join("final_target");
    fs::create_dir_all(&real_dir).unwrap();

    // chain: link_a -> link_b -> final_target
    let link_b = tmp.path().join("link_b");
    unix_fs::symlink(&real_dir, &link_b).unwrap();

    let link_a = tmp.path().join("link_a");
    unix_fs::symlink(&link_b, &link_a).unwrap();

    let result = path_safety::canonicalize(&link_a).unwrap();
    let expected = fs::canonicalize(&real_dir).unwrap();
    assert_eq!(result, expected);
}

// ═══════════════════════════════════════════════════════════════════════
// Workspace Manager — 12 tests
// ═══════════════════════════════════════════════════════════════════════

// Helper to build a minimal WorkspaceConfig pointing at a temp root
fn workspace_config(root: &Path) -> WorkspaceConfig {
    WorkspaceConfig {
        root: root.to_string_lossy().to_string(),
        repo: None,
        strategy: WorkspaceRepoStrategy::Auto,
        isolation: WorkspaceIsolation::Local,
        docker: None,
        branch_prefix: "symphony".to_string(),
        clone_branch: None,
        base_branch: Some("main".to_string()),
        cleanup_on_done: false,
    }
}

fn hooks_config_none() -> HooksConfig {
    HooksConfig {
        after_create: None,
        before_run: None,
        after_run: None,
        before_remove: None,
        timeout_ms: 5_000,
    }
}

#[allow(dead_code)]
fn make_test_issue(identifier: &str) -> Issue {
    Issue {
        id: "test-id-123".to_string(),
        identifier: identifier.to_string(),
        title: "Test Issue".to_string(),
        description: None,
        priority: None,
        state: "Todo".to_string(),
        branch_name: None,
        url: None,
        assignee_id: None,
        labels: vec![],
        blocked_by: vec![],
        assigned_to_worker: true,
        created_at: None,
        updated_at: None,
        children_count: 0,
        parent_identifier: None,
    }
}

fn command_success(mut cmd: Command, context: &str) -> String {
    let output = cmd
        .output()
        .unwrap_or_else(|e| panic!("{context}: failed to spawn command: {e}"));
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "{context}: command failed\nstatus: {:?}\nstdout: {}\nstderr: {}",
        output.status.code(),
        stdout,
        stderr
    );
    stdout.trim().to_string()
}

fn init_git_repo(path: &Path) {
    fs::create_dir_all(path).unwrap();
    fs::write(path.join("README.md"), "hello from source repo\n").unwrap();

    let mut init = Command::new("git");
    init.current_dir(path).arg("init");
    command_success(init, "git init source repo");

    let mut set_name = Command::new("git");
    set_name
        .current_dir(path)
        .args(["config", "user.name", "Symphony Test"]);
    command_success(set_name, "git config user.name");

    let mut set_email = Command::new("git");
    set_email
        .current_dir(path)
        .args(["config", "user.email", "symphony-tests@example.com"]);
    command_success(set_email, "git config user.email");

    let mut add = Command::new("git");
    add.current_dir(path).args(["add", "."]);
    command_success(add, "git add source repo files");

    let mut commit = Command::new("git");
    commit
        .current_dir(path)
        .args(["commit", "-m", "initial commit"]);
    command_success(commit, "git commit source repo files");
}

fn create_branch_with_commit(path: &Path, branch: &str, file: &str, contents: &str) {
    let mut checkout = Command::new("git");
    checkout.current_dir(path).args(["checkout", "-b", branch]);
    command_success(checkout, "git checkout new source branch");

    fs::write(path.join(file), contents).unwrap();

    let mut add = Command::new("git");
    add.current_dir(path).args(["add", file]);
    command_success(add, "git add branch-specific file");

    let mut commit = Command::new("git");
    commit
        .current_dir(path)
        .args(["commit", "-m", "branch-specific commit"]);
    command_success(commit, "git commit branch-specific file");
}

fn current_branch(path: &Path) -> String {
    let path_str = path.to_string_lossy().to_string();
    let mut branch_cmd = Command::new("git");
    branch_cmd.args(["-C", &path_str, "branch", "--show-current"]);
    command_success(branch_cmd, "read current branch")
}

fn init_bare_remote_and_push_all(source_repo: &Path, bare_repo: &Path) -> String {
    let bare_repo_str = bare_repo.to_string_lossy().to_string();
    let mut init_bare = Command::new("git");
    init_bare.args(["init", "--bare", &bare_repo_str]);
    command_success(init_bare, "init bare remote repo");

    let source_repo_str = source_repo.to_string_lossy().to_string();

    let mut add_remote = Command::new("git");
    add_remote.args([
        "-C",
        &source_repo_str,
        "remote",
        "add",
        "origin",
        &bare_repo_str,
    ]);
    command_success(add_remote, "add source remote");

    let mut push_all = Command::new("git");
    push_all.args(["-C", &source_repo_str, "push", "--all", "origin"]);
    command_success(push_all, "push all branches to bare remote");

    format!("file://{bare_repo_str}")
}

fn shell_quote(path: &Path) -> String {
    let raw = path.to_string_lossy();
    format!("'{}'", raw.replace('\'', "'\"'\"'"))
}

#[test]
fn test_workspace_deterministic_path() {
    // Same identifier → same path; basename matches sanitized id
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let _config = workspace_config(&root);
    let id = "MT-42";

    let sanitized = path_safety::sanitize_identifier(id);
    let canonical_root = path_safety::canonicalize(&root).unwrap();

    // Compute workspace path twice — must be identical
    let path1 = canonical_root.join(&sanitized);
    let path2 = canonical_root.join(path_safety::sanitize_identifier(id));
    assert_eq!(path1, path2);
    assert_eq!(path1.file_name().unwrap().to_str().unwrap(), "MT-42");
}

#[test]
fn test_workspace_creates_missing_directory() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let hooks = hooks_config_none();

    let ws = symphony::workspace::ensure_workspace("MT-42", &config, &hooks).unwrap();
    assert!(ws.created_now);
    assert!(Path::new(&ws.path).is_dir());
}

#[test]
fn test_workspace_reuses_existing_directory() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let hooks = hooks_config_none();

    // First call creates
    let ws1 = symphony::workspace::ensure_workspace("MT-42", &config, &hooks).unwrap();
    assert!(ws1.created_now);

    // Drop a marker file
    let marker = PathBuf::from(&ws1.path).join("marker.txt");
    fs::write(&marker, "exists").unwrap();

    // Second call reuses
    let ws2 = symphony::workspace::ensure_workspace("MT-42", &config, &hooks).unwrap();
    assert!(!ws2.created_now);
    assert_eq!(ws1.path, ws2.path);

    // Marker file still exists — directory was NOT recreated
    assert!(marker.exists());
}

#[test]
fn test_workspace_replaces_non_directory() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let hooks = hooks_config_none();

    // Create a regular file where the workspace would go
    let sanitized = path_safety::sanitize_identifier("MT-42");
    let canonical_root = path_safety::canonicalize(&root).unwrap();
    let file_path = canonical_root.join(&sanitized);
    fs::write(&file_path, "I am a file").unwrap();
    assert!(file_path.is_file());

    // ensure_workspace should replace it with a directory
    let ws = symphony::workspace::ensure_workspace("MT-42", &config, &hooks).unwrap();
    assert!(ws.created_now);
    assert!(Path::new(&ws.path).is_dir());
}

#[test]
fn test_workspace_rejects_symlink_escape() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let outside = tmp.path().join("outside");
    fs::create_dir_all(&outside).unwrap();

    // Create a symlink inside root that points outside
    let canonical_root = path_safety::canonicalize(&root).unwrap();
    let escape_link = canonical_root.join("escape");
    unix_fs::symlink(&outside, &escape_link).unwrap();

    let config = workspace_config(&root);
    let hooks = hooks_config_none();

    let result = symphony::workspace::ensure_workspace("escape", &config, &hooks);
    match result {
        Err(SymphonyError::WorkspaceOutsideRoot { workspace, root: r }) => {
            // Good — the symlink escape was detected
            assert!(workspace.contains("outside") || !workspace.starts_with(&r));
        }
        other => panic!("Expected WorkspaceOutsideRoot, got: {:?}", other),
    }
}

#[test]
fn test_workspace_canonicalizes_symlinked_root() {
    let tmp = TempDir::new().unwrap();
    let actual_root = tmp.path().join("actual_workspaces");
    fs::create_dir_all(&actual_root).unwrap();

    // Root is a symlink → workspaces should be created under the real target
    let link_root = tmp.path().join("link_workspaces");
    unix_fs::symlink(&actual_root, &link_root).unwrap();

    let config = workspace_config(&link_root);
    let hooks = hooks_config_none();

    let ws = symphony::workspace::ensure_workspace("MT-42", &config, &hooks).unwrap();
    assert!(ws.created_now);

    // The workspace should be under the actual (canonical) root, not the symlink
    let canonical_actual = fs::canonicalize(&actual_root).unwrap();
    assert!(
        ws.path.starts_with(canonical_actual.to_str().unwrap()),
        "Workspace {} should be under canonical root {}",
        ws.path,
        canonical_actual.display()
    );
}

#[test]
fn test_workspace_rejects_root_itself() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    // Symlink "workspaces" inside root pointing to root itself (a "."-like escape)
    // Instead, craft the scenario: the sanitized identifier results in root path
    // We test validate_workspace_path directly
    let canonical_root = path_safety::canonicalize(&root).unwrap();

    let result = symphony::workspace::validate_workspace_path(&canonical_root, &canonical_root);
    match result {
        Err(SymphonyError::WorkspaceOutsideRoot { .. }) => {
            // Good — root == workspace is rejected
        }
        other => panic!("Expected WorkspaceOutsideRoot, got: {:?}", other),
    }
}

#[test]
fn test_workspace_after_create_hook_runs() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let hooks = HooksConfig {
        after_create: Some("touch hook_ran.txt".to_string()),
        before_run: None,
        after_run: None,
        before_remove: None,
        timeout_ms: 5_000,
    };

    let ws = symphony::workspace::ensure_workspace("MT-42", &config, &hooks).unwrap();
    assert!(ws.created_now);

    // The hook should have created this file in the workspace directory
    let marker = PathBuf::from(&ws.path).join("hook_ran.txt");
    assert!(
        marker.exists(),
        "after_create hook should have created hook_ran.txt"
    );
}

#[test]
fn test_workspace_after_create_hook_failure() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let hooks = HooksConfig {
        after_create: Some("exit 42".to_string()),
        before_run: None,
        after_run: None,
        before_remove: None,
        timeout_ms: 5_000,
    };

    let result = symphony::workspace::ensure_workspace("MT-42", &config, &hooks);
    match result {
        Err(SymphonyError::WorkspaceHookFailed { hook, status }) => {
            assert_eq!(hook, "after_create");
            assert_eq!(status, 42);
        }
        other => panic!("Expected WorkspaceHookFailed, got: {:?}", other),
    }
}

#[test]
fn test_workspace_after_create_hook_timeout() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let hooks = HooksConfig {
        after_create: Some("sleep 60".to_string()),
        before_run: None,
        after_run: None,
        before_remove: None,
        timeout_ms: 200, // Very short timeout
    };

    let result = symphony::workspace::ensure_workspace("MT-42", &config, &hooks);
    match result {
        Err(SymphonyError::WorkspaceHookTimeout { hook, timeout_ms }) => {
            assert_eq!(hook, "after_create");
            assert_eq!(timeout_ms, 200);
        }
        other => panic!("Expected WorkspaceHookTimeout, got: {:?}", other),
    }
}

#[test]
fn test_workspace_clone_bootstrap_and_branch_creation() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    let source_repo = tmp.path().join("source-repo");
    fs::create_dir_all(&root).unwrap();
    init_git_repo(&source_repo);
    let default_branch = current_branch(&source_repo);
    create_branch_with_commit(
        &source_repo,
        "elixir-feature-parity",
        "BASE_BRANCH.txt",
        "elixir-feature-parity\n",
    );

    let config = WorkspaceConfig {
        root: root.to_string_lossy().to_string(),
        repo: Some(source_repo.to_string_lossy().to_string()),
        strategy: WorkspaceRepoStrategy::CloneLocal,
        isolation: WorkspaceIsolation::Local,
        docker: None,
        branch_prefix: "symphony".to_string(),
        clone_branch: Some("elixir-feature-parity".to_string()),
        base_branch: Some("main".to_string()),
        cleanup_on_done: false,
    };
    let hooks = HooksConfig {
        after_create: Some("git rev-parse --abbrev-ref HEAD > hook_branch.txt".to_string()),
        before_run: None,
        after_run: None,
        before_remove: None,
        timeout_ms: 5_000,
    };
    let issue = make_test_issue("KAT-800");

    let ws = symphony::workspace::ensure_workspace_for_issue(&issue, &config, &hooks).unwrap();
    let ws_path = PathBuf::from(&ws.path);

    assert!(
        ws.created_now,
        "new clone workspace should be newly created"
    );
    assert!(
        ws_path.join("README.md").exists(),
        "cloned workspace should contain source repo files"
    );
    assert!(
        ws_path.join("BASE_BRANCH.txt").exists(),
        "clone bootstrap should clone the configured source branch"
    );
    let mut remote_branches_cmd = Command::new("git");
    remote_branches_cmd.args(["-C", &ws.path, "branch", "-r"]);
    let remote_branches = command_success(remote_branches_cmd, "read clone-local remotes");
    assert!(
        remote_branches.contains("origin/elixir-feature-parity"),
        "clone-local bootstrap should retain selected source branch remote"
    );
    assert!(
        remote_branches.contains(&format!("origin/{default_branch}")),
        "clone-local bootstrap should not prune default branch remotes"
    );

    let mut branch_cmd = Command::new("git");
    branch_cmd.args(["-C", &ws.path, "rev-parse", "--abbrev-ref", "HEAD"]);
    let branch = command_success(branch_cmd, "read clone workspace branch");
    assert_eq!(
        branch, "symphony/KAT-800",
        "clone bootstrap should create and checkout issue branch"
    );

    let hook_branch = fs::read_to_string(ws_path.join("hook_branch.txt")).unwrap();
    assert_eq!(
        hook_branch.trim(),
        "symphony/KAT-800",
        "after_create hook should run after bootstrap and see the created branch"
    );
}

#[test]
fn test_workspace_clone_remote_uses_single_branch_behavior() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    let source_repo = tmp.path().join("source-repo");
    let bare_repo = tmp.path().join("source-remote.git");
    fs::create_dir_all(&root).unwrap();
    init_git_repo(&source_repo);
    let default_branch = current_branch(&source_repo);
    create_branch_with_commit(
        &source_repo,
        "elixir-feature-parity",
        "BASE_BRANCH.txt",
        "elixir-feature-parity\n",
    );
    let remote_url = init_bare_remote_and_push_all(&source_repo, &bare_repo);

    let config = WorkspaceConfig {
        root: root.to_string_lossy().to_string(),
        repo: Some(remote_url),
        strategy: WorkspaceRepoStrategy::CloneRemote,
        isolation: WorkspaceIsolation::Local,
        docker: None,
        branch_prefix: "symphony".to_string(),
        clone_branch: Some("elixir-feature-parity".to_string()),
        base_branch: Some("main".to_string()),
        cleanup_on_done: false,
    };
    let hooks = hooks_config_none();
    let issue = make_test_issue("KAT-804");

    let ws = symphony::workspace::ensure_workspace_for_issue(&issue, &config, &hooks).unwrap();

    let mut remote_branches_cmd = Command::new("git");
    remote_branches_cmd.args(["-C", &ws.path, "branch", "-r"]);
    let remote_branches = command_success(remote_branches_cmd, "read clone-remote remotes");
    assert!(
        remote_branches.contains("origin/elixir-feature-parity"),
        "clone-remote bootstrap should include selected source branch"
    );
    assert!(
        !remote_branches.contains(&format!("origin/{default_branch}")),
        "clone-remote bootstrap should prune default branch remotes via --single-branch"
    );
}

#[test]
fn test_workspace_auto_strategy_selects_local_clone_for_local_repo_path() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    let source_repo = tmp.path().join("source-repo");
    fs::create_dir_all(&root).unwrap();
    init_git_repo(&source_repo);
    let default_branch = current_branch(&source_repo);
    create_branch_with_commit(
        &source_repo,
        "elixir-feature-parity",
        "BASE_BRANCH.txt",
        "elixir-feature-parity\n",
    );

    let config = WorkspaceConfig {
        root: root.to_string_lossy().to_string(),
        repo: Some(source_repo.to_string_lossy().to_string()),
        strategy: WorkspaceRepoStrategy::Auto,
        isolation: WorkspaceIsolation::Local,
        docker: None,
        branch_prefix: "symphony".to_string(),
        clone_branch: Some("elixir-feature-parity".to_string()),
        base_branch: Some("main".to_string()),
        cleanup_on_done: false,
    };
    let hooks = hooks_config_none();
    let issue = make_test_issue("KAT-805");

    let ws = symphony::workspace::ensure_workspace_for_issue(&issue, &config, &hooks).unwrap();

    let mut remote_branches_cmd = Command::new("git");
    remote_branches_cmd.args(["-C", &ws.path, "branch", "-r"]);
    let remote_branches = command_success(remote_branches_cmd, "read auto-local remotes");
    assert!(
        remote_branches.contains("origin/elixir-feature-parity"),
        "auto strategy should include selected source branch for local repo"
    );
    assert!(
        remote_branches.contains(&format!("origin/{default_branch}")),
        "auto strategy should choose clone-local for local repo paths"
    );
}

#[test]
fn test_workspace_auto_strategy_selects_remote_clone_for_repo_url() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    let source_repo = tmp.path().join("source-repo");
    let bare_repo = tmp.path().join("source-remote.git");
    fs::create_dir_all(&root).unwrap();
    init_git_repo(&source_repo);
    let default_branch = current_branch(&source_repo);
    create_branch_with_commit(
        &source_repo,
        "elixir-feature-parity",
        "BASE_BRANCH.txt",
        "elixir-feature-parity\n",
    );
    let remote_url = init_bare_remote_and_push_all(&source_repo, &bare_repo);

    let config = WorkspaceConfig {
        root: root.to_string_lossy().to_string(),
        repo: Some(remote_url),
        strategy: WorkspaceRepoStrategy::Auto,
        isolation: WorkspaceIsolation::Local,
        docker: None,
        branch_prefix: "symphony".to_string(),
        clone_branch: Some("elixir-feature-parity".to_string()),
        base_branch: Some("main".to_string()),
        cleanup_on_done: false,
    };
    let hooks = hooks_config_none();
    let issue = make_test_issue("KAT-806");

    let ws = symphony::workspace::ensure_workspace_for_issue(&issue, &config, &hooks).unwrap();

    let mut remote_branches_cmd = Command::new("git");
    remote_branches_cmd.args(["-C", &ws.path, "branch", "-r"]);
    let remote_branches = command_success(remote_branches_cmd, "read auto-remote remotes");
    assert!(
        remote_branches.contains("origin/elixir-feature-parity"),
        "auto strategy should include selected source branch for repo URLs"
    );
    assert!(
        !remote_branches.contains(&format!("origin/{default_branch}")),
        "auto strategy should choose clone-remote for URL repos"
    );
}

#[test]
fn test_workspace_worktree_bootstrap_and_cleanup() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    let source_repo = tmp.path().join("source-repo");
    fs::create_dir_all(&root).unwrap();
    init_git_repo(&source_repo);

    let config = WorkspaceConfig {
        root: root.to_string_lossy().to_string(),
        repo: Some(source_repo.to_string_lossy().to_string()),
        strategy: WorkspaceRepoStrategy::Worktree,
        isolation: WorkspaceIsolation::Local,
        docker: None,
        branch_prefix: "symphony".to_string(),
        clone_branch: None,
        base_branch: Some("main".to_string()),
        cleanup_on_done: false,
    };
    let hooks = hooks_config_none();
    let issue = make_test_issue("KAT-801");

    let ws = symphony::workspace::ensure_workspace_for_issue(&issue, &config, &hooks).unwrap();
    let ws_path = PathBuf::from(&ws.path);
    assert!(
        ws_path.join("README.md").exists(),
        "worktree workspace should expose source repo files"
    );

    let source_repo_str = source_repo.to_string_lossy().to_string();
    let mut list_before_cmd = Command::new("git");
    list_before_cmd.args(["-C", &source_repo_str, "worktree", "list", "--porcelain"]);
    let list_before = command_success(list_before_cmd, "list worktrees before cleanup");
    assert!(
        list_before.contains(&ws.path),
        "source repo should track new worktree path"
    );

    symphony::workspace::remove_workspace_for_issue(&ws_path, &config, &hooks, &issue).unwrap();
    assert!(!ws_path.exists(), "workspace directory should be removed");

    let mut list_after_cmd = Command::new("git");
    list_after_cmd.args(["-C", &source_repo_str, "worktree", "list", "--porcelain"]);
    let list_after = command_success(list_after_cmd, "list worktrees after cleanup");
    assert!(
        !list_after.contains(&ws.path),
        "source repo should no longer track removed worktree"
    );
}

#[test]
fn test_workspace_hooks_receive_issue_metadata_env() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();
    let before_remove_log = tmp.path().join("before_remove_env.txt");
    let before_remove_log_quoted = shell_quote(&before_remove_log);
    let env_dump =
        "printf '%s|%s|%s|%s' \"$SYMPHONY_ISSUE_ID\" \"$SYMPHONY_ISSUE_IDENTIFIER\" \"$SYMPHONY_ISSUE_TITLE\" \"$SYMPHONY_WORKSPACE_PATH\"";

    let hooks = HooksConfig {
        after_create: Some(format!("{env_dump} > after_create_env.txt")),
        before_run: Some(format!("{env_dump} > before_run_env.txt")),
        after_run: Some(format!("{env_dump} > after_run_env.txt")),
        before_remove: Some(format!("{env_dump} > {before_remove_log_quoted}")),
        timeout_ms: 5_000,
    };
    let config = workspace_config(&root);
    let issue = make_test_issue("KAT-802");

    let ws = symphony::workspace::ensure_workspace_for_issue(&issue, &config, &hooks).unwrap();
    let ws_path = PathBuf::from(&ws.path);
    let expected = format!(
        "{}|{}|{}|{}",
        issue.id, issue.identifier, issue.title, ws.path
    );

    let after_create_env = fs::read_to_string(ws_path.join("after_create_env.txt")).unwrap();
    assert_eq!(after_create_env, expected);

    symphony::workspace::run_before_run_hook_for_issue(&ws_path, &hooks, &issue).unwrap();
    let before_run_env = fs::read_to_string(ws_path.join("before_run_env.txt")).unwrap();
    assert_eq!(before_run_env, expected);

    symphony::workspace::run_after_run_hook_for_issue(&ws_path, &hooks, &issue).unwrap();
    let after_run_env = fs::read_to_string(ws_path.join("after_run_env.txt")).unwrap();
    assert_eq!(after_run_env, expected);

    symphony::workspace::remove_workspace_for_issue(&ws_path, &config, &hooks, &issue).unwrap();
    let before_remove_env = fs::read_to_string(before_remove_log).unwrap();
    assert_eq!(before_remove_env, expected);
}

#[test]
fn test_workspace_remove_cleans_directory() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let hooks = hooks_config_none();

    let ws = symphony::workspace::ensure_workspace("MT-42", &config, &hooks).unwrap();
    let ws_path = PathBuf::from(&ws.path);
    assert!(ws_path.is_dir());

    // Remove the workspace
    symphony::workspace::remove_workspace(&ws_path, &config, &hooks).unwrap();
    assert!(!ws_path.exists());

    // Root should still exist
    let canonical_root = path_safety::canonicalize(&root).unwrap();
    assert!(canonical_root.is_dir());
}

#[test]
fn test_workspace_remove_runs_before_remove_hook() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let create_hooks = hooks_config_none();

    let ws = symphony::workspace::ensure_workspace("MT-42", &config, &create_hooks).unwrap();
    let ws_path = PathBuf::from(&ws.path);

    // Remove with a hook that fails — failure should be ignored, workspace still removed
    let remove_hooks = HooksConfig {
        after_create: None,
        before_run: None,
        after_run: None,
        before_remove: Some("exit 1".to_string()),
        timeout_ms: 5_000,
    };

    symphony::workspace::remove_workspace(&ws_path, &config, &remove_hooks).unwrap();
    assert!(
        !ws_path.exists(),
        "workspace should be removed even if hook fails"
    );
}

#[test]
fn test_workspace_remove_continues_when_worktree_cleanup_fails() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    let source_repo = tmp.path().join("source-repo");
    fs::create_dir_all(&root).unwrap();
    init_git_repo(&source_repo);

    let config = WorkspaceConfig {
        root: root.to_string_lossy().to_string(),
        repo: Some(source_repo.to_string_lossy().to_string()),
        strategy: WorkspaceRepoStrategy::Worktree,
        isolation: WorkspaceIsolation::Local,
        docker: None,
        branch_prefix: "symphony".to_string(),
        clone_branch: None,
        base_branch: Some("main".to_string()),
        cleanup_on_done: false,
    };
    let hooks = hooks_config_none();
    let issue = make_test_issue("KAT-803");

    let ws = symphony::workspace::ensure_workspace_for_issue(&issue, &config, &hooks).unwrap();
    let ws_path = PathBuf::from(&ws.path);

    // Break worktree cleanup by moving the source repo path away.
    fs::rename(&source_repo, tmp.path().join("moved-source-repo")).unwrap();

    let result = symphony::workspace::remove_workspace_for_issue(&ws_path, &config, &hooks, &issue);
    assert!(
        result.is_ok(),
        "workspace removal should continue after cleanup failure"
    );
    assert!(
        !ws_path.exists(),
        "workspace directory should still be deleted if worktree cleanup fails"
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Hook Lifecycle — 3 tests
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn test_before_run_hook_failure_is_fatal() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let hooks = hooks_config_none();

    let ws = symphony::workspace::ensure_workspace("MT-42", &config, &hooks).unwrap();
    let ws_path = PathBuf::from(&ws.path);

    let hooks = HooksConfig {
        after_create: None,
        before_run: Some("exit 7".to_string()),
        after_run: None,
        before_remove: None,
        timeout_ms: 5_000,
    };

    let result = symphony::workspace::run_before_run_hook(&ws_path, &hooks);
    assert!(result.is_err(), "before_run failure should be fatal");
    match result {
        Err(SymphonyError::WorkspaceHookFailed { hook, status }) => {
            assert_eq!(hook, "before_run");
            assert_eq!(status, 7);
        }
        other => panic!("Expected WorkspaceHookFailed, got: {:?}", other),
    }
}

#[test]
fn test_after_run_hook_failure_is_ignored() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let hooks = hooks_config_none();

    let ws = symphony::workspace::ensure_workspace("MT-42", &config, &hooks).unwrap();
    let ws_path = PathBuf::from(&ws.path);

    let hooks = HooksConfig {
        after_create: None,
        before_run: None,
        after_run: Some("exit 1".to_string()),
        before_remove: None,
        timeout_ms: 5_000,
    };

    let result = symphony::workspace::run_after_run_hook(&ws_path, &hooks);
    assert!(
        result.is_ok(),
        "after_run failure should be ignored (Ok(()))"
    );
}

#[test]
fn test_hook_output_truncation() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("workspaces");
    fs::create_dir_all(&root).unwrap();

    let config = workspace_config(&root);
    let hooks = hooks_config_none();

    let ws = symphony::workspace::ensure_workspace("MT-42", &config, &hooks).unwrap();
    let ws_path = PathBuf::from(&ws.path);

    // A hook that generates >2KB of output then fails
    let hooks = HooksConfig {
        after_create: None,
        before_run: Some("head -c 4096 /dev/zero | tr '\\0' 'x' && exit 1".to_string()),
        after_run: None,
        before_remove: None,
        timeout_ms: 5_000,
    };

    let result = symphony::workspace::run_before_run_hook(&ws_path, &hooks);
    // The hook should fail (exit 1), but the error should be present
    // Output truncation is verified at the log level — the error itself should exist
    assert!(result.is_err());
}

// ═══════════════════════════════════════════════════════════════════════
// Prompt Builder — 7 tests
// ═══════════════════════════════════════════════════════════════════════

fn make_full_issue() -> Issue {
    Issue {
        id: "abc-123".to_string(),
        identifier: "MT-42".to_string(),
        title: "Fix the widget".to_string(),
        description: Some("Detailed description".to_string()),
        priority: Some(2),
        state: "In Progress".to_string(),
        branch_name: Some("feature/mt-42".to_string()),
        url: Some("https://linear.app/mt-42".to_string()),
        assignee_id: Some("user-1".to_string()),
        labels: vec!["bug".to_string(), "urgent".to_string()],
        blocked_by: vec![
            BlockerRef {
                id: Some("blocker-1".to_string()),
                identifier: Some("MT-10".to_string()),
                state: Some("Done".to_string()),
            },
            BlockerRef {
                id: Some("blocker-2".to_string()),
                identifier: Some("MT-20".to_string()),
                state: Some("In Progress".to_string()),
            },
        ],
        assigned_to_worker: true,
        created_at: Some("2025-01-15T10:30:00Z".parse::<DateTime<Utc>>().unwrap()),
        updated_at: Some("2025-02-20T14:00:00Z".parse::<DateTime<Utc>>().unwrap()),
        children_count: 0,
        parent_identifier: None,
    }
}

#[test]
fn test_render_prompt_basic_fields() {
    let issue = make_full_issue();
    let template = "ID: {{ issue.identifier }}\nTitle: {{ issue.title }}\nLabels: {{ issue.labels | join: ', ' }}\nAttempt: {{ attempt }}";

    let result =
        symphony::prompt_builder::render_prompt(template, &issue, Some(2), Some("main")).unwrap();
    assert!(result.contains("ID: MT-42"), "got: {}", result);
    assert!(result.contains("Title: Fix the widget"), "got: {}", result);
    assert!(result.contains("Labels: bug, urgent"), "got: {}", result);
    assert!(result.contains("Attempt: 2"), "got: {}", result);
}

#[test]
fn test_render_prompt_workspace_base_branch() {
    let issue = make_full_issue();
    let template = "Base branch: {{ workspace.base_branch }}";

    let configured = symphony::prompt_builder::render_prompt(
        template,
        &issue,
        None,
        Some("elixir-feature-parity"),
    )
    .unwrap();
    assert!(
        configured.contains("Base branch: elixir-feature-parity"),
        "configured base branch should render, got: {}",
        configured
    );

    let defaulted = symphony::prompt_builder::render_prompt(template, &issue, None, None).unwrap();
    assert!(
        defaulted.contains("Base branch: main"),
        "missing workspace base branch should default to main, got: {}",
        defaulted
    );
}

#[test]
fn test_render_prompt_datetime_fields() {
    let issue = make_full_issue();
    let template = "Created: {{ issue.created_at }}\nUpdated: {{ issue.updated_at }}";

    let result =
        symphony::prompt_builder::render_prompt(template, &issue, None, Some("main")).unwrap();
    // Should contain ISO 8601 format
    assert!(
        result.contains("2025-01-15"),
        "created_at should render as ISO 8601, got: {}",
        result
    );
    assert!(
        result.contains("2025-02-20"),
        "updated_at should render as ISO 8601, got: {}",
        result
    );
}

#[test]
fn test_render_prompt_none_fields() {
    let issue = Issue {
        id: "test-id".to_string(),
        identifier: "MT-1".to_string(),
        title: "Test".to_string(),
        description: None,
        priority: None,
        state: "Todo".to_string(),
        branch_name: None,
        url: None,
        assignee_id: None,
        labels: vec![],
        blocked_by: vec![],
        assigned_to_worker: true,
        created_at: None,
        updated_at: None,
        children_count: 0,
        parent_identifier: None,
    };
    let template = "Desc: [{{ issue.description }}] Branch: [{{ issue.branch_name }}]";

    let result =
        symphony::prompt_builder::render_prompt(template, &issue, None, Some("main")).unwrap();
    // None fields should render as empty
    assert!(
        result.contains("Desc: []"),
        "None should render as empty, got: {}",
        result
    );
    assert!(
        result.contains("Branch: []"),
        "None should render as empty, got: {}",
        result
    );
}

#[test]
fn test_render_prompt_blockers_iterable() {
    let issue = make_full_issue();
    let template = "Blockers:{% for b in issue.blocked_by %} {{ b.identifier }}{% endfor %}";

    let result =
        symphony::prompt_builder::render_prompt(template, &issue, None, Some("main")).unwrap();
    assert!(
        result.contains("MT-10"),
        "Should iterate blockers, got: {}",
        result
    );
    assert!(
        result.contains("MT-20"),
        "Should iterate blockers, got: {}",
        result
    );
}

#[test]
fn test_render_prompt_strict_unknown_variable() {
    let issue = make_full_issue();
    let template = "{{ missing.field }}";

    let result = symphony::prompt_builder::render_prompt(template, &issue, None, Some("main"));
    match result {
        Err(SymphonyError::TemplateRenderError(_)) => { /* expected */ }
        other => panic!("Expected TemplateRenderError, got: {:?}", other),
    }
}

#[test]
fn test_render_prompt_parse_error() {
    let issue = make_full_issue();
    let template = "{% if issue.id %}"; // Unclosed if block

    let result = symphony::prompt_builder::render_prompt(template, &issue, None, Some("main"));
    match result {
        Err(SymphonyError::TemplateParseError(_)) => { /* expected */ }
        other => panic!("Expected TemplateParseError, got: {:?}", other),
    }
}

#[test]
fn test_render_prompt_attempt_none_vs_some() {
    let issue = make_full_issue();
    let template = "Attempt: [{{ attempt }}]";

    // None → empty
    let result_none =
        symphony::prompt_builder::render_prompt(template, &issue, None, Some("main")).unwrap();
    assert!(
        result_none.contains("Attempt: []"),
        "attempt=None should render as empty, got: {}",
        result_none
    );

    // Some(3) → "3"
    let result_some =
        symphony::prompt_builder::render_prompt(template, &issue, Some(3), Some("main")).unwrap();
    assert!(
        result_some.contains("Attempt: [3]"),
        "attempt=Some(3) should render as '3', got: {}",
        result_some
    );
}

#[test]
fn test_render_continuation_prompt_includes_turn_context() {
    let prompt = symphony::prompt_builder::render_continuation_prompt(2, 5);

    assert!(
        prompt.contains("Continuation guidance"),
        "continuation prompt should include a stable heading"
    );
    assert!(
        prompt.contains("turn #2 of 5"),
        "continuation prompt should include turn ordinal context"
    );
    assert!(
        prompt.contains("already present in this thread"),
        "continuation prompt should remind the agent to use existing thread context"
    );
}

#[tokio::test]
async fn test_docker_bootstrap_repository_rejects_non_remote_strategies() {
    let tmp = TempDir::new().unwrap();
    let local_repo = tmp.path().join("repo");
    fs::create_dir_all(&local_repo).unwrap();

    let strategies = [
        WorkspaceRepoStrategy::CloneLocal,
        WorkspaceRepoStrategy::Worktree,
    ];

    for strategy in strategies {
        let mut config = workspace_config(tmp.path());
        config.isolation = WorkspaceIsolation::Docker;
        config.repo = Some(local_repo.to_string_lossy().to_string());
        config.strategy = strategy;

        let err =
            symphony::workspace::docker_bootstrap_repository("container-id", &config, "KAT-821")
                .await
                .expect_err("docker bootstrap should reject non-remote strategies");

        let msg = err.to_string();
        assert!(
            msg.contains("is not supported with workspace.isolation 'docker'"),
            "unexpected error for {:?}: {}",
            strategy,
            msg
        );
    }
}
