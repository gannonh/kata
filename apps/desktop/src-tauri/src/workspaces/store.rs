use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::model::{now_iso8601, KnownRepoOption, Workspace, WorkspaceSourceType, WorkspaceStatus};
use super::WorkspaceError;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRegistry {
    workspaces: Vec<Workspace>,
    active_workspace_id: Option<String>,
}

#[derive(Debug)]
pub struct WorkspaceStore {
    app_data_dir: PathBuf,
    registry: WorkspaceRegistry,
}

impl WorkspaceStore {
    pub fn new(app_data_dir: impl AsRef<Path>) -> Self {
        Self {
            app_data_dir: app_data_dir.as_ref().to_path_buf(),
            registry: WorkspaceRegistry::default(),
        }
    }

    pub fn load(app_data_dir: impl AsRef<Path>) -> Result<Self, WorkspaceError> {
        let mut store = Self::new(app_data_dir);
        let registry_path = store.registry_path();
        if registry_path.exists() {
            let content = fs::read_to_string(registry_path)?;
            store.registry = serde_json::from_str(&content)?;
        }
        Ok(store)
    }

    pub fn save(&self) -> Result<(), WorkspaceError> {
        let registry_path = self.registry_path();
        if let Some(parent) = registry_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let serialized = serde_json::to_string_pretty(&self.registry)?;
        fs::write(registry_path, serialized)?;
        Ok(())
    }

    pub fn list(&self) -> Vec<Workspace> {
        self.registry.workspaces.clone()
    }

    pub fn insert(&mut self, workspace: Workspace) {
        self.registry.workspaces.push(workspace);
    }

    pub fn set_active(&mut self, id: &str) -> Result<(), WorkspaceError> {
        let now = now_iso8601();
        let workspace = self
            .registry
            .workspaces
            .iter_mut()
            .find(|workspace| workspace.id == id)
            .ok_or_else(|| WorkspaceError::NotFound(format!("Workspace not found: {id}")))?;
        workspace.last_opened_at = Some(now.clone());
        workspace.updated_at = now;
        self.registry.active_workspace_id = Some(id.to_string());
        Ok(())
    }

    pub fn active_workspace_id(&self) -> Option<String> {
        self.registry.active_workspace_id.clone()
    }

    pub fn archive(&mut self, id: &str) -> Result<(), WorkspaceError> {
        let workspace = self
            .registry
            .workspaces
            .iter_mut()
            .find(|workspace| workspace.id == id)
            .ok_or_else(|| WorkspaceError::NotFound(format!("Workspace not found: {id}")))?;
        workspace.status = WorkspaceStatus::Archived;
        workspace.updated_at = now_iso8601();
        if self.registry.active_workspace_id.as_deref() == Some(id) {
            self.registry.active_workspace_id = None;
        }
        Ok(())
    }

    pub fn remove(&mut self, id: &str) -> Result<Workspace, WorkspaceError> {
        let index = self
            .registry
            .workspaces
            .iter()
            .position(|workspace| workspace.id == id)
            .ok_or_else(|| WorkspaceError::NotFound(format!("Workspace not found: {id}")))?;
        let removed = self.registry.workspaces.remove(index);
        if self.registry.active_workspace_id.as_deref() == Some(id) {
            self.registry.active_workspace_id = None;
        }
        Ok(removed)
    }

    pub fn registry_path(&self) -> PathBuf {
        self.app_data_dir
            .join("workspaces")
            .join("workspaces.json")
    }

    pub fn list_known_repos(&self, query: Option<&str>) -> Vec<KnownRepoOption> {
        let mut dedup = std::collections::HashMap::<String, KnownRepoOption>::new();
        for workspace in &self.registry.workspaces {
            if workspace.source_type != WorkspaceSourceType::Github {
                continue;
            }
            let Some(repo_id) = repo_id_from_source(&workspace.source) else {
                continue;
            };
            let candidate = KnownRepoOption {
                id: repo_id.clone(),
                name_with_owner: repo_id.clone(),
                url: format!("https://github.com/{repo_id}"),
                updated_at: workspace.updated_at.clone(),
            };
            match dedup.get(&repo_id) {
                Some(existing) if existing.updated_at >= candidate.updated_at => {}
                _ => {
                    dedup.insert(repo_id, candidate);
                }
            }
        }

        let normalized_query = query.unwrap_or_default().trim().to_lowercase();
        let mut repos = dedup
            .into_values()
            .filter(|repo| {
                if normalized_query.is_empty() {
                    return true;
                }
                let haystack = format!("{} {}", repo.name_with_owner, repo.url).to_lowercase();
                haystack.contains(&normalized_query)
            })
            .collect::<Vec<_>>();
        repos.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        repos.truncate(20);
        repos
    }
}

fn repo_id_from_source(source: &str) -> Option<String> {
    let parsed = url::Url::parse(source).ok()?;
    if parsed.host_str() != Some("github.com") {
        return None;
    }
    let mut segments = parsed
        .path()
        .trim_matches('/')
        .split('/')
        .map(|segment| segment.trim())
        .filter(|segment| !segment.is_empty());
    let owner = segments.next()?;
    let repo = segments.next()?.trim_end_matches(".git").trim_end_matches('/');
    if owner.is_empty() || repo.is_empty() {
        None
    } else {
        Some(format!("{owner}/{repo}"))
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;
    use crate::workspaces::model::{Workspace, WorkspaceSourceType};

    fn sample_workspace(id: &str) -> Workspace {
        Workspace {
            id: id.to_string(),
            name: "KAT-154".to_string(),
            source_type: WorkspaceSourceType::Local,
            source: "/tmp/repo".to_string(),
            repo_root_path: "/tmp/repo".to_string(),
            worktree_path: "/tmp/repo.worktrees/kat-154".to_string(),
            branch: "workspace/kat-154-ws1".to_string(),
            base_ref: Some("main".to_string()),
            status: WorkspaceStatus::Ready,
            created_at: now_iso8601(),
            updated_at: now_iso8601(),
            last_opened_at: None,
        }
    }

    #[test]
    fn saves_and_loads_workspace_registry() {
        let dir = tempdir().unwrap();
        let mut store = WorkspaceStore::new(dir.path());
        store.insert(sample_workspace("ws_1"));
        store.save().unwrap();

        let loaded = WorkspaceStore::load(dir.path()).unwrap();
        assert_eq!(loaded.list().len(), 1);
    }

    #[test]
    fn sets_active_workspace_id() {
        let dir = tempdir().unwrap();
        let mut store = WorkspaceStore::new(dir.path());
        store.insert(sample_workspace("ws_1"));
        store.set_active("ws_1").unwrap();
        assert_eq!(store.active_workspace_id(), Some("ws_1".to_string()));
    }

    #[test]
    fn set_active_returns_not_found_for_missing_id() {
        let dir = tempdir().unwrap();
        let store = &mut WorkspaceStore::new(dir.path());
        let err = store.set_active("ws_missing").unwrap_err();
        assert!(err.to_string().contains("not found"));
    }

    #[test]
    fn archive_sets_status_and_clears_active_when_archiving_active_workspace() {
        let dir = tempdir().unwrap();
        let mut store = WorkspaceStore::new(dir.path());
        store.insert(sample_workspace("ws_1"));
        store.set_active("ws_1").unwrap();
        assert_eq!(store.active_workspace_id(), Some("ws_1".to_string()));

        store.archive("ws_1").unwrap();

        let workspace = store.list().into_iter().find(|ws| ws.id == "ws_1").unwrap();
        assert_eq!(workspace.status, WorkspaceStatus::Archived);
        assert_eq!(store.active_workspace_id(), None);
    }

    #[test]
    fn archive_preserves_active_when_archiving_non_active_workspace() {
        let dir = tempdir().unwrap();
        let mut store = WorkspaceStore::new(dir.path());
        store.insert(sample_workspace("ws_1"));
        store.insert(sample_workspace("ws_2"));
        store.set_active("ws_2").unwrap();

        store.archive("ws_1").unwrap();

        assert_eq!(store.active_workspace_id(), Some("ws_2".to_string()));
    }

    #[test]
    fn archive_returns_not_found_for_missing_id() {
        let dir = tempdir().unwrap();
        let store = &mut WorkspaceStore::new(dir.path());
        let err = store.archive("ws_missing").unwrap_err();
        assert!(err.to_string().contains("not found"));
    }

    #[test]
    fn remove_returns_workspace_and_clears_active() {
        let dir = tempdir().unwrap();
        let mut store = WorkspaceStore::new(dir.path());
        store.insert(sample_workspace("ws_1"));
        store.set_active("ws_1").unwrap();

        let removed = store.remove("ws_1").unwrap();
        assert_eq!(removed.id, "ws_1");
        assert_eq!(store.active_workspace_id(), None);
        assert!(store.list().is_empty());
    }

    #[test]
    fn remove_preserves_active_when_removing_non_active_workspace() {
        let dir = tempdir().unwrap();
        let mut store = WorkspaceStore::new(dir.path());
        store.insert(sample_workspace("ws_1"));
        store.insert(sample_workspace("ws_2"));
        store.set_active("ws_2").unwrap();

        store.remove("ws_1").unwrap();

        assert_eq!(store.active_workspace_id(), Some("ws_2".to_string()));
        assert_eq!(store.list().len(), 1);
    }

    #[test]
    fn remove_returns_not_found_for_missing_id() {
        let dir = tempdir().unwrap();
        let store = &mut WorkspaceStore::new(dir.path());
        let err = store.remove("ws_missing").unwrap_err();
        assert!(err.to_string().contains("not found"));
    }

    #[test]
    fn repo_id_from_source_canonicalizes_owner_repo_shape() {
        assert_eq!(
            repo_id_from_source("https://github.com/kata-sh/kata-cloud-agents"),
            Some("kata-sh/kata-cloud-agents".to_string())
        );
        assert_eq!(
            repo_id_from_source("https://github.com/kata-sh/kata-cloud-agents/"),
            Some("kata-sh/kata-cloud-agents".to_string())
        );
        assert_eq!(
            repo_id_from_source("https://github.com/kata-sh/kata-cloud-agents.git/"),
            Some("kata-sh/kata-cloud-agents".to_string())
        );
        assert_eq!(
            repo_id_from_source("https://github.com/kata-sh/kata-cloud-agents/tree/main"),
            Some("kata-sh/kata-cloud-agents".to_string())
        );
        assert_eq!(
            repo_id_from_source("https://github.com/kata-sh"),
            None
        );
    }
}
