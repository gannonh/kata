use crate::error::Result;

#[derive(Clone)]
pub struct GithubClient {
    pub http_client: reqwest::Client,
    pub base_url: String,
    pub token: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub label_prefix: String,
}

impl GithubClient {
    pub fn new(token: impl Into<String>, repo_owner: impl Into<String>, repo_name: impl Into<String>, label_prefix: impl Into<String>) -> Self {
        Self {
            http_client: reqwest::Client::new(),
            base_url: "https://api.github.com".to_string(),
            token: token.into(),
            repo_owner: repo_owner.into(),
            repo_name: repo_name.into(),
            label_prefix: label_prefix.into(),
        }
    }

    pub fn with_base_url(
        token: impl Into<String>,
        repo_owner: impl Into<String>,
        repo_name: impl Into<String>,
        label_prefix: impl Into<String>,
        base_url: impl Into<String>,
    ) -> Self {
        Self {
            http_client: reqwest::Client::new(),
            base_url: base_url.into(),
            token: token.into(),
            repo_owner: repo_owner.into(),
            repo_name: repo_name.into(),
            label_prefix: label_prefix.into(),
        }
    }

    pub async fn health_check(&self) -> Result<()> {
        Ok(())
    }
}
