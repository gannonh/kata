// WorkflowStore — live-watched config store with hot-reload.
//
// Holds the current effective (WorkflowDefinition, ServiceConfig) under a
// std::sync::RwLock, runs a background thread that watches the workflow file
// via `notify::recommended_watcher`, debounces events (400 ms), and
// atomically reloads on change.  Invalid reloads keep the last-known-good
// config and log the error.
//
// A `force_reload()` async method provides the dispatch-preflight reload
// trigger.
//
// SECURITY: api_key values must never be emitted via tracing.  `ServiceConfig`
// is never logged directly — only field names are logged, never values.

use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};

use crate::domain::{ServiceConfig, WorkflowDefinition};
use crate::error::{Result, SymphonyError};
use crate::{config, workflow};

// ── Type alias ────────────────────────────────────────────────────────────────

type EffectiveConfig = (WorkflowDefinition, ServiceConfig);

// ── WorkflowStore ─────────────────────────────────────────────────────────────

/// Owns the parsed WORKFLOW.md and its derived [`ServiceConfig`], and
/// hot-reloads the file when it changes on disk.
///
/// Last-known-good semantics: a reload failure (parse error, invalid config)
/// leaves the previous config in place.  Call [`effective_config`] to obtain
/// a snapshot of the current state.
///
/// [`effective_config`]: WorkflowStore::effective_config
pub struct WorkflowStore {
    path: PathBuf,
    inner: Arc<RwLock<EffectiveConfig>>,
    /// Keeps the watcher alive for the lifetime of the store.
    /// Dropping it would stop file-system notifications.
    _watcher: RecommendedWatcher,
}

impl WorkflowStore {
    /// Construct a [`WorkflowStore`] from a WORKFLOW.md path.
    ///
    /// Parses the file immediately.  Returns an error if the initial parse or
    /// config extraction fails (fail-fast on syntax/shape errors).  Does NOT
    /// call `config::validate()` — validation is the orchestrator's
    /// dispatch-preflight responsibility; the store accepts any syntactically
    /// valid config to allow iterative hot-reload fixes without restarting.
    ///
    /// Starts a background thread that debounces file-system events and
    /// hot-reloads the config when the watched file changes.
    pub fn new(path: &Path) -> Result<Self> {
        // Canonicalize early so all internal comparisons (including notify
        // event paths) use the real filesystem path.  On macOS /tmp is a
        // symlink to /private/tmp; without this, direct equality checks against
        // notify-reported paths would fail.  Fall back to the original path if
        // canonicalization is unavailable (e.g., path does not exist yet).
        let path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

        // ── 1. Load initial config — fail fast on parse/extraction errors ─
        let def = workflow::parse_workflow(&path)?;
        let cfg = config::from_workflow(&def.config)?;

        let inner: Arc<RwLock<EffectiveConfig>> = Arc::new(RwLock::new((def, cfg)));

        // ── 2. Set up mpsc channel for notify events ───────────────────────
        let (tx, rx) = std::sync::mpsc::channel::<notify::Event>();

        // ── 3. Create notify watcher ───────────────────────────────────────
        let watched_path = path.clone();
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            match res {
                Ok(e) => {
                    if event_mentions_workflow(&e, &watched_path) {
                        // Best-effort send — receiver may be gone if store dropped.
                        let _ = tx.send(e);
                    }
                }
                Err(e) => {
                    // OS-level watcher failures (inotify limit, permission denied,
                    // FSEvents overflow, etc.) mean the watcher is permanently broken
                    // and hot-reload is dead until the process restarts.
                    tracing::error!(
                        reason = %e,
                        "file-system watcher error — hot-reload is disabled until restart"
                    );
                }
            }
        })
        .map_err(|e| SymphonyError::Other(format!("watcher creation failed: {e}")))?;

        // Watch the parent directory with non-recursive mode.
        // Watching the parent (rather than the file itself) covers editors and
        // tools that use atomic-rename writes (write to temp → rename).
        let watch_dir = path.parent().ok_or_else(|| {
            SymphonyError::Other(format!(
                "cannot determine parent directory for watch path: {}",
                path.display()
            ))
        })?;

        watcher
            .watch(watch_dir, RecursiveMode::NonRecursive)
            .map_err(|e| SymphonyError::Other(format!("watcher setup failed: {e}")))?;

        // ── 4. Spawn debounce thread ───────────────────────────────────────
        //
        // We use a plain std::thread (not tokio::spawn) so that the store
        // can be constructed in both sync (`#[test]`) and async
        // (`#[tokio::test]`) contexts without requiring an active tokio
        // runtime.
        {
            let path_t = path.clone();
            let inner_t = inner.clone();

            std::thread::spawn(move || {
                while rx.recv().is_ok() {
                    // Debounce: sleep 400 ms, then drain any events
                    // that arrived in the meantime, before reloading.
                    std::thread::sleep(Duration::from_millis(400));
                    while rx.try_recv().is_ok() {}

                    force_reload_inner(&path_t, &inner_t);
                    // Receiver error means the sender (watcher) was
                    // dropped — store has been destroyed, exit thread.
                }
            });
        }

        Ok(WorkflowStore {
            path,
            inner,
            _watcher: watcher,
        })
    }

    /// Return a snapshot of the current `(WorkflowDefinition, ServiceConfig)`.
    ///
    /// Return the parent directory of the workflow file.
    ///
    /// Prompt file paths in `prompts.by_state` are resolved relative to this.
    pub fn workflow_dir(&self) -> &Path {
        self.path.parent().unwrap_or(Path::new("."))
    }

    /// Return a snapshot of the current effective config (workflow definition
    /// + service config).
    ///
    /// The snapshot is a clone — callers can inspect it freely without holding
    /// a lock.  This method is safe to call from both sync and async contexts.
    ///
    /// If the read lock is poisoned (another thread panicked while holding the
    /// write lock), the last-written value is recovered and returned rather
    /// than propagating a panic.
    pub fn effective_config(&self) -> EffectiveConfig {
        match self.inner.read() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => {
                tracing::warn!(
                    "WorkflowStore read lock was poisoned — recovering last-known-good config"
                );
                poisoned.into_inner().clone()
            }
        }
    }

    /// Force an immediate reload of the workflow file, bypassing the debounce
    /// buffer.
    ///
    /// If the reload fails, the last-known-good config is preserved and the
    /// error is logged and returned to the caller.
    ///
    /// Useful as a dispatch-preflight check: the orchestrator can call this
    /// right before dispatching a new agent session to pick up any changes.
    ///
    /// NOTE: This method does NOT call `config::validate()`.  The orchestrator
    /// must call `config::validate(&store.effective_config().1)` separately as
    /// a dispatch preflight.  See D017.
    pub async fn force_reload(&self) -> Result<()> {
        let path = self.path.clone();
        let inner = self.inner.clone();
        tokio::task::spawn_blocking(move || match try_load(&path) {
            Ok(effective) => apply_effective(&path, &inner, effective),
            Err(e) => {
                tracing::error!(
                    path = %path.display(),
                    reason = %e,
                    "workflow reload failed — keeping last known good"
                );
                Err(e)
            }
        })
        .await
        .map_err(|e| SymphonyError::Other(format!("reload task panicked: {e}")))?
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Attempt to parse and extract config from the workflow file, then atomically
/// update the store.  On failure, log the error and keep the last-known-good
/// config.
fn force_reload_inner(path: &Path, inner: &Arc<RwLock<EffectiveConfig>>) {
    let result = try_load(path).and_then(|effective| apply_effective(path, inner, effective));
    if let Err(e) = result {
        tracing::error!(
            path = %path.display(),
            reason = %e,
            "workflow reload failed — keeping last known good"
        );
    }
}

fn apply_effective(
    path: &Path,
    inner: &Arc<RwLock<EffectiveConfig>>,
    effective: EffectiveConfig,
) -> Result<()> {
    let mut guard = match inner.write() {
        Ok(guard) => guard,
        Err(poisoned) => {
            tracing::warn!(
                path = %path.display(),
                "WorkflowStore write lock was poisoned — recovering and overwriting with fresh config"
            );
            poisoned.into_inner()
        }
    };
    *guard = effective;
    tracing::info!(
        path = %path.display(),
        "workflow reloaded successfully"
    );
    Ok(())
}

fn event_mentions_workflow(event: &notify::Event, workflow_path: &Path) -> bool {
    event
        .paths
        .iter()
        .any(|event_path| event_path_matches_workflow(event_path, workflow_path))
}

fn event_path_matches_workflow(event_path: &Path, workflow_path: &Path) -> bool {
    let same_filename = event_path.file_name() == workflow_path.file_name();
    event_path == workflow_path
        || event_path.ends_with(workflow_path)
        || (same_filename
            && matches!(
                (event_path.parent(), workflow_path.parent()),
                (Some(event_parent), Some(workflow_parent))
                    if event_parent == workflow_parent || event_parent.ends_with(workflow_parent)
            ))
}

/// Parse and extract — returning the full [`EffectiveConfig`] or an error.
///
/// Does not call `config::validate()` (validation is the orchestrator's
/// dispatch-preflight responsibility).  Does not touch the store state.
fn try_load(path: &Path) -> Result<EffectiveConfig> {
    let def = workflow::parse_workflow(path)?;
    let cfg = config::from_workflow(&def.config)?;
    Ok((def, cfg))
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{EventAttributes, EventKind};

    fn make_event(paths: &[&str]) -> notify::Event {
        notify::Event {
            kind: EventKind::Any,
            paths: paths.iter().map(PathBuf::from).collect(),
            attrs: EventAttributes::new(),
        }
    }

    #[test]
    fn event_matches_exact_workflow_path() {
        let workflow = Path::new("/tmp/work/WORKFLOW.md");
        let event = make_event(&["/tmp/work/WORKFLOW.md"]);
        assert!(event_mentions_workflow(&event, workflow));
    }

    #[test]
    fn event_matches_when_workflow_path_is_relative() {
        let workflow = Path::new("WORKFLOW.md");
        let event = make_event(&["/tmp/work/WORKFLOW.md"]);
        assert!(event_mentions_workflow(&event, workflow));
    }

    #[test]
    fn event_ignores_unrelated_paths() {
        let workflow = Path::new("/tmp/work/WORKFLOW.md");
        let event = make_event(&["/tmp/work/README.md", "/tmp/work/.tmp123"]);
        assert!(!event_mentions_workflow(&event, workflow));
    }
}
