#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod workspaces;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let workspace_state = workspaces::WorkspaceState::new(app_data_dir)?;
            app.manage(workspace_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspaces::commands::workspace_list,
            workspaces::commands::workspace_get_active_id,
            workspaces::commands::workspace_set_active,
            workspaces::commands::workspace_create_local,
            workspaces::commands::workspace_create_github,
            workspaces::commands::workspace_create_new_github,
            workspaces::commands::workspace_list_github_repos,
            workspaces::commands::workspace_list_known_repos,
            workspaces::commands::workspace_list_repo_pull_requests,
            workspaces::commands::workspace_list_repo_branches,
            workspaces::commands::workspace_list_repo_issues,
            workspaces::commands::workspace_create_from_source,
            workspaces::commands::workspace_pick_directory,
            workspaces::commands::workspace_archive,
            workspaces::commands::workspace_delete
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|err| {
            eprintln!("Fatal: failed to start Kata Cloud Agents: {err}");
            std::process::exit(1);
        });
}
