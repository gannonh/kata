use std::process::Command;

use crate::domain::TrackerConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GithubTokenSource {
    TrackerApiKey,
    GhTokenEnv,
    GithubTokenEnv,
    GhCli,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedGithubToken {
    pub token: String,
    pub source: GithubTokenSource,
}

const GITHUB_TOKEN_MISSING_MESSAGE: &str =
    "GitHub token required when tracker.kind is github. Set tracker.api_key, GH_TOKEN/GITHUB_TOKEN, or authenticate gh CLI via `gh auth login` (local fallback).";

pub fn github_token_missing_message() -> &'static str {
    GITHUB_TOKEN_MISSING_MESSAGE
}

pub fn resolve_github_token(tracker: &TrackerConfig) -> Option<ResolvedGithubToken> {
    tracker
        .api_key
        .as_ref()
        .map(|api_key| api_key.as_str().trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|token| ResolvedGithubToken {
            token,
            source: GithubTokenSource::TrackerApiKey,
        })
        .or_else(|| {
            std::env::var("GH_TOKEN")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .map(|token| ResolvedGithubToken {
                    token,
                    source: GithubTokenSource::GhTokenEnv,
                })
        })
        .or_else(|| {
            std::env::var("GITHUB_TOKEN")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .map(|token| ResolvedGithubToken {
                    token,
                    source: GithubTokenSource::GithubTokenEnv,
                })
        })
        .or_else(|| {
            resolve_github_token_from_gh_cli().map(|token| ResolvedGithubToken {
                token,
                source: GithubTokenSource::GhCli,
            })
        })
}

pub fn github_token_source_name(source: GithubTokenSource) -> &'static str {
    match source {
        GithubTokenSource::TrackerApiKey => "tracker.api_key",
        GithubTokenSource::GhTokenEnv => "GH_TOKEN",
        GithubTokenSource::GithubTokenEnv => "GITHUB_TOKEN",
        GithubTokenSource::GhCli => "gh auth token",
    }
}

fn resolve_github_token_from_gh_cli() -> Option<String> {
    if std::env::var("SYMPHONY_GITHUB_ENABLE_GH_CLI_FALLBACK")
        .ok()
        .as_deref()
        == Some("0")
    {
        return None;
    }

    let output = Command::new("gh")
        .args(["auth", "token"])
        .env("GH_PROMPT_DISABLED", "1")
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let token = String::from_utf8(output.stdout).ok()?.trim().to_string();
    if token.is_empty() {
        return None;
    }

    Some(token)
}

#[cfg(test)]
mod tests {
    use super::{resolve_github_token, GithubTokenSource};
    use crate::domain::{ApiKey, TrackerConfig};

    fn with_env<T>(values: &[(&str, Option<&str>)], f: impl FnOnce() -> T) -> T {
        let mut previous: Vec<(String, Option<String>)> = Vec::with_capacity(values.len());
        for (key, value) in values {
            previous.push(((*key).to_string(), std::env::var(key).ok()));
            match value {
                Some(value) => std::env::set_var(key, value),
                None => std::env::remove_var(key),
            }
        }

        let result = f();

        for (key, value) in previous {
            match value {
                Some(value) => std::env::set_var(&key, value),
                None => std::env::remove_var(&key),
            }
        }

        result
    }

    #[test]
    fn resolve_github_token_prefers_tracker_api_key() {
        with_env(
            &[
                ("SYMPHONY_GITHUB_ENABLE_GH_CLI_FALLBACK", Some("0")),
                ("GH_TOKEN", Some("gh-env")),
                ("GITHUB_TOKEN", Some("github-env")),
            ],
            || {
                let mut tracker = TrackerConfig::default();
                tracker.api_key = Some(ApiKey::new("config-token"));
                let resolved = resolve_github_token(&tracker).expect("token should resolve");
                assert_eq!(resolved.token, "config-token");
                assert_eq!(resolved.source, GithubTokenSource::TrackerApiKey);
            },
        );
    }

    #[test]
    fn resolve_github_token_prefers_gh_token_over_github_token() {
        with_env(
            &[
                ("SYMPHONY_GITHUB_ENABLE_GH_CLI_FALLBACK", Some("0")),
                ("GH_TOKEN", Some("gh-env")),
                ("GITHUB_TOKEN", Some("github-env")),
            ],
            || {
                let tracker = TrackerConfig::default();
                let resolved = resolve_github_token(&tracker).expect("token should resolve");
                assert_eq!(resolved.token, "gh-env");
                assert_eq!(resolved.source, GithubTokenSource::GhTokenEnv);
            },
        );
    }

    #[test]
    fn resolve_github_token_returns_none_when_no_sources_available() {
        with_env(
            &[
                ("SYMPHONY_GITHUB_ENABLE_GH_CLI_FALLBACK", Some("0")),
                ("GH_TOKEN", None),
                ("GITHUB_TOKEN", None),
            ],
            || {
                let tracker = TrackerConfig::default();
                let resolved = resolve_github_token(&tracker);
                assert!(resolved.is_none());
            },
        );
    }
}
