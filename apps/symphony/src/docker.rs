use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::process::Command;

use crate::domain::{DockerCodexAuth, DockerConfig, Issue};
use crate::error::{Result, SymphonyError};

pub type DockerAuthArgs = (Vec<(String, String)>, Vec<String>);
const ROOT_USER: &str = "root";
const ROOT_UID: &str = "0";
const SETUP_SCRIPT_PATH: &str = "/tmp/symphony-setup.sh";
const CODEX_AUTH_STAGING_PATH: &str = "/tmp/symphony-codex-auth.json";

/// Check if Docker daemon is reachable.
pub async fn is_docker_available() -> bool {
    Command::new("docker")
        .args(["info", "--format", "{{.ServerVersion}}"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|status| status.success())
        .unwrap_or(false)
}

/// Resolve the effective Docker image. If a setup script is configured,
/// build a derived image with the setup script as a RUN layer.
pub async fn resolve_image(base_image: &str, setup_script: Option<&str>) -> Result<String> {
    let Some(setup_script) = setup_script else {
        return Ok(base_image.to_string());
    };

    let setup_path = Path::new(setup_script);
    let setup_content = std::fs::read_to_string(setup_path).map_err(|err| {
        SymphonyError::DockerImageBuildFailed(format!(
            "failed to read setup script '{}': {err}",
            setup_path.display()
        ))
    })?;

    let tag = derived_image_tag(base_image, &setup_content);
    if image_exists(&tag).await {
        tracing::debug!(tag = %tag, "using cached derived docker image");
        return Ok(tag);
    }

    build_derived_image(base_image, &setup_content, &tag).await?;
    Ok(tag)
}

/// Compute a deterministic tag for a derived image from setup script content.
pub fn derived_image_tag(base_image: &str, setup_content: &str) -> String {
    const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;

    let mut hash = FNV_OFFSET_BASIS;

    for byte in base_image
        .as_bytes()
        .iter()
        .copied()
        .chain(std::iter::once(0))
        .chain(setup_content.as_bytes().iter().copied())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }

    format!("symphony-worker-{hash:016x}")
}

/// Compute a deterministic container name from an issue identifier.
pub fn container_name_from_issue(issue: &Issue) -> String {
    let mut ident: String = issue
        .identifier
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    ident = ident.trim_matches('-').to_string();
    if ident.is_empty() {
        "symphony-worker".to_string()
    } else {
        format!("symphony-{ident}")
    }
}

/// Check if a Docker image exists locally.
async fn image_exists(tag: &str) -> bool {
    Command::new("docker")
        .args(["image", "inspect", tag])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|status| status.success())
        .unwrap_or(false)
}

/// Build a derived image: base + RUN setup script.
async fn build_derived_image(base_image: &str, setup_content: &str, tag: &str) -> Result<()> {
    let build_dir = create_build_dir()?;
    let _build_dir_guard = TempBuildDirGuard(build_dir.clone());
    let dockerfile_path = build_dir.join("Dockerfile");
    let setup_path = build_dir.join("setup.sh");

    let base_image_user = image_default_user(base_image).await?;
    let dockerfile = derived_image_dockerfile(base_image, &base_image_user);
    std::fs::write(&dockerfile_path, dockerfile).map_err(SymphonyError::Io)?;
    std::fs::write(&setup_path, setup_content).map_err(SymphonyError::Io)?;

    let output = Command::new("docker")
        .arg("build")
        .arg("-t")
        .arg(tag)
        .arg("-f")
        .arg(dockerfile_path.as_os_str())
        .arg(build_dir.as_os_str())
        .output()
        .await
        .map_err(map_docker_io_error)?;

    if output.status.success() {
        tracing::info!(tag = %tag, base_image = %base_image, "built derived docker image");
        Ok(())
    } else {
        let details = command_output_summary(&output.stdout, &output.stderr, output.status.code());
        Err(SymphonyError::DockerImageBuildFailed(details))
    }
}

/// Start a Docker container for a worker session.
/// Returns the container ID.
pub async fn start_container(
    image: &str,
    issue: &Issue,
    config: &DockerConfig,
    env_vars: &[(&str, &str)],
) -> Result<String> {
    let (auth_env, auth_mounts) = resolve_codex_auth(config.codex_auth)?;
    let container_name = container_name_from_issue(issue);

    // Best-effort cleanup for stale containers from earlier interrupted runs.
    let _ = Command::new("docker")
        .arg("rm")
        .arg("-f")
        .arg(&container_name)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;

    let mut command = Command::new("docker");
    command
        .arg("run")
        .arg("-d")
        .arg("--rm")
        .arg("--name")
        .arg(&container_name)
        .arg("-w")
        .arg("/workspace");

    for (key, value) in env_vars {
        if !value.is_empty() {
            command.arg("-e").arg(format!("{key}={value}"));
        }
    }
    for env in &config.env {
        command.arg("-e").arg(env);
    }
    for (key, value) in auth_env {
        command.arg("-e").arg(format!("{key}={value}"));
    }
    for volume in auth_mounts.iter().chain(config.volumes.iter()) {
        command.arg("-v").arg(volume);
    }

    let output = command
        .arg(image)
        .arg("sleep")
        .arg("infinity")
        .output()
        .await
        .map_err(map_docker_io_error)?;

    if output.status.success() {
        let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if container_id.is_empty() {
            return Err(SymphonyError::DockerContainerFailed(
                "docker run succeeded but did not return a container id".to_string(),
            ));
        }

        if !auth_mounts.is_empty() {
            if let Err(err) = install_mounted_codex_auth(&container_id).await {
                let _ = stop_container(&container_id).await;
                return Err(err);
            }
        }

        Ok(container_id)
    } else {
        let details = command_output_summary(&output.stdout, &output.stderr, output.status.code());
        Err(SymphonyError::DockerContainerFailed(format!(
            "docker run failed: {details}"
        )))
    }
}

/// Stop and remove a Docker container.
pub async fn stop_container(container_id: &str) -> Result<()> {
    let output = Command::new("docker")
        .arg("rm")
        .arg("-f")
        .arg(container_id)
        .output()
        .await
        .map_err(map_docker_io_error)?;

    if output.status.success() {
        Ok(())
    } else {
        let details = command_output_summary(&output.stdout, &output.stderr, output.status.code());
        Err(SymphonyError::DockerContainerFailed(format!(
            "docker rm -f failed for {container_id}: {details}"
        )))
    }
}

/// Build a `tokio::process::Command` for `docker exec -i <container> sh -lc <cmd>`.
pub fn exec_command(container_id: &str, cmd: &str) -> Command {
    let mut command = Command::new("docker");
    command
        .arg("exec")
        .arg("-i")
        .arg(container_id)
        .arg("sh")
        .arg("-lc")
        .arg(cmd);
    command
}

/// Run a command inside the container and wait for completion.
pub async fn exec_in_container(container_id: &str, cmd: &str) -> Result<String> {
    let output = exec_command(container_id, cmd)
        .output()
        .await
        .map_err(map_docker_io_error)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout)
            .trim_end_matches('\n')
            .to_string())
    } else {
        let details = command_output_summary(&output.stdout, &output.stderr, output.status.code());
        Err(SymphonyError::DockerContainerFailed(format!(
            "docker exec failed in {container_id}: {details}"
        )))
    }
}

/// Resolve Codex auth arguments for container start.
/// Returns (env_vars, volume_mounts) to add to docker run.
pub fn resolve_codex_auth(auth_mode: DockerCodexAuth) -> Result<DockerAuthArgs> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let auth_json = codex_auth_json_path();
    let auth_mount = auth_json
        .as_ref()
        .map(|path| format!("{}:{CODEX_AUTH_STAGING_PATH}:ro", path.display()));

    match auth_mode {
        DockerCodexAuth::Auto => {
            if let Some(api_key) = api_key {
                Ok((vec![("OPENAI_API_KEY".to_string(), api_key)], vec![]))
            } else if let Some(mount) = auth_mount {
                Ok((vec![], vec![mount]))
            } else {
                Err(SymphonyError::DockerAuthError(
                    "Codex auth required: set OPENAI_API_KEY or authenticate via `codex auth`"
                        .to_string(),
                ))
            }
        }
        DockerCodexAuth::Mount => {
            if let Some(mount) = auth_mount {
                Ok((vec![], vec![mount]))
            } else {
                Err(SymphonyError::DockerAuthError(
                    "docker codex_auth=mount requires host ~/.codex/auth.json".to_string(),
                ))
            }
        }
        DockerCodexAuth::Env => {
            if let Some(api_key) = api_key {
                Ok((vec![("OPENAI_API_KEY".to_string(), api_key)], vec![]))
            } else {
                Err(SymphonyError::DockerAuthError(
                    "docker codex_auth=env requires OPENAI_API_KEY".to_string(),
                ))
            }
        }
    }
}

fn codex_auth_json_path() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let path = Path::new(&home).join(".codex").join("auth.json");
    path.exists().then_some(path)
}

async fn image_default_user(image: &str) -> Result<String> {
    if let Ok(user) = inspect_image_default_user(image).await {
        if user.is_empty() {
            return Ok(ROOT_USER.to_string());
        }
        return Ok(user);
    }

    let pull_output = Command::new("docker")
        .args(["pull", image])
        .output()
        .await
        .map_err(map_docker_io_error)?;
    if !pull_output.status.success() {
        let details = command_output_summary(
            &pull_output.stdout,
            &pull_output.stderr,
            pull_output.status.code(),
        );
        return Err(SymphonyError::DockerImageBuildFailed(format!(
            "failed to inspect base image '{image}' user and pull fallback failed: {details}"
        )));
    }

    let user = inspect_image_default_user(image).await?;
    if user.is_empty() {
        Ok(ROOT_USER.to_string())
    } else {
        Ok(user)
    }
}

async fn inspect_image_default_user(image: &str) -> Result<String> {
    let output = Command::new("docker")
        .args(["image", "inspect", "--format", "{{.Config.User}}", image])
        .output()
        .await
        .map_err(map_docker_io_error)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let details = command_output_summary(&output.stdout, &output.stderr, output.status.code());
        Err(SymphonyError::DockerImageBuildFailed(format!(
            "failed to inspect base image '{image}' user: {details}"
        )))
    }
}

fn derived_image_dockerfile(base_image: &str, base_image_user: &str) -> String {
    format!(
        "FROM {base_image}\n\
SHELL [\"/bin/sh\", \"-lc\"]\n\
USER {ROOT_USER}\n\
COPY setup.sh {SETUP_SCRIPT_PATH}\n\
RUN export HOME=/root && chmod +x {SETUP_SCRIPT_PATH} && {SETUP_SCRIPT_PATH} && rm -f {SETUP_SCRIPT_PATH}\n\
USER {base_image_user}\n"
    )
}

async fn install_mounted_codex_auth(container_id: &str) -> Result<()> {
    let identity = container_identity(container_id).await?;
    let script = codex_auth_install_script();
    let mut command = Command::new("docker");
    command
        .arg("exec")
        .arg("-i")
        .arg("-u")
        .arg(ROOT_UID)
        .arg("-e")
        .arg(format!("SYMPHONY_RUNTIME_UID={}", identity.uid))
        .arg("-e")
        .arg(format!("SYMPHONY_RUNTIME_GID={}", identity.gid));
    if let Some(home) = identity.home {
        command
            .arg("-e")
            .arg(format!("SYMPHONY_RUNTIME_HOME={home}"));
    }
    let output = command
        .arg(container_id)
        .arg("sh")
        .arg("-lc")
        .arg(script)
        .output()
        .await
        .map_err(map_docker_io_error)?;

    if output.status.success() {
        Ok(())
    } else {
        let details = command_output_summary(&output.stdout, &output.stderr, output.status.code());
        Err(SymphonyError::DockerAuthError(format!(
            "failed to install mounted Codex auth in container home: {details}"
        )))
    }
}

#[derive(Debug)]
struct ContainerIdentity {
    uid: String,
    gid: String,
    home: Option<String>,
}

async fn container_identity(container_id: &str) -> Result<ContainerIdentity> {
    let output = exec_in_container(
        container_id,
        "printf 'uid=%s\\ngid=%s\\nhome=%s\\n' \"$(id -u)\" \"$(id -g)\" \"${HOME:-}\"",
    )
    .await
    .map_err(|err| {
        SymphonyError::DockerAuthError(format!(
            "failed to resolve runtime user identity before auth install: {err}"
        ))
    })?;

    let mut uid: Option<String> = None;
    let mut gid: Option<String> = None;
    let mut home: Option<String> = None;

    for line in output.lines() {
        if let Some(value) = line.strip_prefix("uid=") {
            uid = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("gid=") {
            gid = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("home=") {
            home = Some(value.to_string());
        }
    }

    let uid = uid
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            SymphonyError::DockerAuthError(
                "failed to resolve runtime uid before auth install".to_string(),
            )
        })?;
    let gid = gid
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            SymphonyError::DockerAuthError(
                "failed to resolve runtime gid before auth install".to_string(),
            )
        })?;

    Ok(ContainerIdentity {
        uid,
        gid,
        home: home.filter(|value| !value.trim().is_empty()),
    })
}

fn codex_auth_install_script() -> String {
    format!(
        "set -eu\n\
auth_src=\"{CODEX_AUTH_STAGING_PATH}\"\n\
runtime_uid=\"${{SYMPHONY_RUNTIME_UID:-}}\"\n\
runtime_gid=\"${{SYMPHONY_RUNTIME_GID:-}}\"\n\
home_dir=\"${{SYMPHONY_RUNTIME_HOME:-}}\"\n\
if [ -z \"$home_dir\" ] && [ -n \"$runtime_uid\" ]; then\n\
  home_dir=\"$(getent passwd \"$runtime_uid\" | cut -d: -f6 2>/dev/null || true)\"\n\
fi\n\
if [ -z \"$home_dir\" ] && [ -n \"$runtime_uid\" ]; then\n\
  home_dir=\"$(grep \"^[^:]*:[^:]*:${{runtime_uid}}:\" /etc/passwd | cut -d: -f6 2>/dev/null || true)\"\n\
fi\n\
if [ -z \"$home_dir\" ]; then\n\
  home_dir=\"${{HOME:-}}\"\n\
fi\n\
if [ -z \"$home_dir\" ]; then\n\
  home_dir=\"$(cd && pwd)\"\n\
fi\n\
if [ -z \"$home_dir\" ]; then\n\
  echo \"failed to resolve container home directory\" >&2\n\
  exit 1\n\
fi\n\
mkdir -p \"$home_dir/.codex\"\n\
cp \"$auth_src\" \"$home_dir/.codex/auth.json\"\n\
if [ -n \"$runtime_uid\" ]; then\n\
  if [ -n \"$runtime_gid\" ]; then\n\
    chown \"$runtime_uid:$runtime_gid\" \"$home_dir/.codex\" \"$home_dir/.codex/auth.json\"\n\
  else\n\
    chown \"$runtime_uid\" \"$home_dir/.codex\" \"$home_dir/.codex/auth.json\"\n\
  fi\n\
fi\n\
chmod 600 \"$home_dir/.codex/auth.json\""
    )
}

fn create_build_dir() -> Result<PathBuf> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|err| SymphonyError::Other(format!("system clock error: {err}")))?
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "symphony-docker-build-{}-{nanos}",
        std::process::id()
    ));
    std::fs::create_dir_all(&dir).map_err(SymphonyError::Io)?;
    Ok(dir)
}

struct TempBuildDirGuard(PathBuf);

impl Drop for TempBuildDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn map_docker_io_error(err: std::io::Error) -> SymphonyError {
    if err.kind() == std::io::ErrorKind::NotFound {
        SymphonyError::DockerNotAvailable
    } else {
        SymphonyError::Io(err)
    }
}

fn command_output_summary(stdout: &[u8], stderr: &[u8], status: Option<i32>) -> String {
    let out = String::from_utf8_lossy(stdout);
    let err = String::from_utf8_lossy(stderr);
    let combined = crate::repo_url::redact_url_credentials(&format!("{out}{err}"));
    let trimmed = combined.trim();
    let message = if trimmed.is_empty() {
        "no output".to_string()
    } else {
        trimmed.chars().take(1_024).collect()
    };
    format!("status {}: {}", status.unwrap_or(-1), message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_output_summary_redacts_credentials() {
        let summary = command_output_summary(
            b"fatal: Authentication failed for https://user:token@github.com/org/repo\n",
            b"",
            Some(128),
        );

        assert!(
            !summary.contains("user:token@"),
            "summary leaked credentials"
        );
        assert!(
            summary.contains("https://[REDACTED]@github.com/org/repo"),
            "expected redacted URL in summary, got: {summary}"
        );
    }

    #[test]
    fn test_derived_image_dockerfile_runs_setup_as_root_then_restores_user() {
        let dockerfile = derived_image_dockerfile("symphony-worker:latest", "node");
        assert!(dockerfile.contains("FROM symphony-worker:latest"));
        assert!(dockerfile.contains("USER root"));
        assert!(dockerfile.contains("RUN export HOME=/root && chmod +x /tmp/symphony-setup.sh"));
        assert!(dockerfile.contains("USER node"));
    }

    #[test]
    fn test_codex_auth_install_script_uses_dynamic_home_path() {
        let script = codex_auth_install_script();
        assert!(script.contains("SYMPHONY_RUNTIME_UID"));
        assert!(script.contains("SYMPHONY_RUNTIME_HOME"));
        assert!(script.contains("chown \"$runtime_uid:$runtime_gid\""));
        assert!(script.contains("${HOME:-}"));
        assert!(script.contains("getent passwd"));
        assert!(script.contains(".codex/auth.json"));
        assert!(!script.contains("/root/.codex/auth.json"));
    }
}
