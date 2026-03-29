use crate::domain::TrackerConfig;

use super::client::GithubClient;

pub struct GithubAdapter {
    pub client: GithubClient,
    pub config: TrackerConfig,
}

impl GithubAdapter {
    pub fn new(client: GithubClient, config: TrackerConfig) -> Self {
        Self { client, config }
    }
}
