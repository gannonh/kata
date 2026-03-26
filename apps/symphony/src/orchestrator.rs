use chrono::{DateTime, Utc};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::future::Future;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use crate::codex::app_server;
use crate::config;
use crate::domain::{
    AgentBackend, AgentEvent, CodexConfig, CodexTotals, CompletedEntry, HooksConfig, Issue,
    OrchestratorSnapshot, OrchestratorState, PiAgentConfig, PollingSnapshot, RateLimitInfo,
    RefreshRequestOutcome, RetryEntry, RetrySnapshotEntry, RunAttempt, RunningSessionSnapshot,
    ServiceConfig, SessionTokenUsage, TrackerConfig, WorkerSessionInfo, WorkspaceConfig,
    WorkspaceIsolation,
};
use crate::error::{Result, SymphonyError};
use crate::notifications;
use crate::pi_agent::rpc_bridge;
use crate::session_summary::{compact_session_id, normalize_whitespace, truncate_for_display};
use crate::ssh::{self, WorkerHostSelection};
use crate::workflow_store::WorkflowStore;
use crate::{docker, path_safety, prompt_builder, workspace};

// ── Standalone Worker Task ──────────────────────────────────────────────

/// All configuration needed by a spawned worker task.
/// Bundled into a struct to avoid too-many-arguments lint.
struct WorkerTaskConfig {
    workspace: WorkspaceConfig,
    hooks: HooksConfig,
    codex: CodexConfig,
    pi_agent: PiAgentConfig,
    agent_backend: AgentBackend,
    max_turns: u32,
    tracker: TrackerConfig,
    prompt_template: String,
    event_tx: tokio::sync::mpsc::UnboundedSender<(String, AgentEvent)>,
}

enum IssueCheck {
    Continue(Issue),
    Done(Issue),
    Error(SymphonyError),
}

struct SessionTurnLoopSuccess {
    events: Vec<AgentEvent>,
    metrics: Option<TurnMetrics>,
    schedule_continuation: bool,
}

struct SessionTurnLoopFailure {
    error: SymphonyError,
    events: Vec<AgentEvent>,
    metrics: Option<TurnMetrics>,
}

fn accumulate_turn_metrics(
    metrics: &mut Option<TurnMetrics>,
    input_tokens: u64,
    output_tokens: u64,
    total_tokens: u64,
    rate_limits: Option<serde_json::Value>,
) {
    match metrics {
        Some(total) => {
            total.input_tokens = total.input_tokens.saturating_add(input_tokens);
            total.output_tokens = total.output_tokens.saturating_add(output_tokens);
            total.total_tokens = total.total_tokens.saturating_add(total_tokens);
            if let Some(rate_limits) = rate_limits {
                total.rate_limits = Some(rate_limits);
            }
        }
        None => {
            *metrics = Some(TurnMetrics {
                input_tokens,
                output_tokens,
                total_tokens,
                rate_limits,
            });
        }
    }
}

fn is_terminal_state(state_name: &str, tracker_config: &TrackerConfig) -> bool {
    let normalized = normalize_issue_state(state_name);
    tracker_config
        .terminal_states
        .iter()
        .any(|state| normalize_issue_state(state) == normalized)
}

fn is_active_state(state_name: &str, tracker_config: &TrackerConfig) -> bool {
    let normalized = normalize_issue_state(state_name);
    tracker_config
        .active_states
        .iter()
        .any(|state| normalize_issue_state(state) == normalized)
}

fn backend_stall_timeout_ms(config: &ServiceConfig, backend: AgentBackend) -> i64 {
    let timeout = match backend {
        AgentBackend::KataCli => config.pi_agent.stall_timeout_ms,
        AgentBackend::Codex => config.codex.stall_timeout_ms,
    };
    timeout.min(i64::MAX as u64) as i64
}

fn effective_pi_model_for_issue(config: &ServiceConfig, issue: &Issue) -> Option<String> {
    config.pi_agent.model_for_state(&issue.state)
}

/// Determine whether a multi-turn session should continue after a turn completes.
///
/// Returns `true` only if:
/// - The issue is still assigned to this worker
/// - The issue is in an active (non-terminal) state
/// - The issue state has NOT changed from the state it was dispatched with
///
/// A state change (e.g. In Progress → Agent Review) means the orchestrator
/// should end this session and dispatch a new one with the appropriate per-state
/// prompt. Without this check, the multi-turn loop continues with a stale prompt
/// and the agent never receives the instructions for the new state.
fn should_continue_issue_in_session(
    issue: &Issue,
    tracker_config: &TrackerConfig,
    dispatched_state: &str,
) -> bool {
    issue.assigned_to_worker
        && is_active_state(&issue.state, tracker_config)
        && !is_terminal_state(&issue.state, tracker_config)
        && normalize_issue_state(&issue.state) == normalize_issue_state(dispatched_state)
}

async fn check_issue_still_active(
    issue: &Issue,
    client: &crate::linear::client::LinearClient,
    tracker_config: &TrackerConfig,
    dispatched_state: &str,
) -> IssueCheck {
    match client
        .fetch_issue_states_by_ids(std::slice::from_ref(&issue.id))
        .await
    {
        Ok(issues) => match issues.first() {
            Some(refreshed) => {
                if should_continue_issue_in_session(refreshed, tracker_config, dispatched_state) {
                    IssueCheck::Continue(refreshed.clone())
                } else {
                    if is_active_state(&refreshed.state, tracker_config)
                        && normalize_issue_state(&refreshed.state)
                            != normalize_issue_state(dispatched_state)
                    {
                        tracing::info!(
                            issue_id = %refreshed.id,
                            issue_identifier = %refreshed.identifier,
                            dispatched_state = %dispatched_state,
                            current_state = %refreshed.state,
                            "issue state changed during session; ending session for re-dispatch with new prompt"
                        );
                    }
                    IssueCheck::Done(refreshed.clone())
                }
            }
            None => IssueCheck::Done(issue.clone()),
        },
        Err(err) => IssueCheck::Error(err),
    }
}

async fn run_codex_turns_in_session<E, EFut, EventCallback>(
    session: &mut app_server::SessionHandle,
    issue: &Issue,
    initial_prompt: String,
    max_turns: u32,
    tracker_config: &TrackerConfig,
    graphql_executor: E,
    mut stream_event: EventCallback,
) -> std::result::Result<SessionTurnLoopSuccess, SessionTurnLoopFailure>
where
    E: Fn(String, serde_json::Value) -> EFut + Clone + Send,
    EFut: Future<Output = Result<serde_json::Value>> + Send,
    EventCallback: FnMut(AgentEvent) + Send,
{
    let capped_max_turns = max_turns.max(1);
    let mut turn_number: u32 = 1;
    let mut current_issue = issue.clone();
    let issue_state_client = crate::linear::client::LinearClient::new(tracker_config.clone());
    let mut observed_events: Vec<AgentEvent> = Vec::new();
    let mut metrics: Option<TurnMetrics> = None;
    let mut schedule_continuation = true;
    let mut initial_prompt = Some(initial_prompt);

    loop {
        let prompt = if turn_number == 1 {
            initial_prompt.take().unwrap_or_default()
        } else {
            prompt_builder::render_continuation_prompt(turn_number, capped_max_turns)
        };

        let run_result =
            app_server::run_turn(session, &prompt, graphql_executor.clone(), |event| {
                stream_event(event.clone());
                observed_events.push(event);
            })
            .await;

        match run_result {
            Ok(turn_result) => {
                accumulate_turn_metrics(
                    &mut metrics,
                    turn_result.input_tokens,
                    turn_result.output_tokens,
                    turn_result.total_tokens,
                    turn_result.rate_limits.clone(),
                );
            }
            Err(err) => {
                return Err(SessionTurnLoopFailure {
                    error: err,
                    events: observed_events,
                    metrics,
                });
            }
        }

        if turn_number >= capped_max_turns {
            break;
        }

        match check_issue_still_active(
            &current_issue,
            &issue_state_client,
            tracker_config,
            &issue.state,
        )
        .await
        {
            IssueCheck::Continue(refreshed) => {
                current_issue = refreshed;
                turn_number = turn_number.saturating_add(1);
            }
            IssueCheck::Done(_refreshed) => {
                schedule_continuation = false;
                break;
            }
            IssueCheck::Error(err) => {
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: None,
                    message: format!(
                        "inter-turn issue refresh failed for {} ({}): {}",
                        current_issue.identifier, current_issue.id, err
                    ),
                };
                stream_event(event.clone());
                observed_events.push(event);
                tracing::warn!(
                    issue_id = %current_issue.id,
                    issue_identifier = %current_issue.identifier,
                    error = %err,
                    "failed to refresh issue state between worker turns; ending session-level turn loop"
                );
                break;
            }
        }
    }

    Ok(SessionTurnLoopSuccess {
        events: observed_events,
        metrics,
        schedule_continuation,
    })
}

async fn run_pi_turns_in_session<EventCallback>(
    session: &mut rpc_bridge::SessionHandle,
    issue: &Issue,
    initial_prompt: String,
    max_turns: u32,
    tracker_config: &TrackerConfig,
    mut stream_event: EventCallback,
) -> std::result::Result<SessionTurnLoopSuccess, SessionTurnLoopFailure>
where
    EventCallback: FnMut(AgentEvent) + Send,
{
    let capped_max_turns = max_turns.max(1);
    let mut turn_number: u32 = 1;
    let mut current_issue = issue.clone();
    let issue_state_client = crate::linear::client::LinearClient::new(tracker_config.clone());
    let mut observed_events: Vec<AgentEvent> = Vec::new();
    let mut metrics: Option<TurnMetrics> = None;
    let mut schedule_continuation = true;
    let mut initial_prompt = Some(initial_prompt);

    loop {
        let prompt = if turn_number == 1 {
            initial_prompt.take().unwrap_or_default()
        } else {
            prompt_builder::render_continuation_prompt(turn_number, capped_max_turns)
        };

        let run_result = rpc_bridge::run_turn(session, &prompt, |event| {
            stream_event(event.clone());
            observed_events.push(event);
        })
        .await;

        match run_result {
            Ok(turn_result) => {
                accumulate_turn_metrics(
                    &mut metrics,
                    turn_result.input_tokens,
                    turn_result.output_tokens,
                    turn_result.total_tokens,
                    turn_result.rate_limits.clone(),
                );
            }
            Err(err) => {
                return Err(SessionTurnLoopFailure {
                    error: err,
                    events: observed_events,
                    metrics,
                });
            }
        }

        if turn_number >= capped_max_turns {
            break;
        }

        match check_issue_still_active(
            &current_issue,
            &issue_state_client,
            tracker_config,
            &issue.state,
        )
        .await
        {
            IssueCheck::Continue(refreshed) => {
                current_issue = refreshed;
                turn_number = turn_number.saturating_add(1);
            }
            IssueCheck::Done(_refreshed) => {
                schedule_continuation = false;
                break;
            }
            IssueCheck::Error(err) => {
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: None,
                    message: format!(
                        "inter-turn issue refresh failed for {} ({}): {}",
                        current_issue.identifier, current_issue.id, err
                    ),
                };
                stream_event(event.clone());
                observed_events.push(event);
                tracing::warn!(
                    issue_id = %current_issue.id,
                    issue_identifier = %current_issue.identifier,
                    error = %err,
                    "failed to refresh issue state between worker turns; ending session-level turn loop"
                );
                break;
            }
        }
    }

    Ok(SessionTurnLoopSuccess {
        events: observed_events,
        metrics,
        schedule_continuation,
    })
}

/// Run the full worker lifecycle for a single issue. This function is
/// designed to run in a spawned tokio task — it takes owned/cloned data
/// and does not require `&mut Orchestrator`.
///
/// Steps: ensure workspace → before_run hook → render prompt → start
/// Codex session → run up to max_turns on one session → stop session → after_run hook.
async fn run_worker_task(
    issue: &Issue,
    attempt: Option<u32>,
    worker_host: Option<&str>,
    config: &WorkerTaskConfig,
) -> WorkerResult {
    let issue_id = issue.id.clone();

    if config.workspace.isolation == WorkspaceIsolation::Docker {
        let docker_config = config.workspace.docker.clone().unwrap_or_default();

        if !docker::is_docker_available().await {
            return WorkerResult {
                issue_id,
                completion: WorkerCompletion::Failed {
                    error: SymphonyError::DockerNotAvailable.to_string(),
                },
                events: vec![],
                metrics: None,
            };
        }

        let image =
            match docker::resolve_image(&docker_config.image, docker_config.setup.as_deref()).await
            {
                Ok(image) => image,
                Err(err) => {
                    return WorkerResult {
                        issue_id,
                        completion: WorkerCompletion::Failed {
                            error: format!("docker image resolution failed: {err}"),
                        },
                        events: vec![],
                        metrics: None,
                    };
                }
            };

        let env_values: Vec<(&str, String)> = ["LINEAR_API_KEY", "GH_TOKEN", "GITHUB_TOKEN"]
            .into_iter()
            .filter_map(|key| {
                std::env::var(key)
                    .ok()
                    .filter(|value| !value.is_empty())
                    .map(|value| (key, value))
            })
            .collect();
        let env_refs: Vec<(&str, &str)> = env_values
            .iter()
            .map(|(key, value)| (*key, value.as_str()))
            .collect();

        let container_id =
            match docker::start_container(&image, issue, &docker_config, &env_refs).await {
                Ok(id) => id,
                Err(err) => {
                    return WorkerResult {
                        issue_id,
                        completion: WorkerCompletion::Failed {
                            error: format!("docker container start failed: {err}"),
                        },
                        events: vec![],
                        metrics: None,
                    };
                }
            };

        let docker_result: std::result::Result<(WorkerCompletion, Option<TurnMetrics>), String> =
            async {
                workspace::docker_bootstrap_repository(
                    &container_id,
                    &config.workspace,
                    &issue.identifier,
                )
                .await
                .map_err(|err| format!("docker workspace bootstrap failed: {err}"))?;

                if let Some(hook) = &config.hooks.after_create {
                    workspace::run_hook_in_container(
                        "after_create",
                        &container_id,
                        hook,
                        issue,
                        config.hooks.timeout_ms,
                    )
                    .await
                    .map_err(|err| format!("after_create hook failed: {err}"))?;
                }

                if let Some(hook) = &config.hooks.before_run {
                    workspace::run_hook_in_container(
                        "before_run",
                        &container_id,
                        hook,
                        issue,
                        config.hooks.timeout_ms,
                    )
                    .await
                    .map_err(|err| format!("before_run hook failed: {err}"))?;
                }

                let prompt = prompt_builder::render_prompt(
                    &config.prompt_template,
                    issue,
                    attempt,
                    config.workspace.base_branch.as_deref(),
                )
                .map_err(|err| format!("prompt rendering failed: {err}"))?;

                let loop_result = match config.agent_backend {
                    AgentBackend::Codex => {
                        let mut session = app_server::start_session(
                            &config.codex,
                            issue,
                            Path::new("/workspace"),
                            Path::new("/"),
                            None,
                            Some(&container_id),
                        )
                        .await
                        .map_err(|err| format!("codex session start failed: {err}"))?;

                        tracing::info!(
                            event = "worker_started",
                            backend = "codex",
                            issue_id = %issue.id,
                            issue_identifier = %issue.identifier,
                            session_id = %session.session_id,
                            workspace_path = "/workspace",
                            container_id = %container_id,
                            "docker worker attempt started"
                        );

                        let linear_client =
                            crate::linear::client::LinearClient::new(config.tracker.clone());
                        let graphql_executor = move |query: String, vars: serde_json::Value| {
                            let client = linear_client.clone();
                            async move { client.graphql_raw(&query, vars).await }
                        };

                        let loop_result = run_codex_turns_in_session(
                            &mut session,
                            issue,
                            prompt.clone(),
                            config.max_turns,
                            &config.tracker,
                            graphql_executor,
                            {
                                let event_tx = config.event_tx.clone();
                                let issue_id = issue.id.clone();
                                move |event| {
                                    let _ = event_tx.send((issue_id.clone(), event));
                                }
                            },
                        )
                        .await;

                        if let Err(err) = app_server::stop_session(session).await {
                            tracing::warn!(
                                issue_id = %issue.id,
                                issue_identifier = %issue.identifier,
                                error = %err,
                                "failed to stop codex session cleanly"
                            );
                        }

                        loop_result
                    }
                    AgentBackend::KataCli => {
                        let mut session = rpc_bridge::start_session(
                            &config.pi_agent,
                            issue,
                            Path::new("/workspace"),
                            Path::new("/"),
                            None,
                            Some(&container_id),
                        )
                        .await
                        .map_err(|err| format!("pi session start failed: {err}"))?;

                        tracing::info!(
                            event = "worker_started",
                            backend = "kata-cli",
                            issue_id = %issue.id,
                            issue_identifier = %issue.identifier,
                            session_id = %session.session_id,
                            workspace_path = "/workspace",
                            container_id = %container_id,
                            "docker worker attempt started"
                        );

                        let loop_result = run_pi_turns_in_session(
                            &mut session,
                            issue,
                            prompt,
                            config.max_turns,
                            &config.tracker,
                            {
                                let event_tx = config.event_tx.clone();
                                let issue_id = issue.id.clone();
                                move |event| {
                                    let _ = event_tx.send((issue_id.clone(), event));
                                }
                            },
                        )
                        .await;

                        if let Err(err) = rpc_bridge::stop_session(session).await {
                            tracing::warn!(
                                issue_id = %issue.id,
                                issue_identifier = %issue.identifier,
                                error = %err,
                                "failed to stop pi session cleanly"
                            );
                        }

                        loop_result
                    }
                };

                if let Some(hook) = &config.hooks.after_run {
                    if let Err(err) = workspace::run_hook_in_container(
                        "after_run",
                        &container_id,
                        hook,
                        issue,
                        config.hooks.timeout_ms,
                    )
                    .await
                    {
                        tracing::warn!(
                            issue_id = %issue.id,
                            issue_identifier = %issue.identifier,
                            error = %err,
                            "after_run hook failure ignored"
                        );
                    }
                }

                let (completion, metrics) = match loop_result {
                    Ok(success) => (
                        WorkerCompletion::Completed {
                            schedule_continuation: success.schedule_continuation,
                        },
                        success.metrics,
                    ),
                    Err(failure) => (
                        WorkerCompletion::Failed {
                            error: failure.error.to_string(),
                        },
                        failure.metrics,
                    ),
                };

                Ok((completion, metrics))
            }
            .await;

        if let Err(err) = docker::stop_container(&container_id).await {
            tracing::warn!(
                issue_id = %issue.id,
                issue_identifier = %issue.identifier,
                container_id = %container_id,
                error = %err,
                "failed to stop docker container cleanly"
            );
        }

        return match docker_result {
            Ok((completion, metrics)) => WorkerResult {
                issue_id,
                completion,
                events: vec![],
                metrics,
            },
            Err(error) => WorkerResult {
                issue_id,
                completion: WorkerCompletion::Failed { error },
                events: vec![],
                metrics: None,
            },
        };
    }

    // 1. Ensure workspace (create dir + after_create hook)
    let workspace_info =
        match workspace::ensure_workspace_for_issue(issue, &config.workspace, &config.hooks) {
            Ok(info) => info,
            Err(err) => {
                tracing::error!(
                    event = "worker_workspace_failed",
                    issue_id = %issue_id,
                    issue_identifier = %issue.identifier,
                    error = %err,
                    "workspace creation failed"
                );
                return WorkerResult {
                    issue_id,
                    completion: WorkerCompletion::Failed {
                        error: format!("workspace creation failed: {err}"),
                    },
                    events: vec![],
                    metrics: None,
                };
            }
        };

    let workspace_path = Path::new(&workspace_info.path);

    // 2. Before-run hook
    if let Err(err) = workspace::run_before_run_hook_for_issue(workspace_path, &config.hooks, issue)
    {
        tracing::error!(
            event = "worker_before_run_failed",
            issue_id = %issue_id,
            error = %err,
            "before_run hook failed"
        );
        return WorkerResult {
            issue_id,
            completion: WorkerCompletion::Failed {
                error: format!("before_run hook failed: {err}"),
            },
            events: vec![],
            metrics: None,
        };
    }

    // 3. Render prompt
    let prompt = match prompt_builder::render_prompt(
        &config.prompt_template,
        issue,
        attempt,
        config.workspace.base_branch.as_deref(),
    ) {
        Ok(prompt) => prompt,
        Err(err) => {
            tracing::error!(
                event = "worker_prompt_failed",
                issue_id = %issue_id,
                error = %err,
                "prompt rendering failed"
            );
            return WorkerResult {
                issue_id,
                completion: WorkerCompletion::Failed {
                    error: format!("prompt rendering failed: {err}"),
                },
                events: vec![],
                metrics: None,
            };
        }
    };

    let workspace_root = Path::new(&config.workspace.root);
    let loop_result = match config.agent_backend {
        AgentBackend::Codex => {
            let mut session = match app_server::start_session(
                &config.codex,
                issue,
                workspace_path,
                workspace_root,
                worker_host,
                None,
            )
            .await
            {
                Ok(session) => session,
                Err(err) => {
                    tracing::error!(
                        event = "worker_session_start_failed",
                        issue_id = %issue_id,
                        issue_identifier = %issue.identifier,
                        error = %err,
                        "codex session start failed"
                    );
                    return WorkerResult {
                        issue_id,
                        completion: WorkerCompletion::Failed {
                            error: format!("codex session start failed: {err}"),
                        },
                        events: vec![],
                        metrics: None,
                    };
                }
            };

            tracing::info!(
                event = "worker_started",
                backend = "codex",
                issue_id = %issue_id,
                issue_identifier = %issue.identifier,
                session_id = %session.session_id,
                workspace_path = %workspace_info.path,
                "worker attempt started"
            );

            let linear_client = crate::linear::client::LinearClient::new(config.tracker.clone());
            let graphql_executor = move |query: String, vars: serde_json::Value| {
                let client = linear_client.clone();
                async move { client.graphql_raw(&query, vars).await }
            };

            let loop_result = run_codex_turns_in_session(
                &mut session,
                issue,
                prompt.clone(),
                config.max_turns,
                &config.tracker,
                graphql_executor,
                {
                    let event_tx = config.event_tx.clone();
                    let issue_id = issue.id.clone();
                    move |event| {
                        let _ = event_tx.send((issue_id.clone(), event));
                    }
                },
            )
            .await;

            if let Err(err) = app_server::stop_session(session).await {
                tracing::warn!(
                    issue_id = %issue_id,
                    error = %err,
                    "failed to stop codex session cleanly"
                );
            }

            loop_result
        }
        AgentBackend::KataCli => {
            let mut session = match rpc_bridge::start_session(
                &config.pi_agent,
                issue,
                workspace_path,
                workspace_root,
                worker_host,
                None,
            )
            .await
            {
                Ok(session) => session,
                Err(err) => {
                    tracing::error!(
                        event = "worker_session_start_failed",
                        issue_id = %issue_id,
                        issue_identifier = %issue.identifier,
                        error = %err,
                        "pi session start failed"
                    );
                    return WorkerResult {
                        issue_id,
                        completion: WorkerCompletion::Failed {
                            error: format!("pi session start failed: {err}"),
                        },
                        events: vec![],
                        metrics: None,
                    };
                }
            };

            tracing::info!(
                event = "worker_started",
                backend = "kata-cli",
                issue_id = %issue_id,
                issue_identifier = %issue.identifier,
                session_id = %session.session_id,
                workspace_path = %workspace_info.path,
                "worker attempt started"
            );

            let loop_result = run_pi_turns_in_session(
                &mut session,
                issue,
                prompt,
                config.max_turns,
                &config.tracker,
                {
                    let event_tx = config.event_tx.clone();
                    let issue_id = issue.id.clone();
                    move |event| {
                        let _ = event_tx.send((issue_id.clone(), event));
                    }
                },
            )
            .await;

            if let Err(err) = rpc_bridge::stop_session(session).await {
                tracing::warn!(
                    issue_id = %issue_id,
                    error = %err,
                    "failed to stop pi session cleanly"
                );
            }

            loop_result
        }
    };

    // 7. After-run hook
    let _ = workspace::run_after_run_hook_for_issue(workspace_path, &config.hooks, issue);

    // 8. Build result
    match loop_result {
        Ok(success) => WorkerResult {
            issue_id,
            completion: WorkerCompletion::Completed {
                schedule_continuation: success.schedule_continuation,
            },
            events: vec![],
            metrics: success.metrics,
        },
        Err(failure) => WorkerResult {
            issue_id,
            completion: WorkerCompletion::Failed {
                error: failure.error.to_string(),
            },
            events: vec![],
            metrics: failure.metrics,
        },
    }
}

// ── Snapshot Handle (S07 read seam) ─────────────────────────────────────

/// Read-only handle to the latest orchestrator snapshot.
///
/// Clone-cheap (`Arc`-backed). Multiple HTTP handlers can hold references
/// and read concurrently without blocking the orchestrator's mutable loop.
/// The orchestrator publishes a fresh snapshot after every material state
/// change; readers always see a consistent point-in-time view.
#[derive(Clone)]
pub struct SnapshotHandle {
    inner: Arc<RwLock<OrchestratorSnapshot>>,
}

impl SnapshotHandle {
    /// Read the latest published snapshot. Returns a clone so the caller
    /// owns the data without holding the lock.
    pub fn read(&self) -> OrchestratorSnapshot {
        self.inner.read().expect("snapshot rwlock poisoned").clone()
    }

    /// Create a handle pre-loaded with the given snapshot.
    pub fn new(snapshot: OrchestratorSnapshot) -> Self {
        Self {
            inner: Arc::new(RwLock::new(snapshot)),
        }
    }

    /// Publish a new snapshot (called by the orchestrator).
    fn publish(&self, snapshot: OrchestratorSnapshot) {
        *self.inner.write().expect("snapshot rwlock poisoned") = snapshot;
    }
}

// ── Refresh Control Channel (S07 control seam) ──────────────────────────

/// Sender half of the refresh control channel.
///
/// Clone-cheap (`Arc`-backed). HTTP handlers hold this to request an
/// immediate orchestrator tick. Duplicate requests coalesce: if a refresh
/// is already pending, subsequent requests report `coalesced: true` and
/// do not queue additional ticks.
#[derive(Clone)]
pub struct RefreshSender {
    pending: Arc<AtomicBool>,
    notify: Arc<tokio::sync::Notify>,
}

impl RefreshSender {
    /// Request an immediate orchestrator refresh cycle.
    ///
    /// Returns `RefreshRequestOutcome` indicating whether this request was
    /// freshly queued or coalesced with an already-pending request.
    pub fn request_refresh(&self) -> RefreshRequestOutcome {
        let was_pending = self.pending.swap(true, Ordering::SeqCst);
        self.notify.notify_one();
        if was_pending {
            RefreshRequestOutcome {
                queued: false,
                coalesced: true,
                pending_requests: 1,
            }
        } else {
            RefreshRequestOutcome {
                queued: true,
                coalesced: false,
                pending_requests: 1,
            }
        }
    }
}

/// Receiver half of the refresh control channel.
///
/// Only the orchestrator holds this. It checks for pending refresh
/// requests in its runtime loop and clears the flag atomically.
pub struct RefreshReceiver {
    pending: Arc<AtomicBool>,
    notify: Arc<tokio::sync::Notify>,
}

impl RefreshReceiver {
    /// Atomically check and clear the pending refresh flag.
    /// Returns `true` if a refresh was requested since the last check.
    pub fn take_pending(&self) -> bool {
        self.pending.swap(false, Ordering::SeqCst)
    }

    /// Wait until a refresh is requested. This is cancel-safe and suitable
    /// for use inside `tokio::select!`.
    pub async fn notified(&self) {
        self.notify.notified().await;
    }
}

/// Create a paired refresh control channel (sender + receiver).
///
/// The sender is clone-cheap for sharing across HTTP handlers.
/// The receiver should be held by the orchestrator runtime loop.
pub fn refresh_channel() -> (RefreshSender, RefreshReceiver) {
    let pending = Arc::new(AtomicBool::new(false));
    let notify = Arc::new(tokio::sync::Notify::new());
    (
        RefreshSender {
            pending: pending.clone(),
            notify: notify.clone(),
        },
        RefreshReceiver { pending, notify },
    )
}

pub const CONTINUATION_RETRY_DELAY_MS: i64 = 1_000;
pub const FAILURE_RETRY_BASE_MS: i64 = 10_000;
/// Marker included in stall-induced failure strings.
///
/// `detect_stalled_workers` appends this marker to synthetic failure messages,
/// and `handle_worker_completion` checks for it so stall-induced failures are
/// not treated as generic `failed` notification events.
const STALL_FAILURE_MARKER: &str = "without agent activity";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetryKind {
    Continuation,
    Failure,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeEvent {
    StartupCleanup,
    Reconcile,
    Validate,
    Dispatch,
    ValidationSkippedDispatch,
    RetryScheduled {
        issue_id: String,
        attempt: u32,
        due_at_ms: i64,
        token: String,
        retry_kind: RetryKind,
    },
    RetryIgnoredStale {
        issue_id: String,
        token: String,
    },
    WorkerCompleted {
        issue_id: String,
        issue_identifier: String,
        session_id: Option<String>,
    },
    WorkerFailed {
        issue_id: String,
        issue_identifier: String,
        session_id: Option<String>,
        error: String,
    },
    WorkerStalled {
        issue_id: String,
        issue_identifier: String,
        session_id: Option<String>,
        elapsed_ms: i64,
    },
    /// An HTTP refresh request was received and will trigger an immediate tick.
    RefreshRequested,
    /// An HTTP refresh request was received but coalesced with an already-pending
    /// refresh (no additional tick needed).
    RefreshCoalesced,
}

#[derive(Debug, Clone)]
pub struct DispatchedIssue {
    pub issue: Issue,
    pub attempt: Option<u32>,
    pub worker_host: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TickResult {
    pub dispatched_issue_ids: Vec<String>,
    pub dispatched_issues: Vec<DispatchedIssue>,
    pub dispatch_skipped: bool,
}

/// Result sent back from a spawned worker task to the orchestrator loop.
#[derive(Debug)]
pub struct WorkerResult {
    pub issue_id: String,
    pub completion: WorkerCompletion,
    pub events: Vec<AgentEvent>,
    pub metrics: Option<TurnMetrics>,
}

#[derive(Debug, Clone)]
struct PendingTerminalCleanup {
    issue: Issue,
    workspace_path: String,
}

#[derive(Debug, Clone)]
pub struct TurnMetrics {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub rate_limits: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default)]
pub struct RetryContext {
    pub worker_host: Option<String>,
    pub workspace_path: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct RunningSessionStats {
    turn_count: u32,
    last_activity_at: Option<DateTime<Utc>>,
    total_tokens: u64,
    last_event: Option<String>,
    last_event_message: Option<String>,
    session_id: Option<String>,
    /// Name of the tool currently executing (set on tool_start, cleared on tool_end).
    current_tool_name: Option<String>,
    /// Short preview of arguments for the currently executing tool.
    current_tool_args_preview: Option<String>,
}

#[derive(Debug, Clone)]
pub enum WorkerCompletion {
    Completed { schedule_continuation: bool },
    Failed { error: String },
}

pub trait OrchestratorPort {
    fn startup_terminal_issues(&mut self, terminal_states: &[String]) -> Result<Vec<Issue>>;

    fn reconcile_running_issues(&mut self, running_issue_ids: &[String]) -> Result<Vec<Issue>>;

    fn validate_dispatch_preflight(&mut self, config: &ServiceConfig) -> Result<()>;

    fn fetch_candidate_issues(&mut self) -> Result<Vec<Issue>>;

    fn refresh_issue(&mut self, issue_id: &str) -> Result<Option<Issue>>;

    /// Update an issue's workflow state in the tracker (e.g., move to "In Progress").
    fn update_issue_state(&mut self, issue_id: &str, state_name: &str) -> Result<()>;
}

/// S06 runtime authority loop state.
///
/// The orchestrator is the single mutable owner of dispatch/reconcile/retry
/// state in this process. State mutation only happens through `&mut self`
/// methods (startup cleanup, tick, retry handlers).
pub struct Orchestrator {
    workflow_store: Option<Arc<WorkflowStore>>,
    config: ServiceConfig,
    server_port_override: Option<u16>,
    state: OrchestratorState,
    events: Vec<RuntimeEvent>,
    retry_tokens: HashMap<String, String>,
    worker_last_activity_ms: HashMap<String, i64>,
    worker_session_info: HashMap<String, WorkerSessionInfo>,
    worker_session_ids: HashMap<String, String>,
    running_session_stats: HashMap<String, RunningSessionStats>,
    /// Blocked issues from the latest dispatch phase.
    blocked_issues: Vec<crate::domain::BlockedIssueEntry>,
    pending_terminal_cleanup: HashMap<String, PendingTerminalCleanup>,
    /// Normalized running issue state cache used for per-state slot accounting.
    running_issue_states: HashMap<String, String>,
    next_retry_token: u64,
    poll_count: u64,
    last_poll_at: Option<DateTime<Utc>>,
    /// Optional shared snapshot handle for HTTP read access.
    snapshot_handle: Option<SnapshotHandle>,
    /// Optional refresh receiver for HTTP control access.
    refresh_receiver: Option<RefreshReceiver>,
    /// Channel for receiving results from spawned worker tasks.
    worker_result_rx: tokio::sync::mpsc::UnboundedReceiver<WorkerResult>,
    /// Sender half cloned into each spawned worker task.
    worker_result_tx: tokio::sync::mpsc::UnboundedSender<WorkerResult>,
    /// Channel for receiving streamed worker events from spawned worker tasks.
    worker_event_rx: tokio::sync::mpsc::UnboundedReceiver<(String, AgentEvent)>,
    /// Sender half cloned into each spawned worker task for event streaming.
    worker_event_tx: tokio::sync::mpsc::UnboundedSender<(String, AgentEvent)>,
    /// The prompt template from the WORKFLOW.md body, used to render per-issue prompts.
    prompt_template: String,
}

impl Orchestrator {
    pub fn new_with_workflow_store(workflow_store: Arc<WorkflowStore>) -> Self {
        Self::new_with_workflow_store_and_port_override(workflow_store, None)
    }

    pub fn new_with_workflow_store_and_port_override(
        workflow_store: Arc<WorkflowStore>,
        server_port_override: Option<u16>,
    ) -> Self {
        let (workflow_def, config) = workflow_store.effective_config();
        Self::from_runtime_config(
            config,
            workflow_def.prompt_template,
            Some(workflow_store),
            server_port_override,
        )
    }

    pub fn new(config: ServiceConfig, prompt_template: String) -> Self {
        Self::from_runtime_config(config, prompt_template, None, None)
    }

    fn from_runtime_config(
        config: ServiceConfig,
        prompt_template: String,
        workflow_store: Option<Arc<WorkflowStore>>,
        server_port_override: Option<u16>,
    ) -> Self {
        let poll_interval_ms = config.polling.interval_ms;
        let max_concurrent_agents = config.agent.max_concurrent_agents;
        let (worker_result_tx, worker_result_rx) = tokio::sync::mpsc::unbounded_channel();
        let (worker_event_tx, worker_event_rx) = tokio::sync::mpsc::unbounded_channel();

        Self {
            workflow_store,
            config,
            server_port_override,
            state: OrchestratorState {
                poll_interval_ms,
                max_concurrent_agents,
                running: HashMap::new(),
                claimed: std::collections::HashSet::new(),
                retry_attempts: HashMap::new(),
                completed: HashMap::new(),
                codex_totals: CodexTotals::default(),
                codex_rate_limits: None,
            },
            events: vec![],
            retry_tokens: HashMap::new(),
            worker_last_activity_ms: HashMap::new(),
            worker_session_info: HashMap::new(),
            worker_session_ids: HashMap::new(),
            running_session_stats: HashMap::new(),
            blocked_issues: Vec::new(),
            pending_terminal_cleanup: HashMap::new(),
            running_issue_states: HashMap::new(),
            next_retry_token: 0,
            poll_count: 0,
            last_poll_at: None,
            snapshot_handle: None,
            refresh_receiver: None,
            worker_result_rx,
            worker_result_tx,
            worker_event_rx,
            worker_event_tx,
            prompt_template,
        }
    }

    fn refresh_runtime_config(&mut self) {
        if let Some(workflow_store) = self.workflow_store.as_ref() {
            let (workflow_def, config) = workflow_store.effective_config();
            self.config = config;
            self.prompt_template = workflow_def.prompt_template;
        }

        if let Some(port) = self.server_port_override {
            self.config.server.port = Some(port);
        }

        self.state.max_concurrent_agents = self.config.agent.max_concurrent_agents;
        self.state.poll_interval_ms = self.config.polling.interval_ms;
    }

    fn queue_slack_notification(
        &self,
        event_type: &str,
        issue_identifier: &str,
        issue_title: &str,
        message: &str,
        issue_url: Option<&str>,
    ) {
        let Some(slack_config) = self
            .config
            .notifications
            .as_ref()
            .and_then(|notifications| notifications.slack.as_ref())
            .cloned()
        else {
            return;
        };

        if !notifications::should_notify(&slack_config, event_type) {
            return;
        }

        let issue_identifier = issue_identifier.to_string();
        let issue_title = issue_title.to_string();
        let event_type = event_type.to_string();
        let message = message.to_string();
        let issue_url = issue_url.map(String::from);

        if let Ok(runtime_handle) = tokio::runtime::Handle::try_current() {
            runtime_handle.spawn(async move {
                if let Err(err) = notifications::send_slack_notification(
                    &slack_config,
                    &event_type,
                    &issue_identifier,
                    &issue_title,
                    &message,
                    issue_url.as_deref(),
                )
                .await
                {
                    tracing::warn!(
                        event = "notification_failed",
                        issue_identifier = %issue_identifier,
                        event_type = %event_type,
                        error = %err,
                        webhook_url = "[REDACTED]",
                        "failed to send Slack notification"
                    );
                }
            });
        } else {
            tracing::warn!(
                event = "notification_failed",
                issue_identifier = %issue_identifier,
                event_type = %event_type,
                error = "tokio runtime unavailable",
                "skipping Slack notification because no tokio runtime is active"
            );
        }
    }

    pub async fn run(&mut self, port: &mut dyn OrchestratorPort) -> Result<()> {
        self.startup_cleanup(port)?;
        self.publish_snapshot();
        let mut next_poll_due = tokio::time::Instant::now();
        let mut tick_requested = true;

        loop {
            let now = tokio::time::Instant::now();
            if tick_requested || now >= next_poll_due {
                self.refresh_runtime_config();

                let now_ms = Utc::now().timestamp_millis();
                let stall_timeout_ms =
                    backend_stall_timeout_ms(&self.config, self.config.agent_backend);

                self.detect_stalled_workers(now_ms, stall_timeout_ms);

                match self.tick_with_refresh(port, false) {
                    Ok(tick_result) => {
                        self.spawn_workers_for_dispatched(&tick_result.dispatched_issues, port);
                    }
                    Err(err) => {
                        tracing::warn!(
                            phase = "tick",
                            error = %err,
                            "orchestrator tick failed; continuing"
                        );
                    }
                }

                let retry_dispatched =
                    self.process_due_retries(port, Utc::now().timestamp_millis());
                self.spawn_workers_for_dispatched(&retry_dispatched, port);
                self.publish_snapshot();

                tick_requested = false;
                next_poll_due = tokio::time::Instant::now()
                    + Duration::from_millis(self.state.poll_interval_ms);
            }

            // Sleep until next poll deadline, but wake early on refresh request
            // or worker channels.
            let refresh_notify = self.refresh_receiver.as_ref().map(|r| r.notify.clone());

            tokio::select! {
                _ = tokio::time::sleep_until(next_poll_due) => {
                    tick_requested = true;
                },
                event = self.worker_event_rx.recv() => {
                    if let Some((issue_id, event)) = event {
                        self.ingest_agent_event(&issue_id, &event);
                        self.drain_ready_worker_events();
                        self.publish_snapshot();
                    }
                },
                result = self.worker_result_rx.recv() => {
                    if let Some(result) = result {
                        self.drain_ready_worker_events();
                        self.handle_worker_result(result);
                        self.publish_snapshot();
                    }
                    // Drain any additional ready results.
                    while let Ok(result) = self.worker_result_rx.try_recv() {
                        self.drain_ready_worker_events();
                        self.handle_worker_result(result);
                        self.publish_snapshot();
                    }
                    if self.drain_ready_worker_events() > 0 {
                        self.publish_snapshot();
                    }
                },
                _ = async {
                    if let Some(notify) = &refresh_notify {
                        notify.notified().await;
                    } else {
                        std::future::pending::<()>().await;
                    }
                } => {
                    if let Some(receiver) = &self.refresh_receiver {
                        if receiver.take_pending() {
                            tracing::info!(
                                event = "refresh_requested",
                                "HTTP refresh request woke orchestrator loop; triggering immediate tick"
                            );
                            self.events.push(RuntimeEvent::RefreshRequested);
                            tick_requested = true;
                        }
                    }
                },
            }
        }
    }

    /// Spawn a tokio task for each newly dispatched issue.
    fn spawn_workers_for_dispatched(
        &mut self,
        dispatched: &[DispatchedIssue],
        port: &mut dyn OrchestratorPort,
    ) {
        for d in dispatched {
            // Only move "Todo" issues to "In Progress" on dispatch.
            // Other active states (Agent Review, Merging, Rework, In Progress)
            // are preserved so the agent sees the correct state and follows
            // the matching workflow in WORKFLOW.md Step 0.
            if normalize_issue_state(&d.issue.state) == "todo" {
                if let Err(err) = port.update_issue_state(&d.issue.id, "In Progress") {
                    tracing::warn!(
                        event = "writeback_failed",
                        issue_id = %d.issue.id,
                        issue_identifier = %d.issue.identifier,
                        error = %err,
                        "failed to move issue to In Progress; continuing with dispatch"
                    );
                }
            }

            // Update status from "scheduled" to "running"
            if let Some(attempt) = self.state.running.get_mut(&d.issue.id) {
                attempt.status = "running".to_string();
            }
            let mut issue = d.issue.clone();
            let attempt = d.attempt;
            let worker_host = d.worker_host.clone();
            let tx = self.worker_result_tx.clone();

            // Use the post-dispatch state (after Todo→In Progress transition) so
            // the multi-turn loop's between-turn check compares against the actual
            // dispatched state, not the stale pre-transition state.
            let effective_state = self
                .running_issue_states
                .get(&issue.id)
                .cloned()
                .unwrap_or_else(|| issue.state.clone());
            issue.state = effective_state.clone();
            let prompt_template = self.resolve_prompt_for_state(&effective_state);

            let task_config = WorkerTaskConfig {
                workspace: self.config.workspace.clone(),
                hooks: self.config.hooks.clone(),
                codex: self.config.codex.clone(),
                pi_agent: self.config.pi_agent.clone(),
                agent_backend: self.config.agent_backend,
                max_turns: self.config.agent.max_turns,
                tracker: self.config.tracker.clone(),
                prompt_template,
                event_tx: self.worker_event_tx.clone(),
            };

            tokio::spawn(async move {
                let result =
                    run_worker_task(&issue, attempt, worker_host.as_deref(), &task_config).await;

                if let Err(err) = tx.send(result) {
                    tracing::error!(
                        error = %err,
                        "failed to send worker result back to orchestrator"
                    );
                }
            });
        }
    }

    /// Process a worker result received from a spawned worker task.
    fn handle_worker_result(&mut self, result: WorkerResult) {
        // Ingest agent events (for activity tracking, token accounting, etc.)
        for event in &result.events {
            self.ingest_agent_event(&result.issue_id, event);
        }

        // WorkerResult.metrics is retained as a completion summary payload.
        if let Some(metrics) = &result.metrics {
            tracing::info!(
                event = "worker_result_metrics_summary",
                issue_id = %result.issue_id,
                input_tokens = metrics.input_tokens,
                output_tokens = metrics.output_tokens,
                total_tokens = metrics.total_tokens,
                has_rate_limits = metrics.rate_limits.is_some(),
                "received worker result metrics summary"
            );
        }

        // Handle completion (schedules retry on failure, marks complete on success)
        self.handle_worker_completion(
            &result.issue_id,
            result.completion,
            Utc::now().timestamp_millis(),
        );
    }

    /// Drain any worker events already queued by spawned worker tasks.
    ///
    /// Returns the number of events ingested.
    fn drain_ready_worker_events(&mut self) -> usize {
        let mut drained = 0usize;
        while let Ok((issue_id, event)) = self.worker_event_rx.try_recv() {
            self.ingest_agent_event(&issue_id, &event);
            drained = drained.saturating_add(1);
        }
        drained
    }

    pub fn startup_cleanup(&mut self, port: &mut dyn OrchestratorPort) -> Result<()> {
        self.events.push(RuntimeEvent::StartupCleanup);
        tracing::info!(
            phase = "startup_cleanup",
            "running startup terminal cleanup"
        );

        let terminal_issues = port.startup_terminal_issues(&self.config.tracker.terminal_states)?;

        for issue in terminal_issues {
            self.mark_issue_terminal(&issue, None, false);
        }

        Ok(())
    }

    pub fn tick(&mut self, port: &mut dyn OrchestratorPort) -> Result<TickResult> {
        self.tick_with_refresh(port, true)
    }

    fn tick_with_refresh(
        &mut self,
        port: &mut dyn OrchestratorPort,
        refresh_runtime_config: bool,
    ) -> Result<TickResult> {
        self.poll_count += 1;
        self.last_poll_at = Some(Utc::now());
        self.blocked_issues.clear();

        if refresh_runtime_config {
            self.refresh_runtime_config();
        }

        self.events.push(RuntimeEvent::Reconcile);
        tracing::info!(phase = "reconcile", "starting orchestrator tick phase");
        self.reconcile_running(port)?;

        self.events.push(RuntimeEvent::Validate);
        tracing::info!(phase = "validate", "starting orchestrator tick phase");

        if let Err(err) = config::validate(&self.config) {
            tracing::warn!(
                phase = "dispatch",
                reason = "preflight_invalid",
                error = %err,
                "dispatch skipped due to invalid effective config"
            );
            self.events.push(RuntimeEvent::ValidationSkippedDispatch);
            return Ok(TickResult {
                dispatched_issue_ids: vec![],
                dispatched_issues: vec![],
                dispatch_skipped: true,
            });
        }

        if let Err(err) = port.validate_dispatch_preflight(&self.config) {
            tracing::warn!(
                phase = "dispatch",
                reason = "preflight_invalid",
                error = %err,
                "dispatch skipped due to preflight validation failure"
            );
            self.events.push(RuntimeEvent::ValidationSkippedDispatch);
            return Ok(TickResult {
                dispatched_issue_ids: vec![],
                dispatched_issues: vec![],
                dispatch_skipped: true,
            });
        }

        self.events.push(RuntimeEvent::Dispatch);
        tracing::info!(phase = "dispatch", "starting orchestrator tick phase");

        let candidates = port.fetch_candidate_issues()?;
        let sorted_candidates = self.sort_issues_for_dispatch(candidates);
        let candidate_ids: std::collections::HashSet<String> =
            sorted_candidates.iter().map(|i| i.id.clone()).collect();
        let mut dispatched_issue_ids = vec![];
        let mut dispatched_issues = vec![];
        let mut blocked_entries: Vec<crate::domain::BlockedIssueEntry> = vec![];

        // First pass: identify all dependency-blocked candidates so the blocked list
        // is complete regardless of slot availability. Uses is_candidate_for_blocked_check
        // instead of should_dispatch_issue because should_dispatch_issue rejects on
        // slot exhaustion — blocked issues need to show even when all slots are full.
        for candidate in &sorted_candidates {
            if !self.is_candidate_for_blocked_check(candidate) {
                continue;
            }
            let (dep_blocked, blocker_ids) =
                self.is_blocked_by_dependency(candidate, &sorted_candidates, &candidate_ids);
            if dep_blocked {
                blocked_entries.push(crate::domain::BlockedIssueEntry {
                    issue_id: candidate.id.clone(),
                    identifier: candidate.identifier.clone(),
                    title: candidate.title.clone(),
                    state: candidate.state.clone(),
                    blocker_identifiers: blocker_ids,
                });
            }
        }

        // Second pass: dispatch non-blocked candidates until slots are exhausted.
        let blocked_ids: std::collections::HashSet<&str> = blocked_entries
            .iter()
            .map(|e| e.issue_id.as_str())
            .collect();

        for candidate in &sorted_candidates {
            if self.available_slots() == 0 {
                tracing::debug!(
                    phase = "dispatch",
                    reason = "slot_full",
                    "global concurrency slots exhausted"
                );
                break;
            }

            if !self.should_dispatch_issue(candidate) {
                tracing::debug!(
                    phase = "dispatch",
                    reason = "blocked",
                    issue_id = %candidate.id,
                    issue_identifier = %candidate.identifier,
                    "candidate rejected before refresh"
                );
                continue;
            }

            // Skip dependency-blocked candidates (already collected above)
            if blocked_ids.contains(candidate.id.as_str()) {
                continue;
            }

            let Some(refreshed_issue) = port.refresh_issue(&candidate.id)? else {
                tracing::debug!(
                    phase = "dispatch",
                    reason = "blocked",
                    issue_id = %candidate.id,
                    issue_identifier = %candidate.identifier,
                    "candidate missing at pre-dispatch refresh"
                );
                continue;
            };

            if !self.should_dispatch_issue(&refreshed_issue) {
                tracing::debug!(
                    phase = "dispatch",
                    reason = "blocked",
                    issue_id = %refreshed_issue.id,
                    issue_identifier = %refreshed_issue.identifier,
                    "candidate rejected after pre-dispatch refresh"
                );
                continue;
            }

            // Select an SSH host (or local) for this fresh dispatch.
            let host_selection = self.select_worker_host(None);
            if matches!(host_selection, WorkerHostSelection::NoneAvailable) {
                tracing::warn!(
                    event = "ssh_pool_exhausted",
                    issue_id = %refreshed_issue.id,
                    issue_identifier = %refreshed_issue.identifier,
                    "SSH host pool exhausted, deferring dispatch"
                );
                continue;
            }
            let worker_host = match host_selection {
                WorkerHostSelection::Remote(ref host) => Some(host.clone()),
                _ => None,
            };
            self.dispatch_issue(&refreshed_issue, None, None, worker_host.clone());
            dispatched_issue_ids.push(refreshed_issue.id.clone());
            dispatched_issues.push(DispatchedIssue {
                issue: refreshed_issue,
                attempt: None,
                worker_host,
            });
        }

        // Store blocked issues for snapshot visibility
        self.blocked_issues = blocked_entries;

        Ok(TickResult {
            dispatched_issue_ids,
            dispatched_issues,
            dispatch_skipped: false,
        })
    }

    pub fn schedule_retry(
        &mut self,
        issue_id: &str,
        identifier: &str,
        attempt: u32,
        retry_kind: RetryKind,
        now_ms: i64,
        error: Option<String>,
    ) -> String {
        self.schedule_retry_with_context(
            issue_id,
            identifier,
            attempt,
            retry_kind,
            now_ms,
            error,
            RetryContext::default(),
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn schedule_retry_with_context(
        &mut self,
        issue_id: &str,
        identifier: &str,
        attempt: u32,
        retry_kind: RetryKind,
        now_ms: i64,
        error: Option<String>,
        context: RetryContext,
    ) -> String {
        self.next_retry_token += 1;
        let token = format!("retry-{}", self.next_retry_token);
        let due_at_ms = now_ms + self.retry_delay_ms(retry_kind, attempt);

        self.retry_tokens
            .insert(issue_id.to_string(), token.clone());

        self.state.retry_attempts.insert(
            issue_id.to_string(),
            RetryEntry {
                issue_id: issue_id.to_string(),
                identifier: identifier.to_string(),
                attempt,
                due_at_ms,
                timer_handle: Some(token.clone()),
                error: error.clone(),
                worker_host: context.worker_host.clone(),
                workspace_path: context.workspace_path.clone(),
            },
        );

        if let Some(session_id) = context.session_id.as_ref() {
            self.worker_session_ids
                .insert(issue_id.to_string(), session_id.clone());
        }

        tracing::info!(
            event = "retry_scheduled",
            issue_id = %issue_id,
            issue_identifier = %identifier,
            retry_kind = ?retry_kind,
            attempt,
            due_at_ms,
            token = %token,
            session_id = context.session_id.as_deref().unwrap_or("n/a"),
            worker_host = context.worker_host.as_deref().unwrap_or("local"),
            workspace_path = context.workspace_path.as_deref().unwrap_or("n/a"),
            error = error.as_deref().unwrap_or(""),
            "queued issue retry"
        );

        self.events.push(RuntimeEvent::RetryScheduled {
            issue_id: issue_id.to_string(),
            attempt,
            due_at_ms,
            token: token.clone(),
            retry_kind,
        });

        token
    }

    pub fn fire_retry(&mut self, issue_id: &str, token: &str) -> bool {
        let Some(current_token) = self.retry_tokens.get(issue_id).cloned() else {
            return false;
        };

        if current_token != token {
            tracing::info!(
                event = "retry_ignored_stale",
                issue_id = %issue_id,
                token = %token,
                current_token = %current_token,
                "ignored stale retry timer firing"
            );

            self.events.push(RuntimeEvent::RetryIgnoredStale {
                issue_id: issue_id.to_string(),
                token: token.to_string(),
            });
            return false;
        }

        self.retry_tokens.remove(issue_id);
        self.state.retry_attempts.remove(issue_id).is_some()
    }

    pub fn record_worker_activity(&mut self, issue_id: &str, timestamp_ms: i64) {
        self.worker_last_activity_ms
            .insert(issue_id.to_string(), timestamp_ms);
        if let Some(info) = self.worker_session_info.get_mut(issue_id) {
            info.last_activity_ms = Some(timestamp_ms);
        }
    }

    fn ensure_worker_session_info(&mut self, issue_id: &str) -> &mut WorkerSessionInfo {
        let max_turns = self.config.agent.max_turns.max(1);
        let stall_timeout_ms = backend_stall_timeout_ms(&self.config, self.config.agent_backend);
        let last_activity_ms = self.worker_last_activity_ms.get(issue_id).copied();
        let info = self
            .worker_session_info
            .entry(issue_id.to_string())
            .or_insert(WorkerSessionInfo {
                turn_count: 1,
                max_turns,
                stall_timeout_ms,
                last_activity_ms,
                session_tokens: SessionTokenUsage::default(),
                current_tool_name: None,
                current_tool_args_preview: None,
            });
        if info.max_turns == 0 {
            info.max_turns = max_turns;
        }
        if info.stall_timeout_ms <= 0 {
            info.stall_timeout_ms = stall_timeout_ms;
        }
        if info.turn_count == 0 {
            info.turn_count = 1;
        }
        if info.last_activity_ms.is_none() {
            info.last_activity_ms = last_activity_ms;
        }
        info
    }

    fn advance_turn_counter(&mut self, issue_id: &str) {
        let session_info = self.ensure_worker_session_info(issue_id);
        let max_turns = session_info.max_turns.max(1);
        let current = session_info.turn_count.max(1);
        session_info.turn_count = current.saturating_add(1).min(max_turns);
    }

    pub fn ingest_agent_event(&mut self, issue_id: &str, event: &AgentEvent) {
        if !self.state.running.contains_key(issue_id) {
            tracing::debug!(
                issue_id = %issue_id,
                event = %event_name(event),
                "ignored codex worker event for non-running issue"
            );
            return;
        }

        self.state.codex_totals.event_count = self.state.codex_totals.event_count.saturating_add(1);

        let _ = self.ensure_worker_session_info(issue_id);
        self.record_worker_activity(issue_id, event_timestamp_ms(event));
        let event_time = event_timestamp(event);

        if let Some(session_id) = event_session_id(event) {
            self.worker_session_ids
                .insert(issue_id.to_string(), session_id.to_string());
        }

        let (last_event, last_event_message) = event_summary(event);
        let session_stats = self
            .running_session_stats
            .entry(issue_id.to_string())
            .or_default();
        session_stats.last_activity_at = Some(event_time);
        session_stats.last_event = Some(last_event);
        session_stats.last_event_message = last_event_message;
        session_stats.session_id = self.worker_session_ids.get(issue_id).cloned();

        // Track current tool activity from events.
        let tool_activity = extract_tool_activity(event);
        match tool_activity {
            ToolActivity::Started { name, args_preview } => {
                session_stats.current_tool_name = Some(name.clone());
                session_stats.current_tool_args_preview = args_preview.clone();
                if let Some(info) = self.worker_session_info.get_mut(issue_id) {
                    info.current_tool_name = Some(name);
                    info.current_tool_args_preview = args_preview;
                }
            }
            ToolActivity::Ended => {
                session_stats.current_tool_name = None;
                session_stats.current_tool_args_preview = None;
                if let Some(info) = self.worker_session_info.get_mut(issue_id) {
                    info.current_tool_name = None;
                    info.current_tool_args_preview = None;
                }
            }
            ToolActivity::None => {}
        }

        if let Some(run_attempt) = self.state.running.get_mut(issue_id) {
            match event {
                AgentEvent::TurnFailed { error, .. }
                | AgentEvent::TurnEndedWithError { error, .. }
                | AgentEvent::StartupFailed { error, .. } => {
                    run_attempt.status = "failed".to_string();
                    run_attempt.error = Some(error.clone());
                }
                AgentEvent::TurnCancelled { .. } => {
                    run_attempt.status = "cancelled".to_string();
                }
                _ => {}
            }
        }

        if let AgentEvent::TurnCompleted {
            input_tokens,
            output_tokens,
            total_tokens,
            rate_limits,
            ..
        } = event
        {
            session_stats.turn_count = session_stats.turn_count.saturating_add(1);
            session_stats.total_tokens = session_stats.total_tokens.saturating_add(*total_tokens);
            let session_info = self
                .worker_session_info
                .get_mut(issue_id)
                .expect("session info must exist after ensure_worker_session_info");
            session_info.session_tokens.input_tokens = session_info
                .session_tokens
                .input_tokens
                .saturating_add(*input_tokens);
            session_info.session_tokens.output_tokens = session_info
                .session_tokens
                .output_tokens
                .saturating_add(*output_tokens);
            session_info.session_tokens.total_tokens = session_info
                .session_tokens
                .total_tokens
                .saturating_add(*total_tokens);
            self.advance_turn_counter(issue_id);
            self.apply_turn_metrics(&TurnMetrics {
                input_tokens: *input_tokens,
                output_tokens: *output_tokens,
                total_tokens: *total_tokens,
                rate_limits: rate_limits.clone(),
            });
        }

        tracing::debug!(
            issue_id = %issue_id,
            session_id = self
                .worker_session_ids
                .get(issue_id)
                .map(String::as_str)
                .unwrap_or("n/a"),
            event = %event_name(event),
            "ingested codex worker event"
        );
    }

    pub fn handle_worker_completion(
        &mut self,
        issue_id: &str,
        completion: WorkerCompletion,
        now_ms: i64,
    ) -> Option<String> {
        let Some(run_attempt) = self.state.running.remove(issue_id) else {
            if self.config.workspace.cleanup_on_done {
                if let Some(pending) = self.pending_terminal_cleanup.remove(issue_id) {
                    self.cleanup_workspace(&pending.issue, &pending.workspace_path);
                }
            } else {
                self.pending_terminal_cleanup.remove(issue_id);
            }
            return None;
        };
        self.state.claimed.remove(issue_id);
        // Keep running_issue_states until reconciliation — needed for
        // state-change notification detection on the next poll cycle.
        self.worker_last_activity_ms.remove(issue_id);
        self.running_session_stats.remove(issue_id);
        self.worker_session_info.remove(issue_id);

        let issue_identifier = run_attempt.issue_identifier.clone();
        let session_id = self.worker_session_ids.remove(issue_id);
        let retry_context = RetryContext {
            worker_host: run_attempt.worker_host.clone(),
            workspace_path: Some(run_attempt.workspace_path.clone()),
            session_id: session_id.clone(),
        };

        match completion {
            WorkerCompletion::Completed {
                schedule_continuation,
            } => {
                if !schedule_continuation {
                    self.state.completed.insert(
                        issue_id.to_string(),
                        CompletedEntry {
                            issue_id: issue_id.to_string(),
                            identifier: issue_identifier.clone(),
                            title: run_attempt.issue_title.clone().unwrap_or_default(),
                            completed_at: Some(Utc::now()),
                        },
                    );
                }

                tracing::info!(
                    event = "worker_completed",
                    issue_id = %issue_id,
                    issue_identifier = %issue_identifier,
                    session_id = session_id.as_deref().unwrap_or("n/a"),
                    schedule_continuation,
                    "worker attempt completed"
                );

                self.events.push(RuntimeEvent::WorkerCompleted {
                    issue_id: issue_id.to_string(),
                    issue_identifier: issue_identifier.clone(),
                    session_id,
                });

                if schedule_continuation {
                    Some(self.schedule_retry_with_context(
                        issue_id,
                        &issue_identifier,
                        1,
                        RetryKind::Continuation,
                        now_ms,
                        None,
                        retry_context,
                    ))
                } else {
                    self.state.retry_attempts.remove(issue_id);
                    None
                }
            }
            WorkerCompletion::Failed { error } => {
                self.state.completed.remove(issue_id);

                let attempt = run_attempt.attempt.unwrap_or(0).saturating_add(1).max(1);

                tracing::warn!(
                    event = "worker_failed",
                    issue_id = %issue_id,
                    issue_identifier = %issue_identifier,
                    session_id = session_id.as_deref().unwrap_or("n/a"),
                    attempt,
                    error = %error,
                    "worker attempt failed; scheduling failure retry"
                );

                self.events.push(RuntimeEvent::WorkerFailed {
                    issue_id: issue_id.to_string(),
                    issue_identifier: issue_identifier.clone(),
                    session_id,
                    error: error.clone(),
                });

                let issue_title = run_attempt
                    .issue_title
                    .clone()
                    .unwrap_or_else(|| issue_identifier.clone());
                let is_stall_failure = error.contains(STALL_FAILURE_MARKER);
                if !is_stall_failure {
                    self.queue_slack_notification(
                        "failed",
                        &issue_identifier,
                        &issue_title,
                        "Agent failed during execution.",
                        run_attempt.issue_url.as_deref(),
                    );
                }

                Some(self.schedule_retry_with_context(
                    issue_id,
                    &issue_identifier,
                    attempt,
                    RetryKind::Failure,
                    now_ms,
                    Some(error),
                    retry_context,
                ))
            }
        }
    }

    pub async fn execute_worker_attempt<E, EFut>(
        &mut self,
        issue: &Issue,
        prompt_template: &str,
        attempt: Option<u32>,
        graphql_executor: E,
    ) -> Result<()>
    where
        E: Fn(String, serde_json::Value) -> EFut + Clone + Send,
        EFut: Future<Output = Result<serde_json::Value>> + Send,
    {
        let workspace_info = workspace::ensure_workspace_for_issue(
            issue,
            &self.config.workspace,
            &self.config.hooks,
        )?;

        // Preserve the worker_host that dispatch_issue() already stored on the
        // scheduled RunAttempt (if present) so SSH dispatch is honoured here.
        let prior_worker_host = self
            .state
            .running
            .get(&issue.id)
            .and_then(|a| a.worker_host.clone());

        self.state.running.insert(
            issue.id.clone(),
            RunAttempt {
                issue_id: issue.id.clone(),
                issue_identifier: issue.identifier.clone(),
                issue_title: Some(issue.title.clone()),
                attempt,
                workspace_path: workspace_info.path.clone(),
                started_at: Utc::now(),
                status: "running".to_string(),
                error: None,
                worker_host: prior_worker_host.clone(),
                model: if self.config.agent_backend == AgentBackend::KataCli {
                    effective_pi_model_for_issue(&self.config, issue)
                } else {
                    None
                },
                linear_state: Some(issue.state.clone()),
                issue_url: issue.url.clone(),
            },
        );
        let _ = self.ensure_worker_session_info(&issue.id);
        self.state.claimed.insert(issue.id.clone());
        self.running_issue_states
            .insert(issue.id.clone(), normalize_issue_state(&issue.state));
        self.running_session_stats
            .entry(issue.id.clone())
            .or_insert_with(|| RunningSessionStats {
                turn_count: 0,
                last_activity_at: Some(Utc::now()),
                total_tokens: 0,
                last_event: None,
                last_event_message: None,
                session_id: None,
                current_tool_name: None,
                current_tool_args_preview: None,
            });
        self.state.retry_attempts.remove(&issue.id);

        let workspace_path = Path::new(&workspace_info.path);
        if let Err(err) =
            workspace::run_before_run_hook_for_issue(workspace_path, &self.config.hooks, issue)
        {
            self.handle_worker_completion(
                &issue.id,
                WorkerCompletion::Failed {
                    error: err.to_string(),
                },
                Utc::now().timestamp_millis(),
            );
            return Err(err);
        }

        let prompt = match prompt_builder::render_prompt(
            prompt_template,
            issue,
            attempt,
            self.config.workspace.base_branch.as_deref(),
        ) {
            Ok(prompt) => prompt,
            Err(err) => {
                self.handle_worker_completion(
                    &issue.id,
                    WorkerCompletion::Failed {
                        error: err.to_string(),
                    },
                    Utc::now().timestamp_millis(),
                );
                return Err(err);
            }
        };

        let loop_result = match self.config.agent_backend {
            AgentBackend::Codex => {
                let mut session = match app_server::start_session(
                    &self.config.codex,
                    issue,
                    workspace_path,
                    Path::new(&self.config.workspace.root),
                    prior_worker_host.as_deref(),
                    None,
                )
                .await
                {
                    Ok(session) => session,
                    Err(err) => {
                        self.handle_worker_completion(
                            &issue.id,
                            WorkerCompletion::Failed {
                                error: err.to_string(),
                            },
                            Utc::now().timestamp_millis(),
                        );
                        return Err(err);
                    }
                };

                tracing::info!(
                    event = "worker_started",
                    backend = "codex",
                    issue_id = %issue.id,
                    issue_identifier = %issue.identifier,
                    session_id = %session.session_id,
                    workspace_path = %workspace_info.path,
                    "worker attempt started"
                );

                let loop_result = run_codex_turns_in_session(
                    &mut session,
                    issue,
                    prompt.clone(),
                    self.config.agent.max_turns,
                    &self.config.tracker,
                    graphql_executor.clone(),
                    |_event| {},
                )
                .await;

                if let Err(err) = app_server::stop_session(session).await {
                    tracing::warn!(
                        issue_id = %issue.id,
                        issue_identifier = %issue.identifier,
                        error = %err,
                        "failed to stop codex session cleanly"
                    );
                }

                loop_result
            }
            AgentBackend::KataCli => {
                let mut session = match rpc_bridge::start_session(
                    &self.config.pi_agent,
                    issue,
                    workspace_path,
                    Path::new(&self.config.workspace.root),
                    prior_worker_host.as_deref(),
                    None,
                )
                .await
                {
                    Ok(session) => session,
                    Err(err) => {
                        self.handle_worker_completion(
                            &issue.id,
                            WorkerCompletion::Failed {
                                error: err.to_string(),
                            },
                            Utc::now().timestamp_millis(),
                        );
                        return Err(err);
                    }
                };

                tracing::info!(
                    event = "worker_started",
                    backend = "kata-cli",
                    issue_id = %issue.id,
                    issue_identifier = %issue.identifier,
                    session_id = %session.session_id,
                    workspace_path = %workspace_info.path,
                    "worker attempt started"
                );

                let loop_result = run_pi_turns_in_session(
                    &mut session,
                    issue,
                    prompt,
                    self.config.agent.max_turns,
                    &self.config.tracker,
                    |_event| {},
                )
                .await;

                if let Err(err) = rpc_bridge::stop_session(session).await {
                    tracing::warn!(
                        issue_id = %issue.id,
                        issue_identifier = %issue.identifier,
                        error = %err,
                        "failed to stop pi session cleanly"
                    );
                }

                loop_result
            }
        };

        let observed_events = match &loop_result {
            Ok(success) => &success.events,
            Err(failure) => &failure.events,
        };

        for event in observed_events {
            self.ingest_agent_event(&issue.id, event);
        }

        let _ = workspace::run_after_run_hook_for_issue(workspace_path, &self.config.hooks, issue);

        match loop_result {
            Ok(success) => {
                self.handle_worker_completion(
                    &issue.id,
                    WorkerCompletion::Completed {
                        schedule_continuation: success.schedule_continuation,
                    },
                    Utc::now().timestamp_millis(),
                );

                Ok(())
            }
            Err(failure) => {
                let error = failure.error;
                let error_text = error.to_string();
                self.handle_worker_completion(
                    &issue.id,
                    WorkerCompletion::Failed { error: error_text },
                    Utc::now().timestamp_millis(),
                );
                Err(error)
            }
        }
    }

    pub fn detect_stalled_workers(&mut self, now_ms: i64, stall_timeout_ms: i64) {
        let running_issue_ids: Vec<String> = self.state.running.keys().cloned().collect();

        for issue_id in running_issue_ids {
            let Some(run_attempt) = self.state.running.get(&issue_id).cloned() else {
                continue;
            };
            let per_session_stall_timeout_ms = self
                .worker_session_info
                .get(&issue_id)
                .map(|info| info.stall_timeout_ms)
                .filter(|timeout| *timeout > 0)
                .unwrap_or(stall_timeout_ms);
            if per_session_stall_timeout_ms <= 0 {
                continue;
            }

            let last_activity_ms = self
                .worker_last_activity_ms
                .get(&issue_id)
                .copied()
                .unwrap_or_else(|| run_attempt.started_at.timestamp_millis());

            let elapsed_ms = now_ms.saturating_sub(last_activity_ms);
            if elapsed_ms <= per_session_stall_timeout_ms {
                continue;
            }

            let session_id = self.worker_session_ids.get(&issue_id).cloned();

            tracing::warn!(
                event = "worker_stalled",
                issue_id = %issue_id,
                issue_identifier = %run_attempt.issue_identifier,
                session_id = session_id.as_deref().unwrap_or("n/a"),
                elapsed_ms,
                stall_timeout_ms = per_session_stall_timeout_ms,
                "detected stalled worker; scheduling failure retry"
            );

            self.events.push(RuntimeEvent::WorkerStalled {
                issue_id: issue_id.clone(),
                issue_identifier: run_attempt.issue_identifier.clone(),
                session_id,
                elapsed_ms,
            });

            let issue_title = run_attempt
                .issue_title
                .clone()
                .unwrap_or_else(|| run_attempt.issue_identifier.clone());
            self.queue_slack_notification(
                "stalled",
                &run_attempt.issue_identifier,
                &issue_title,
                &format!("No activity for {} seconds.", elapsed_ms / 1000),
                run_attempt.issue_url.as_deref(),
            );

            self.handle_worker_completion(
                &issue_id,
                WorkerCompletion::Failed {
                    error: format!("stalled for {elapsed_ms}ms {STALL_FAILURE_MARKER}"),
                },
                now_ms,
            );
        }
    }

    pub fn apply_turn_metrics(&mut self, metrics: &TurnMetrics) {
        self.state.codex_totals.input_tokens = self
            .state
            .codex_totals
            .input_tokens
            .saturating_add(metrics.input_tokens);
        self.state.codex_totals.output_tokens = self
            .state
            .codex_totals
            .output_tokens
            .saturating_add(metrics.output_tokens);
        self.state.codex_totals.total_tokens = self
            .state
            .codex_totals
            .total_tokens
            .saturating_add(metrics.total_tokens);

        if let Some(rate_limits) = metrics.rate_limits.clone() {
            self.state.codex_rate_limits = Some(rate_limit_info(rate_limits));
        }

        tracing::info!(
            event = "token_aggregate_updated",
            input_delta = metrics.input_tokens,
            output_delta = metrics.output_tokens,
            total_delta = metrics.total_tokens,
            input_total = self.state.codex_totals.input_tokens,
            output_total = self.state.codex_totals.output_tokens,
            total_total = self.state.codex_totals.total_tokens,
            has_rate_limits = metrics.rate_limits.is_some(),
            "updated codex aggregate token totals"
        );
    }

    pub fn events(&self) -> &[RuntimeEvent] {
        &self.events
    }

    pub fn state(&self) -> &OrchestratorState {
        &self.state
    }

    pub fn state_mut(&mut self) -> &mut OrchestratorState {
        &mut self.state
    }

    /// Create a shared snapshot handle for concurrent HTTP reads.
    ///
    /// The handle is pre-loaded with the current snapshot. The orchestrator
    /// retains an internal reference and publishes updates after every
    /// material state change. Returns a clone-cheap handle for HTTP use.
    pub fn create_snapshot_handle(&mut self) -> SnapshotHandle {
        let snapshot = self.snapshot(Utc::now().timestamp_millis());
        let handle = SnapshotHandle::new(snapshot);
        self.snapshot_handle = Some(handle.clone());
        handle
    }

    /// Create a refresh control channel.
    ///
    /// Returns the sender half (clone-cheap, for HTTP handlers). The
    /// orchestrator retains the receiver and checks it in its runtime loop.
    pub fn create_refresh_channel(&mut self) -> RefreshSender {
        let (sender, receiver) = refresh_channel();
        self.refresh_receiver = Some(receiver);
        sender
    }

    /// Publish the current snapshot to the shared handle (if created).
    ///
    /// Called after every material state change in the runtime loop.
    /// No-op if `create_snapshot_handle()` was never called.
    /// Resolve the prompt template for a given issue state, using per-state
    /// prompts if configured, otherwise falling back to the monolith prompt_template.
    fn resolve_prompt_for_state(&self, issue_state: &str) -> String {
        if let Some(prompts) = &self.config.prompts {
            let workflow_dir = self
                .workflow_store
                .as_ref()
                .map(|ws| ws.workflow_dir().to_path_buf())
                .unwrap_or_else(|| std::path::PathBuf::from("."));

            match prompt_builder::resolve_per_state_prompt(prompts, issue_state, &workflow_dir) {
                Ok(Some(template)) => {
                    tracing::debug!(
                        issue_state = %issue_state,
                        "resolved per-state prompt template"
                    );
                    return template;
                }
                Ok(None) => {
                    tracing::debug!(
                        issue_state = %issue_state,
                        "no per-state prompt for state; using monolith template"
                    );
                }
                Err(err) => {
                    tracing::warn!(
                        issue_state = %issue_state,
                        error = %err,
                        "failed to resolve per-state prompt; falling back to monolith template"
                    );
                }
            }
        }
        self.prompt_template.clone()
    }

    pub fn publish_snapshot(&self) {
        if let Some(handle) = &self.snapshot_handle {
            let snapshot = self.snapshot(Utc::now().timestamp_millis());
            handle.publish(snapshot);
        }
    }

    pub fn snapshot(&self, now_ms: i64) -> OrchestratorSnapshot {
        let running: BTreeMap<String, RunAttempt> = self
            .state
            .running
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        let running_sessions: BTreeMap<String, RunningSessionSnapshot> = self
            .state
            .running
            .iter()
            .map(|(issue_id, run_attempt)| {
                let stats = self.running_session_stats.get(issue_id);
                (
                    issue_id.clone(),
                    RunningSessionSnapshot {
                        turn_count: stats.map(|s| s.turn_count).unwrap_or(0),
                        last_activity_at: stats
                            .and_then(|s| s.last_activity_at)
                            .or(Some(run_attempt.started_at)),
                        total_tokens: stats.map(|s| s.total_tokens).unwrap_or(0),
                        last_event: stats.and_then(|s| s.last_event.clone()),
                        last_event_message: stats.and_then(|s| s.last_event_message.clone()),
                        session_id: stats.and_then(|s| s.session_id.clone()),
                        current_tool_name: stats.and_then(|s| s.current_tool_name.clone()),
                        current_tool_args_preview: stats
                            .and_then(|s| s.current_tool_args_preview.clone()),
                    },
                )
            })
            .collect();
        let running_session_info: BTreeMap<String, WorkerSessionInfo> = self
            .state
            .running
            .keys()
            .filter_map(|issue_id| {
                self.worker_session_info
                    .get(issue_id)
                    .map(|info| (issue_id.clone(), info.clone()))
            })
            .collect();

        let claimed: BTreeSet<String> = self.state.claimed.iter().cloned().collect();
        let mut completed: Vec<CompletedEntry> = self.state.completed.values().cloned().collect();
        completed.sort_by(|a, b| b.completed_at.cmp(&a.completed_at));

        let mut retry_queue: Vec<RetrySnapshotEntry> = self
            .state
            .retry_attempts
            .values()
            .map(|entry| RetrySnapshotEntry {
                issue_id: entry.issue_id.clone(),
                identifier: entry.identifier.clone(),
                attempt: entry.attempt,
                due_in_ms: entry.due_at_ms - now_ms,
                error: entry.error.clone(),
                worker_host: entry.worker_host.clone(),
                workspace_path: entry.workspace_path.clone(),
            })
            .collect();

        retry_queue.sort_by(|a, b| {
            a.due_in_ms
                .cmp(&b.due_in_ms)
                .then_with(|| a.identifier.cmp(&b.identifier))
        });

        OrchestratorSnapshot {
            poll_interval_ms: self.state.poll_interval_ms,
            max_concurrent_agents: self.state.max_concurrent_agents,
            linear_project_url: self.config.tracker.linear_project_url(),
            running,
            running_sessions,
            blocked: self.blocked_issues.clone(),
            running_session_info,
            claimed,
            retry_queue,
            completed,
            codex_totals: self.state.codex_totals.clone(),
            codex_rate_limits: self.state.codex_rate_limits.clone(),
            polling: PollingSnapshot {
                checking: false,
                next_poll_in_ms: self.state.poll_interval_ms as i64,
                poll_interval_ms: self.state.poll_interval_ms,
                last_poll_at: self.last_poll_at.map(|t| t.to_rfc3339()),
                poll_count: self.poll_count,
            },
        }
    }

    fn reconcile_running(&mut self, port: &mut dyn OrchestratorPort) -> Result<()> {
        let running_issue_ids: Vec<String> = self.state.running.keys().cloned().collect();
        let refreshed_issues = match port.reconcile_running_issues(&running_issue_ids) {
            Ok(issues) => issues,
            Err(err) => {
                tracing::warn!(
                    phase = "reconcile",
                    issue_count = running_issue_ids.len(),
                    error = %err,
                    "reconcile_running: failed to refresh running issues; keeping active workers"
                );
                return Ok(());
            }
        };

        let terminal_states = self.terminal_state_set();
        let active_states = self.active_state_set();
        let mut visible_issue_ids: HashSet<String> = HashSet::new();

        for issue in refreshed_issues {
            visible_issue_ids.insert(issue.id.clone());

            let normalized_state = normalize_issue_state(&issue.state);
            let previous_state = self.running_issue_states.get(&issue.id).cloned();

            if let Some(previous_state) = previous_state.as_deref() {
                if previous_state != normalized_state.as_str() {
                    // Convert normalized state (e.g. "human review") to event name
                    // (e.g. "human_review") by replacing spaces with underscores.
                    let event_name = normalized_state.replace(' ', "_");
                    let message = format!("Moved to {} (was {}).", issue.state, previous_state,);
                    self.queue_slack_notification(
                        &event_name,
                        &issue.identifier,
                        &issue.title,
                        &message,
                        issue.url.as_deref(),
                    );
                }
            }

            if terminal_states.contains(&normalized_state) {
                self.mark_issue_terminal(&issue, None, true);
                continue;
            }

            if !issue.assigned_to_worker || !active_states.contains(&normalized_state) {
                self.release_issue(&issue.id);
                continue;
            }

            self.running_issue_states
                .insert(issue.id.clone(), normalized_state);

            // Keep dashboard linear_state current with actual Linear state.
            if let Some(attempt) = self.state.running.get_mut(&issue.id) {
                attempt.linear_state = Some(issue.state.clone());
            }
        }

        for running_id in running_issue_ids {
            if !visible_issue_ids.contains(&running_id) {
                self.release_issue(&running_id);
            }
        }

        Ok(())
    }

    fn sort_issues_for_dispatch(&self, mut issues: Vec<Issue>) -> Vec<Issue> {
        issues.sort_by(|a, b| {
            priority_rank(a.priority)
                .cmp(&priority_rank(b.priority))
                .then_with(|| issue_created_at_sort_key(a).cmp(&issue_created_at_sort_key(b)))
                .then_with(|| issue_identifier_sort_key(a).cmp(&issue_identifier_sort_key(b)))
        });

        issues
    }

    /// Select a worker host from the SSH pool for the next dispatch attempt.
    ///
    /// - Returns `Local` when no SSH hosts are configured.
    /// - Returns `Remote(host)` with the preferred host when it is still under cap.
    /// - Returns `Remote(host)` with the least-loaded eligible host otherwise.
    /// - Returns `NoneAvailable` when all hosts are at or above the per-host cap.
    fn select_worker_host(&self, preferred: Option<&str>) -> WorkerHostSelection {
        if self.config.workspace.isolation == WorkspaceIsolation::Docker {
            return WorkerHostSelection::Local;
        }

        let ssh_hosts = &self.config.worker.ssh_hosts;
        let cap = self
            .config
            .worker
            .max_concurrent_agents_per_host
            .map(|c| c as usize)
            .unwrap_or(usize::MAX);

        let mut load: HashMap<String, usize> = HashMap::new();
        for attempt in self.state.running.values() {
            if let Some(host) = attempt.worker_host.as_deref() {
                *load.entry(host.to_string()).or_insert(0) += 1;
            }
        }

        ssh::select_worker_host(ssh_hosts, &load, cap, preferred)
    }

    /// Like `should_dispatch_issue` but without slot availability or claimed/running
    /// checks. Used by the first pass to identify blocked candidates for the TUI
    /// regardless of whether there are free slots or the issue is already queued.
    fn is_candidate_for_blocked_check(&self, issue: &Issue) -> bool {
        if !issue_has_required_fields(issue) {
            return false;
        }
        if !issue.assigned_to_worker {
            return false;
        }
        let normalized_state = normalize_issue_state(&issue.state);
        if self.terminal_state_set().contains(&normalized_state) {
            return false;
        }
        if !self.active_state_set().contains(&normalized_state) {
            return false;
        }
        true
    }

    fn should_dispatch_issue(&self, issue: &Issue) -> bool {
        if !issue_has_required_fields(issue) {
            return false;
        }

        if !issue.assigned_to_worker {
            return false;
        }

        let normalized_state = normalize_issue_state(&issue.state);

        if self.terminal_state_set().contains(&normalized_state) {
            return false;
        }

        if !self.active_state_set().contains(&normalized_state) {
            return false;
        }

        // NOTE: blocker checks are done at the dispatch loop level via
        // is_blocked_by_dependency() which needs access to all candidates.

        if self.state.claimed.contains(&issue.id) || self.state.running.contains_key(&issue.id) {
            return false;
        }

        if self.available_slots() == 0 {
            return false;
        }

        true
    }

    /// Returns `true` if the issue has at least one non-terminal blocker,
    /// meaning it should not be dispatched. Applies to **all** active states
    /// (not just Todo).
    ///
    /// Cross-project blockers (state = None) are treated as **non-blocking**
    /// with a warning, since Symphony cannot resolve them.
    ///
    /// When `candidate_ids` is provided, direct circular dependencies (A↔B)
    /// are detected and a warning is logged for observability. Note that the
    /// circular detection itself does not cause blocking — both issues are
    /// already blocked individually by the non-terminal blocker check above.
    fn is_blocked_by_dependency(
        &self,
        issue: &Issue,
        all_issues: &[Issue],
        candidate_ids: &std::collections::HashSet<String>,
    ) -> (bool, Vec<String>) {
        if issue.blocked_by.is_empty() {
            return (false, vec![]);
        }

        let terminal_states = self.terminal_state_set();
        let mut blocking_identifiers: Vec<String> = Vec::new();

        for blocker in &issue.blocked_by {
            let blocker_state = match &blocker.state {
                Some(s) => s,
                None => {
                    // Cross-project blocker — unknown state, treat as non-blocking
                    let blocker_id = blocker.identifier.as_deref().unwrap_or("unknown");
                    tracing::warn!(
                        event = "cross_project_blocker_ignored",
                        issue_id = %issue.id,
                        issue_identifier = %issue.identifier,
                        blocker_identifier = %blocker_id,
                        "blocker has no state info (cross-project?); treating as non-blocking"
                    );
                    continue;
                }
            };

            if terminal_states.contains(&normalize_issue_state(blocker_state)) {
                continue; // blocker resolved
            }

            // Non-terminal blocker — this issue is blocked
            let blocker_id = blocker
                .identifier
                .as_deref()
                .unwrap_or("unknown")
                .to_string();
            blocking_identifiers.push(blocker_id);
        }

        // Detect direct circular dependencies (A↔B) for observability.
        // NOTE: This block is purely informational — it does NOT cause blocking.
        // Both issues are already blocked naturally by the logic above: when A is
        // processed it sees B as a non-terminal blocker, and vice versa. The warning
        // simply makes circular relationships visible in logs for operators.
        if !blocking_identifiers.is_empty() {
            for blocker in &issue.blocked_by {
                if let Some(blocker_issue_id) = &blocker.id {
                    if candidate_ids.contains(blocker_issue_id) {
                        if let Some(blocker_issue) =
                            all_issues.iter().find(|i| i.id == *blocker_issue_id)
                        {
                            let reverse_blocked = blocker_issue
                                .blocked_by
                                .iter()
                                .any(|b| b.id.as_deref() == Some(&issue.id));
                            if reverse_blocked {
                                tracing::warn!(
                                    event = "circular_dependency_detected",
                                    issue_a = %issue.identifier,
                                    issue_b = %blocker_issue.identifier,
                                    "circular dependency detected between issues (both are \
                                     already blocked individually by the non-terminal blocker check above)"
                                );
                            }
                        }
                    }
                }
            }
        }

        let blocked = !blocking_identifiers.is_empty();
        if blocked {
            tracing::info!(
                event = "dispatch_blocked_by_dependency",
                issue_id = %issue.id,
                issue_identifier = %issue.identifier,
                blocker_identifiers = ?blocking_identifiers,
                "issue blocked by non-terminal dependencies; skipping dispatch"
            );
        }

        (blocked, blocking_identifiers)
    }

    fn available_slots(&self) -> u32 {
        self.state
            .max_concurrent_agents
            .saturating_sub(self.state.running.len() as u32)
    }

    fn retry_delay_ms(&self, retry_kind: RetryKind, attempt: u32) -> i64 {
        match retry_kind {
            RetryKind::Continuation => CONTINUATION_RETRY_DELAY_MS,
            RetryKind::Failure => {
                let max_backoff_ms =
                    self.config.agent.max_retry_backoff_ms.min(i64::MAX as u64) as i64;
                let safe_attempt = attempt.max(1);
                let power = safe_attempt.saturating_sub(1).min(10);
                let exponential = FAILURE_RETRY_BASE_MS.saturating_mul(1_i64 << power);
                exponential.min(max_backoff_ms)
            }
        }
    }

    fn dispatch_issue(
        &mut self,
        issue: &Issue,
        attempt: Option<u32>,
        workspace_path: Option<String>,
        worker_host: Option<String>,
    ) {
        let attempt = RunAttempt {
            issue_id: issue.id.clone(),
            issue_identifier: issue.identifier.clone(),
            issue_title: Some(issue.title.clone()),
            attempt,
            workspace_path: workspace_path
                .unwrap_or_else(|| self.default_workspace_path_for_issue(issue)),
            started_at: Utc::now(),
            status: "scheduled".to_string(),
            error: None,
            worker_host,
            model: if self.config.agent_backend == AgentBackend::KataCli {
                effective_pi_model_for_issue(&self.config, issue)
            } else {
                None
            },
            linear_state: Some(issue.state.clone()),
            issue_url: issue.url.clone(),
        };

        self.state.running.insert(issue.id.clone(), attempt);
        let _ = self.ensure_worker_session_info(&issue.id);
        self.state.claimed.insert(issue.id.clone());
        self.running_session_stats.insert(
            issue.id.clone(),
            RunningSessionStats {
                turn_count: 0,
                last_activity_at: Some(Utc::now()),
                total_tokens: 0,
                last_event: None,
                last_event_message: None,
                session_id: None,
                current_tool_name: None,
                current_tool_args_preview: None,
            },
        );
        self.state.retry_attempts.remove(&issue.id);
        self.running_issue_states
            .insert(issue.id.clone(), normalize_issue_state(&issue.state));
    }

    fn process_due_retries(
        &mut self,
        port: &mut dyn OrchestratorPort,
        now_ms: i64,
    ) -> Vec<DispatchedIssue> {
        let mut dispatched = Vec::new();
        let due_retries: Vec<RetryEntry> = self
            .state
            .retry_attempts
            .values()
            .filter(|entry| entry.due_at_ms <= now_ms)
            .cloned()
            .collect();

        for retry in due_retries {
            let Some(token) = retry.timer_handle.clone() else {
                continue;
            };

            if !self.fire_retry(&retry.issue_id, &token) {
                continue;
            }

            let retry_context = RetryContext {
                worker_host: retry.worker_host.clone(),
                workspace_path: retry.workspace_path.clone(),
                session_id: self.worker_session_ids.get(&retry.issue_id).cloned(),
            };

            let candidates = match port.fetch_candidate_issues() {
                Ok(issues) => issues,
                Err(err) => {
                    tracing::warn!(
                        event = "retry_poll_failed",
                        issue_id = %retry.issue_id,
                        issue_identifier = %retry.identifier,
                        error = %err,
                        "retry poll failed; rescheduling"
                    );

                    self.schedule_retry_with_context(
                        &retry.issue_id,
                        &retry.identifier,
                        retry.attempt.saturating_add(1),
                        RetryKind::Failure,
                        now_ms,
                        Some(format!("retry poll failed: {err}")),
                        retry_context,
                    );
                    continue;
                }
            };

            let Some(issue) = candidates
                .into_iter()
                .find(|issue| issue.id == retry.issue_id)
            else {
                let refreshed_issue = match port.refresh_issue(&retry.issue_id) {
                    Ok(issue) => issue,
                    Err(err) => {
                        tracing::warn!(
                            event = "retry_refresh_failed",
                            issue_id = %retry.issue_id,
                            issue_identifier = %retry.identifier,
                            error = %err,
                            "retry issue refresh failed; rescheduling"
                        );
                        self.schedule_retry_with_context(
                            &retry.issue_id,
                            &retry.identifier,
                            retry.attempt.saturating_add(1),
                            RetryKind::Failure,
                            now_ms,
                            Some(format!("retry refresh failed: {err}")),
                            retry_context,
                        );
                        continue;
                    }
                };

                if let Some(hidden_issue) = refreshed_issue {
                    let hidden_state = normalize_issue_state(&hidden_issue.state);
                    if self.terminal_state_set().contains(&hidden_state) {
                        tracing::debug!(
                            event = "retry_issue_terminal_after_refresh",
                            issue_id = %hidden_issue.id,
                            issue_identifier = %hidden_issue.identifier,
                            state = %hidden_state,
                            "retry issue became terminal before active-candidate visibility; marking terminal"
                        );
                        self.mark_issue_terminal(
                            &hidden_issue,
                            retry.workspace_path.as_deref(),
                            true,
                        );
                        continue;
                    }
                }

                tracing::debug!(
                    event = "retry_issue_not_visible",
                    issue_id = %retry.issue_id,
                    issue_identifier = %retry.identifier,
                    "retry issue not visible in active candidates; releasing claim"
                );
                self.release_issue(&retry.issue_id);
                continue;
            };

            let normalized_state = normalize_issue_state(&issue.state);
            if self.terminal_state_set().contains(&normalized_state) {
                self.mark_issue_terminal(&issue, retry.workspace_path.as_deref(), true);
                continue;
            }

            if self.should_dispatch_issue(&issue) {
                // Select an SSH host for retry, preferring the prior attempt's host.
                let host_selection = self.select_worker_host(retry.worker_host.as_deref());
                if matches!(host_selection, WorkerHostSelection::NoneAvailable) {
                    tracing::warn!(
                        event = "ssh_pool_exhausted_retry",
                        issue_id = %issue.id,
                        issue_identifier = %issue.identifier,
                        "SSH host pool exhausted on retry, deferring"
                    );
                    // Reschedule at continuation delay WITHOUT incrementing attempt —
                    // pool exhaustion is transient capacity pressure, not a worker
                    // failure, so we must not consume retry budget or apply
                    // exponential backoff.
                    self.schedule_retry_with_context(
                        &issue.id,
                        &issue.identifier,
                        retry.attempt,
                        RetryKind::Continuation,
                        now_ms,
                        Some("ssh pool exhausted".to_string()),
                        retry_context,
                    );
                    continue;
                }
                let worker_host = match host_selection {
                    WorkerHostSelection::Remote(ref host) => Some(host.clone()),
                    _ => None,
                };
                self.dispatch_issue(
                    &issue,
                    Some(retry.attempt),
                    retry.workspace_path.clone(),
                    worker_host.clone(),
                );
                dispatched.push(DispatchedIssue {
                    issue,
                    attempt: Some(retry.attempt),
                    worker_host,
                });
                continue;
            }

            if !self.active_state_set().contains(&normalized_state) {
                tracing::debug!(
                    event = "retry_issue_inactive",
                    issue_id = %issue.id,
                    issue_identifier = %issue.identifier,
                    state = %normalized_state,
                    "retry issue left active states; releasing claim"
                );
                self.release_issue(&issue.id);
                continue;
            }

            tracing::debug!(
                event = "retry_no_slots",
                issue_id = %issue.id,
                issue_identifier = %issue.identifier,
                "retry issue blocked by orchestrator slot constraints; rescheduling"
            );

            self.schedule_retry_with_context(
                &issue.id,
                &issue.identifier,
                retry.attempt.saturating_add(1),
                RetryKind::Failure,
                now_ms,
                Some("no available orchestrator slots".to_string()),
                retry_context,
            );
        }

        dispatched
    }

    fn default_workspace_path_for_issue(&self, issue: &Issue) -> String {
        let safe_identifier = path_safety::sanitize_identifier(&issue.identifier);
        Path::new(&self.config.workspace.root)
            .join(safe_identifier)
            .to_string_lossy()
            .to_string()
    }

    fn mark_issue_terminal(
        &mut self,
        issue: &Issue,
        workspace_path_hint: Option<&str>,
        include_in_completed: bool,
    ) {
        let issue_id = issue.id.as_str();

        if self.config.workspace.cleanup_on_done {
            let workspace_path = self
                .state
                .running
                .get(issue_id)
                .map(|attempt| attempt.workspace_path.clone())
                .or_else(|| {
                    self.state
                        .retry_attempts
                        .get(issue_id)
                        .and_then(|retry| retry.workspace_path.clone())
                })
                .or_else(|| workspace_path_hint.map(str::to_string));

            if let Some(workspace_path) = workspace_path {
                if self.worker_session_ids.contains_key(issue_id) {
                    self.pending_terminal_cleanup.insert(
                        issue_id.to_string(),
                        PendingTerminalCleanup {
                            issue: issue.clone(),
                            workspace_path,
                        },
                    );
                    tracing::info!(
                        event = "terminal_workspace_cleanup_deferred_active_worker",
                        issue_id = %issue_id,
                        issue_identifier = %issue.identifier,
                        "deferring workspace cleanup until worker completion"
                    );
                } else {
                    self.pending_terminal_cleanup.remove(issue_id);
                    self.cleanup_workspace(issue, &workspace_path);
                }
            }
        }

        if include_in_completed {
            self.state.completed.insert(
                issue_id.to_string(),
                CompletedEntry {
                    issue_id: issue_id.to_string(),
                    identifier: issue.identifier.clone(),
                    title: issue.title.clone(),
                    completed_at: None,
                },
            );
        } else {
            self.state.completed.remove(issue_id);
        }
        self.state.running.remove(issue_id);
        self.state.claimed.remove(issue_id);
        self.state.retry_attempts.remove(issue_id);
        self.running_issue_states.remove(issue_id);
        self.retry_tokens.remove(issue_id);
        self.worker_last_activity_ms.remove(issue_id);
        self.worker_session_info.remove(issue_id);
        self.worker_session_ids.remove(issue_id);
        self.running_session_stats.remove(issue_id);
    }

    fn cleanup_workspace(&self, issue: &Issue, workspace_path: &str) {
        let workspace = Path::new(workspace_path);
        if !workspace.exists() {
            tracing::debug!(
                event = "terminal_workspace_cleanup_skipped_missing_path",
                issue_id = %issue.id,
                issue_identifier = %issue.identifier,
                workspace_path = %workspace.display(),
                "workspace cleanup skipped because path does not exist"
            );
            return;
        }

        match workspace::remove_workspace_for_issue(
            workspace,
            &self.config.workspace,
            &self.config.hooks,
            issue,
        ) {
            Ok(()) => {
                tracing::info!(
                    event = "terminal_workspace_cleanup_succeeded",
                    issue_id = %issue.id,
                    issue_identifier = %issue.identifier,
                    workspace_path = %workspace.display(),
                    "removed workspace after issue reached terminal state"
                );
            }
            Err(err) => {
                tracing::warn!(
                    event = "terminal_workspace_cleanup_failed",
                    issue_id = %issue.id,
                    issue_identifier = %issue.identifier,
                    workspace_path = %workspace.display(),
                    error = %err,
                    "workspace cleanup failed; continuing terminal transition"
                );
            }
        }
    }

    fn release_issue(&mut self, issue_id: &str) {
        self.state.running.remove(issue_id);
        self.state.claimed.remove(issue_id);
        self.state.retry_attempts.remove(issue_id);
        self.running_issue_states.remove(issue_id);
        self.retry_tokens.remove(issue_id);
        self.worker_last_activity_ms.remove(issue_id);
        self.worker_session_ids.remove(issue_id);
        self.running_session_stats.remove(issue_id);
    }

    fn active_state_set(&self) -> HashSet<String> {
        self.config
            .tracker
            .active_states
            .iter()
            .map(|state| normalize_issue_state(state))
            .filter(|state| !state.is_empty())
            .collect()
    }

    fn terminal_state_set(&self) -> HashSet<String> {
        self.config
            .tracker
            .terminal_states
            .iter()
            .map(|state| normalize_issue_state(state))
            .filter(|state| !state.is_empty())
            .collect()
    }
}

fn event_timestamp_ms(event: &AgentEvent) -> i64 {
    event_timestamp(event).timestamp_millis()
}

fn event_timestamp(event: &AgentEvent) -> DateTime<Utc> {
    match event {
        AgentEvent::SessionStarted { timestamp, .. }
        | AgentEvent::StartupFailed { timestamp, .. }
        | AgentEvent::TurnCompleted { timestamp, .. }
        | AgentEvent::TurnFailed { timestamp, .. }
        | AgentEvent::TurnCancelled { timestamp, .. }
        | AgentEvent::TurnEndedWithError { timestamp, .. }
        | AgentEvent::TurnInputRequired { timestamp, .. }
        | AgentEvent::ApprovalAutoApproved { timestamp, .. }
        | AgentEvent::ApprovalRequired { timestamp, .. }
        | AgentEvent::ToolCallCompleted { timestamp, .. }
        | AgentEvent::ToolCallFailed { timestamp, .. }
        | AgentEvent::ToolInputAutoAnswered { timestamp, .. }
        | AgentEvent::UnsupportedToolCall { timestamp, .. }
        | AgentEvent::Notification { timestamp, .. }
        | AgentEvent::OtherMessage { timestamp, .. }
        | AgentEvent::Malformed { timestamp, .. } => *timestamp,
    }
}

fn event_session_id(event: &AgentEvent) -> Option<&str> {
    match event {
        AgentEvent::SessionStarted { session_id, .. } => Some(session_id.as_str()),
        _ => None,
    }
}

fn event_name(event: &AgentEvent) -> &'static str {
    match event {
        AgentEvent::SessionStarted { .. } => "session_started",
        AgentEvent::StartupFailed { .. } => "startup_failed",
        AgentEvent::TurnCompleted { .. } => "turn_completed",
        AgentEvent::TurnFailed { .. } => "turn_failed",
        AgentEvent::TurnCancelled { .. } => "turn_cancelled",
        AgentEvent::TurnEndedWithError { .. } => "turn_ended_with_error",
        AgentEvent::TurnInputRequired { .. } => "turn_input_required",
        AgentEvent::ApprovalAutoApproved { .. } => "approval_auto_approved",
        AgentEvent::ApprovalRequired { .. } => "approval_required",
        AgentEvent::ToolCallCompleted { .. } => "tool_call_completed",
        AgentEvent::ToolCallFailed { .. } => "tool_call_failed",
        AgentEvent::ToolInputAutoAnswered { .. } => "tool_input_auto_answered",
        AgentEvent::UnsupportedToolCall { .. } => "unsupported_tool_call",
        AgentEvent::Notification { .. } => "notification",
        AgentEvent::OtherMessage { .. } => "other_message",
        AgentEvent::Malformed { .. } => "malformed",
    }
}

fn event_summary(event: &AgentEvent) -> (String, Option<String>) {
    let (name, message) = match event {
        AgentEvent::SessionStarted { session_id, .. } => (
            event_name(event).to_string(),
            Some(format!("session {}", compact_session_id(session_id))),
        ),
        AgentEvent::StartupFailed { error, .. } => {
            (event_name(event).to_string(), Some(error.clone()))
        }
        AgentEvent::TurnCompleted { message, .. } => (
            event_name(event).to_string(),
            Some(
                message
                    .clone()
                    .unwrap_or_else(|| "turn completed".to_string()),
            ),
        ),
        AgentEvent::TurnFailed { error, .. } => {
            (event_name(event).to_string(), Some(error.clone()))
        }
        AgentEvent::TurnCancelled { .. } => (
            event_name(event).to_string(),
            Some("turn cancelled".to_string()),
        ),
        AgentEvent::TurnEndedWithError { error, .. } => {
            (event_name(event).to_string(), Some(error.clone()))
        }
        AgentEvent::TurnInputRequired { prompt, .. } => (
            event_name(event).to_string(),
            prompt
                .clone()
                .or_else(|| Some("input required".to_string())),
        ),
        AgentEvent::ApprovalAutoApproved { tool_call, .. } => (
            event_name(event).to_string(),
            Some(format!("auto-approved {tool_call}")),
        ),
        AgentEvent::ApprovalRequired { method, .. } => (
            event_name(event).to_string(),
            Some(format!("approval required: {method}")),
        ),
        AgentEvent::ToolCallCompleted { tool_name, .. } => (
            event_name(event).to_string(),
            Some(format!("completed {tool_name}")),
        ),
        AgentEvent::ToolCallFailed { tool_name, .. } => {
            let message = tool_name
                .as_ref()
                .map(|name| format!("tool {name} failed"))
                .unwrap_or_else(|| "tool call failed".to_string());
            (event_name(event).to_string(), Some(message))
        }
        AgentEvent::ToolInputAutoAnswered { .. } => (
            event_name(event).to_string(),
            Some("tool input auto-answered".to_string()),
        ),
        AgentEvent::UnsupportedToolCall { tool_name, .. } => (
            event_name(event).to_string(),
            Some(format!("unsupported tool {tool_name}")),
        ),
        AgentEvent::Notification { message, .. } => notification_event_summary(message),
        AgentEvent::OtherMessage { raw, .. } => other_message_summary(raw),
        AgentEvent::Malformed {
            parse_error,
            raw_text,
            ..
        } => (
            event_name(event).to_string(),
            Some(format!(
                "malformed event: {parse_error}; {}",
                normalize_whitespace(raw_text)
            )),
        ),
    };

    (
        name,
        message
            .as_deref()
            .map(|value| truncate_for_display(value, 160))
            .filter(|value| !value.is_empty()),
    )
}

fn notification_event_summary(message: &str) -> (String, Option<String>) {
    let fallback_message = normalize_whitespace(message);
    let parsed = match serde_json::from_str::<serde_json::Value>(message) {
        Ok(parsed) => parsed,
        Err(_) => {
            return (
                "notification".to_string(),
                (!fallback_message.is_empty()).then_some(fallback_message),
            )
        }
    };

    let name = parsed
        .get("method")
        .and_then(|method| method.as_str())
        .unwrap_or("notification")
        .to_string();
    let summary = summarize_notification_payload(&name, &parsed).or_else(|| {
        parsed
            .get("params")
            .map(|params| normalize_whitespace(&params.to_string()))
    });

    (name, summary)
}

fn summarize_notification_payload(name: &str, payload: &serde_json::Value) -> Option<String> {
    if name.contains("token_count") {
        let input = first_u64_at_paths(
            payload,
            &[
                &["params", "tokenUsage", "total", "input_tokens"],
                &["params", "tokenUsage", "total", "inputTokens"],
                &[
                    "params",
                    "msg",
                    "payload",
                    "info",
                    "total_token_usage",
                    "input_tokens",
                ],
            ],
        );
        let output = first_u64_at_paths(
            payload,
            &[
                &["params", "tokenUsage", "total", "output_tokens"],
                &["params", "tokenUsage", "total", "outputTokens"],
                &[
                    "params",
                    "msg",
                    "payload",
                    "info",
                    "total_token_usage",
                    "output_tokens",
                ],
            ],
        );
        let total = first_u64_at_paths(
            payload,
            &[
                &["params", "tokenUsage", "total", "total_tokens"],
                &["params", "tokenUsage", "total", "totalTokens"],
                &[
                    "params",
                    "msg",
                    "payload",
                    "info",
                    "total_token_usage",
                    "total_tokens",
                ],
            ],
        );

        let mut pieces = Vec::new();
        if let Some(value) = input {
            pieces.push(format!("in {value}"));
        }
        if let Some(value) = output {
            pieces.push(format!("out {value}"));
        }
        if let Some(value) = total {
            pieces.push(format!("total {value}"));
        }
        if !pieces.is_empty() {
            return Some(format!("tokens {}", pieces.join(" / ")));
        }
    }

    payload
        .get("params")
        .and_then(find_preferred_text)
        .or_else(|| find_preferred_text(payload))
}

fn other_message_summary(raw: &serde_json::Value) -> (String, Option<String>) {
    let name = raw
        .get("method")
        .and_then(|method| method.as_str())
        .unwrap_or("other_message")
        .to_string();
    let summary = raw
        .get("params")
        .and_then(find_preferred_text)
        .or_else(|| find_preferred_text(raw));
    (name, summary)
}

fn find_preferred_text(value: &serde_json::Value) -> Option<String> {
    const MAX_TEXT_SEARCH_DEPTH: usize = 5;
    find_preferred_text_with_depth(value, MAX_TEXT_SEARCH_DEPTH)
}

fn find_preferred_text_with_depth(value: &serde_json::Value, depth: usize) -> Option<String> {
    if depth == 0 {
        return None;
    }

    match value {
        serde_json::Value::String(text) => {
            let normalized = normalize_whitespace(text);
            if normalized.is_empty() {
                None
            } else {
                Some(normalized)
            }
        }
        serde_json::Value::Object(map) => {
            for key in [
                "summary",
                "message",
                "text",
                "title",
                "command",
                "tool_name",
                "toolName",
                "name",
            ] {
                if let Some(found) = map
                    .get(key)
                    .and_then(|candidate| find_preferred_text_with_depth(candidate, depth - 1))
                {
                    return Some(found);
                }
            }

            map.values()
                .find_map(|candidate| find_preferred_text_with_depth(candidate, depth - 1))
        }
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|candidate| find_preferred_text_with_depth(candidate, depth - 1)),
        _ => None,
    }
}

fn first_u64_at_paths(value: &serde_json::Value, paths: &[&[&str]]) -> Option<u64> {
    paths
        .iter()
        .find_map(|path| value_at_path(value, path).and_then(integer_like))
}

fn value_at_path<'a>(value: &'a serde_json::Value, path: &[&str]) -> Option<&'a serde_json::Value> {
    let mut current = value;
    for segment in path {
        current = current.get(segment)?;
    }
    Some(current)
}

fn integer_like(value: &serde_json::Value) -> Option<u64> {
    match value {
        serde_json::Value::Number(number) => number.as_u64(),
        serde_json::Value::String(text) => text.trim().parse::<u64>().ok(),
        _ => None,
    }
}

fn normalize_issue_state(state_name: &str) -> String {
    state_name.trim().to_ascii_lowercase()
}

fn issue_has_required_fields(issue: &Issue) -> bool {
    !issue.id.trim().is_empty()
        && !issue.identifier.trim().is_empty()
        && !issue.title.trim().is_empty()
        && !issue.state.trim().is_empty()
}

fn priority_rank(priority: Option<i32>) -> i32 {
    match priority {
        Some(value) if (1..=4).contains(&value) => value,
        _ => 5,
    }
}

fn issue_created_at_sort_key(issue: &Issue) -> i64 {
    issue
        .created_at
        .map(|created_at| created_at.timestamp_micros())
        .unwrap_or(i64::MAX)
}

fn issue_identifier_sort_key(issue: &Issue) -> (&str, &str) {
    (issue.identifier.as_str(), issue.id.as_str())
}

pub fn rate_limit_info(data: serde_json::Value) -> RateLimitInfo {
    RateLimitInfo { data }
}

// ── Tool activity extraction ──────────────────────────────────────────

/// Represents the current tool activity state derived from an agent event.
enum ToolActivity {
    /// A tool started executing.
    Started {
        name: String,
        args_preview: Option<String>,
    },
    /// A tool finished executing.
    Ended,
    /// Event is unrelated to tool activity.
    None,
}

/// Maximum length for the tool args preview string.
const TOOL_ARGS_PREVIEW_MAX_LEN: usize = 120;

/// Extract tool activity information from an agent event.
///
/// Handles both Codex backend events (ToolCallCompleted/Failed) and
/// pi-agent RPC events (Notification messages with tool_start/tool_end prefixes).
fn extract_tool_activity(event: &AgentEvent) -> ToolActivity {
    match event {
        // Codex backend: tool calls complete in a single event (no start/end separation).
        // We don't set "started" for these since they arrive post-completion.
        AgentEvent::ToolCallCompleted { .. }
        | AgentEvent::ToolCallFailed { .. }
        | AgentEvent::UnsupportedToolCall { .. }
        | AgentEvent::TurnCompleted { .. }
        | AgentEvent::TurnFailed { .. }
        | AgentEvent::TurnCancelled { .. }
        | AgentEvent::TurnEndedWithError { .. } => ToolActivity::Ended,

        // Pi-agent RPC: tool execution events arrive as Notification messages.
        AgentEvent::Notification { message, .. } => parse_tool_notification(message),

        _ => ToolActivity::None,
    }
}

/// Parse a pi-agent notification message for tool activity.
///
/// Messages follow the format:
/// - `"tool_start: <name> <args_json>"` — tool began executing
/// - `"tool_end: <name>"` — tool finished successfully
/// - `"tool_error: <name>"` — tool finished with error
fn parse_tool_notification(message: &str) -> ToolActivity {
    if let Some(rest) = message.strip_prefix("tool_start: ") {
        let (name, args) = match rest.find(' ') {
            Some(pos) => (&rest[..pos], Some(&rest[pos + 1..])),
            None => (rest, None),
        };
        let args_preview = args.map(|a| {
            let preview = build_tool_args_preview(a);
            truncate_for_display(&preview, TOOL_ARGS_PREVIEW_MAX_LEN)
        });
        ToolActivity::Started {
            name: name.to_string(),
            args_preview,
        }
    } else if message.starts_with("tool_end: ") || message.starts_with("tool_error: ") {
        ToolActivity::Ended
    } else {
        ToolActivity::None
    }
}

/// Build a human-readable preview of tool arguments from a JSON string.
///
/// For common tools, extracts the most meaningful argument:
/// - `bash`: shows the command
/// - `read`/`write`/`edit`: shows the path
/// - `browser_navigate`: shows the URL
/// - Others: shows a compact summary of top-level keys
fn build_tool_args_preview(args_json: &str) -> String {
    let parsed: serde_json::Value = match serde_json::from_str(args_json) {
        Ok(v) => v,
        Err(_) => return args_json.chars().filter(|c| !c.is_control()).collect(),
    };

    let obj = match parsed.as_object() {
        Some(o) => o,
        None => return args_json.to_string(),
    };

    // Extract the most meaningful field for common tools
    if let Some(cmd) = obj.get("command").and_then(|v| v.as_str()) {
        return cmd.to_string();
    }
    if let Some(path) = obj.get("path").and_then(|v| v.as_str()) {
        return path.to_string();
    }
    if let Some(url) = obj.get("url").and_then(|v| v.as_str()) {
        return url.to_string();
    }
    if let Some(query) = obj.get("query").and_then(|v| v.as_str()) {
        return query.to_string();
    }

    // Fallback: show keys
    let keys: Vec<&str> = obj.keys().map(|k| k.as_str()).collect();
    if keys.is_empty() {
        return "{}".to_string();
    }
    keys.join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn find_preferred_text_stops_searching_past_depth_limit() {
        let nested = json!({
            "level_1": {
                "level_2": {
                    "level_3": {
                        "level_4": {
                            "level_5": {
                                "message": "too deep"
                            }
                        }
                    }
                }
            }
        });

        assert_eq!(find_preferred_text(&nested), None);
    }

    #[test]
    fn parse_tool_notification_start_with_args() {
        let msg = r#"tool_start: bash {"command":"cargo test","timeout":60}"#;
        match parse_tool_notification(msg) {
            ToolActivity::Started { name, args_preview } => {
                assert_eq!(name, "bash");
                assert_eq!(args_preview.unwrap(), "cargo test");
            }
            other => panic!("expected Started, got {:?}", std::mem::discriminant(&other)),
        }
    }

    #[test]
    fn parse_tool_notification_start_no_args() {
        match parse_tool_notification("tool_start: read") {
            ToolActivity::Started { name, args_preview } => {
                assert_eq!(name, "read");
                assert!(args_preview.is_none());
            }
            other => panic!("expected Started, got {:?}", std::mem::discriminant(&other)),
        }
    }

    #[test]
    fn parse_tool_notification_end() {
        assert!(matches!(
            parse_tool_notification("tool_end: bash"),
            ToolActivity::Ended
        ));
    }

    #[test]
    fn parse_tool_notification_error() {
        assert!(matches!(
            parse_tool_notification("tool_error: bash"),
            ToolActivity::Ended
        ));
    }

    #[test]
    fn parse_tool_notification_unrelated() {
        assert!(matches!(
            parse_tool_notification("some other message"),
            ToolActivity::None
        ));
    }

    #[test]
    fn build_tool_args_preview_extracts_command() {
        let preview = build_tool_args_preview(r#"{"command":"cargo test --release"}"#);
        assert_eq!(preview, "cargo test --release");
    }

    #[test]
    fn build_tool_args_preview_extracts_path() {
        let preview = build_tool_args_preview(r#"{"path":"src/main.rs","offset":10}"#);
        assert_eq!(preview, "src/main.rs");
    }

    #[test]
    fn build_tool_args_preview_fallback_to_keys() {
        let preview = build_tool_args_preview("{\"selector\":\"btn\",\"text\":\"click\"}");
        assert_eq!(preview, "selector, text");
    }

    #[test]
    fn build_tool_args_preview_invalid_json() {
        let preview = build_tool_args_preview("not json");
        assert_eq!(preview, "not json");
    }

    #[test]
    fn build_tool_args_preview_strips_control_chars_on_invalid_json() {
        let preview = build_tool_args_preview("bad\x00json\nwith\tcontrol");
        assert_eq!(preview, "badjsonwithcontrol"); // all control chars stripped
    }

    #[test]
    fn extract_tool_activity_clears_on_turn_completed() {
        let event = AgentEvent::TurnCompleted {
            timestamp: chrono::Utc::now(),
            codex_app_server_pid: None,
            turn_id: "t1".to_string(),
            message: None,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            rate_limits: None,
        };
        assert!(matches!(extract_tool_activity(&event), ToolActivity::Ended));
    }

    #[test]
    fn extract_tool_activity_clears_on_turn_failed() {
        let event = AgentEvent::TurnFailed {
            timestamp: chrono::Utc::now(),
            codex_app_server_pid: None,
            turn_id: "t1".to_string(),
            error: "crash".to_string(),
        };
        assert!(matches!(extract_tool_activity(&event), ToolActivity::Ended));
    }
}
