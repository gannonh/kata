use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use rolling_file::{RollingConditionBasic, RollingFileAppender};
use tracing_appender::non_blocking::{NonBlocking, WorkerGuard};

const LOG_SUBDIRECTORY: &str = "log";
const LOG_FILE_NAME: &str = "symphony.log";
const MAX_LOG_FILE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_LOG_FILES: usize = 5;

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
    }
    let condition = RollingConditionBasic::new().max_size(max_file_bytes);
    let rollover_files = rollover_file_limit(max_total_files);

    RollingFileAppender::new(log_file, condition, rollover_files)
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

    use super::{build_size_rotating_file_appender, log_file_path};

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
}
