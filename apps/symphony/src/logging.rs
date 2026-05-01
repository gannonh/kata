use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use chrono::Utc;
use rolling_file::{RollingConditionBasic, RollingFileAppender};
use tracing_appender::non_blocking::{NonBlocking, WorkerGuard};

const LOG_SUBDIRECTORY: &str = "log";
const LOG_FILE_NAME: &str = "symphony.log";
const SESSION_LOG_PREFIX: &str = "symphony-";
const MAX_LOG_FILE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_LOG_FILES: usize = 5;
const MAX_SESSION_LOG_FILES: usize = 20;

fn log_file_path(logs_root: &Path) -> PathBuf {
    logs_root.join(LOG_SUBDIRECTORY).join(LOG_FILE_NAME)
}

/// The rolling-file `max_roll` argument counts only archived files and does
/// not include the active `symphony.log` file.
///
/// To retain `total_files` on disk overall (active + archived), pass
/// `total_files - 1` as `max_roll`.
fn rollover_file_limit(total_files: usize) -> usize {
    total_files.saturating_sub(1)
}

fn build_size_rotating_file_appender(
    logs_root: &Path,
    max_file_bytes: u64,
    max_total_files: usize,
) -> io::Result<RollingFileAppender<RollingConditionBasic>> {
    let log_file = log_file_path(logs_root);
    if let Some(log_dir) = log_file.parent() {
        fs::create_dir_all(log_dir)?;
        rotate_existing_session_log(&log_file, log_dir)?;
        prune_session_logs(log_dir, MAX_SESSION_LOG_FILES)?;
    }
    let condition = RollingConditionBasic::new().max_size(max_file_bytes);
    let rollover_files = rollover_file_limit(max_total_files);

    RollingFileAppender::new(log_file, condition, rollover_files)
}

fn rotate_existing_session_log(log_file: &Path, log_dir: &Path) -> io::Result<()> {
    match fs::metadata(log_file) {
        Ok(metadata) if metadata.is_file() && metadata.len() > 0 => {}
        Ok(_) => return Ok(()),
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(err),
    }

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let process_id = std::process::id();
    for index in 0..100 {
        let suffix = if index == 0 {
            String::new()
        } else {
            format!("-{index}")
        };
        let candidate = log_dir.join(format!(
            "{SESSION_LOG_PREFIX}{timestamp}-{process_id}{suffix}.log"
        ));
        if !candidate.exists() {
            fs::rename(log_file, candidate)?;
            return Ok(());
        }
    }

    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "unable to find available session log archive name",
    ))
}

fn prune_session_logs(log_dir: &Path, max_session_logs: usize) -> io::Result<()> {
    if max_session_logs == 0 {
        return Ok(());
    }

    let mut session_logs = Vec::new();
    for entry in fs::read_dir(log_dir)? {
        let entry = entry?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !is_session_log_file_name(&file_name) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        session_logs.push((modified, entry.path()));
    }

    if session_logs.len() <= max_session_logs {
        return Ok(());
    }

    session_logs.sort_by_key(|(modified, path)| (*modified, path.clone()));
    let remove_count = session_logs.len().saturating_sub(max_session_logs);
    for (_, path) in session_logs.into_iter().take(remove_count) {
        fs::remove_file(path)?;
    }

    Ok(())
}

fn is_session_log_file_name(file_name: &str) -> bool {
    file_name.starts_with(SESSION_LOG_PREFIX) && file_name.ends_with(".log")
}

pub fn build_non_blocking_file_writer(logs_root: &Path) -> io::Result<(NonBlocking, WorkerGuard)> {
    let appender = build_size_rotating_file_appender(logs_root, MAX_LOG_FILE_BYTES, MAX_LOG_FILES)?;
    Ok(
        tracing_appender::non_blocking::NonBlockingBuilder::default()
            .lossy(false)
            .finish(appender),
    )
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;

    use tempfile::tempdir;

    use super::{
        build_size_rotating_file_appender, is_session_log_file_name, log_file_path,
        prune_session_logs,
    };

    #[test]
    fn writes_logs_to_log_subdirectory_under_logs_root() {
        let logs_root = tempdir().expect("temp dir should be created");
        let mut appender = build_size_rotating_file_appender(logs_root.path(), 1024, 5)
            .expect("appender should build");

        writeln!(appender, "bootstrap log line").expect("write should succeed");
        appender.flush().expect("flush should succeed");

        let log_file = log_file_path(logs_root.path());
        assert!(
            log_file.is_file(),
            "expected log file at {}",
            log_file.display()
        );

        let contents = fs::read_to_string(&log_file).expect("log file should be readable");
        assert!(
            contents.contains("bootstrap log line"),
            "log file should contain written line, got: {contents}"
        );
    }

    #[test]
    fn rotates_at_size_and_keeps_five_total_files() {
        let logs_root = tempdir().expect("temp dir should be created");
        let mut appender = build_size_rotating_file_appender(logs_root.path(), 128, 5)
            .expect("appender should build");

        for _ in 0..64 {
            writeln!(appender, "{}", "X".repeat(32)).expect("write should succeed");
        }
        appender.flush().expect("flush should succeed");

        let log_dir = logs_root.path().join("log");
        let files: Vec<String> = fs::read_dir(&log_dir)
            .expect("log directory should exist")
            .map(|entry| {
                entry
                    .expect("directory entry should be readable")
                    .file_name()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();

        assert!(
            files.len() <= 5,
            "rotation should keep at most 5 files, found {} files: {:?}",
            files.len(),
            files
        );
        assert!(
            files.iter().any(|name| name == "symphony.log"),
            "active log file should exist; found files: {:?}",
            files
        );
        assert!(
            !files.iter().any(|name| name == "symphony.log.5"),
            "fifth rollover file should not exist when total file limit is 5; found files: {:?}",
            files
        );
    }

    #[test]
    fn rotates_existing_active_log_before_new_session() {
        let logs_root = tempdir().expect("temp dir should be created");
        let log_dir = logs_root.path().join("log");
        fs::create_dir_all(&log_dir).expect("log dir should be created");
        let log_file = log_file_path(logs_root.path());
        fs::write(&log_file, "previous session\n").expect("existing log should be written");

        let mut appender = build_size_rotating_file_appender(logs_root.path(), 1024, 5)
            .expect("appender should build");
        writeln!(appender, "current session").expect("write should succeed");
        appender.flush().expect("flush should succeed");

        let active_contents = fs::read_to_string(&log_file).expect("active log should be readable");
        assert!(
            active_contents.contains("current session"),
            "active log should contain current session, got: {active_contents}"
        );
        assert!(
            !active_contents.contains("previous session"),
            "active log should not append previous session, got: {active_contents}"
        );

        let archived_logs: Vec<_> = fs::read_dir(&log_dir)
            .expect("log directory should exist")
            .filter_map(|entry| {
                let entry = entry.expect("directory entry should be readable");
                let file_name = entry.file_name().to_string_lossy().to_string();
                is_session_log_file_name(&file_name).then_some(entry.path())
            })
            .collect();
        assert_eq!(
            archived_logs.len(),
            1,
            "expected one archived session log, found {:?}",
            archived_logs
        );
        let archived_contents =
            fs::read_to_string(&archived_logs[0]).expect("archive log should be readable");
        assert!(
            archived_contents.contains("previous session"),
            "archived log should contain previous session, got: {archived_contents}"
        );
    }

    #[test]
    fn prunes_old_session_logs_but_keeps_active_log() {
        let logs_root = tempdir().expect("temp dir should be created");
        let log_dir = logs_root.path().join("log");
        fs::create_dir_all(&log_dir).expect("log dir should be created");
        fs::write(log_dir.join("symphony.log"), "active").expect("active log should be written");
        for index in 0..4 {
            fs::write(
                log_dir.join(format!("symphony-20260101-00000{index}-123.log")),
                format!("session {index}"),
            )
            .expect("session log should be written");
        }

        prune_session_logs(&log_dir, 2).expect("prune should succeed");

        let files: Vec<String> = fs::read_dir(&log_dir)
            .expect("log directory should exist")
            .map(|entry| {
                entry
                    .expect("directory entry should be readable")
                    .file_name()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();
        let session_count = files
            .iter()
            .filter(|file_name| is_session_log_file_name(file_name))
            .count();

        assert_eq!(
            session_count, 2,
            "expected two retained session logs, found {:?}",
            files
        );
        assert!(
            files.iter().any(|file_name| file_name == "symphony.log"),
            "active log should not be pruned, found {:?}",
            files
        );
    }
}
