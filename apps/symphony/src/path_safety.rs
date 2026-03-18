//! Path safety utilities — sanitize identifiers and canonicalize paths
//! with segment-by-segment symlink resolution.
//!
//! This module provides Elixir `PathSafety` parity (spec §8.1):
//! - `sanitize_identifier`: replaces unsafe characters for filesystem paths
//! - `canonicalize`: resolves symlinks segment-by-segment, tolerating
//!   non-existent tail segments (unlike `std::fs::canonicalize`)

use regex::Regex;
use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;

use crate::error::{Result, SymphonyError};

/// Regex matching characters NOT in the safe set `[A-Za-z0-9._-]`.
static UNSAFE_CHARS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[^A-Za-z0-9._-]").expect("invalid regex"));

/// Replace characters outside `[A-Za-z0-9._-]` with `_`.
/// Empty or whitespace-only input returns `"issue"`.
pub fn sanitize_identifier(id: &str) -> String {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return "issue".to_string();
    }
    UNSAFE_CHARS.replace_all(trimmed, "_").into_owned()
}

/// Maximum number of symlink hops before we assume a cycle and bail out.
const MAX_SYMLINK_HOPS: u32 = 40;

/// Canonicalize a path by resolving symlinks segment-by-segment.
///
/// Unlike `std::fs::canonicalize`, this function tolerates non-existent
/// tail segments: it resolves the existing prefix via symlink traversal,
/// then appends any remaining segments literally.
///
/// Handles `.` (skip) and `..` (pop) components correctly, matching
/// Elixir `Path.expand` + `PathSafety.canonicalize/1` behavior.
/// Detects symlink cycles via a hop counter (max 40 hops).
pub fn canonicalize(path: &Path) -> Result<PathBuf> {
    // Expand to absolute path (resolve relative to cwd)
    let expanded = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(SymphonyError::Io)?
            .join(path)
    };

    // Split into root and segments, folding . and ..
    let (root, segments) = split_and_normalize(&expanded)?;

    let seg_refs: Vec<&std::ffi::OsStr> = segments.iter().map(|s| s.as_os_str()).collect();
    resolve_segments(&root, &[], &seg_refs, MAX_SYMLINK_HOPS)
}

/// Split an absolute path into root + normalized segments.
/// Handles `.` (skip) and `..` (pop last normal segment).
fn split_and_normalize(path: &Path) -> Result<(PathBuf, Vec<std::ffi::OsString>)> {
    let mut components = path.components();
    let root = match components.next() {
        Some(Component::RootDir) => PathBuf::from("/"),
        Some(Component::Prefix(p)) => {
            let mut r = PathBuf::from(p.as_os_str());
            if let Some(Component::RootDir) = components.clone().next() {
                components.next();
                r.push(std::path::MAIN_SEPARATOR_STR);
            }
            r
        }
        _ => {
            return Err(SymphonyError::Other(format!(
                "path_canonicalize_failed: not absolute: {}",
                path.display()
            )));
        }
    };

    let mut segments: Vec<std::ffi::OsString> = Vec::new();
    for c in components {
        match c {
            Component::Normal(s) => segments.push(s.to_os_string()),
            Component::ParentDir => {
                segments.pop();
            }
            Component::CurDir => { /* skip */ }
            _ => {}
        }
    }

    Ok((root, segments))
}

/// Recursively resolve path segments, following symlinks.
/// `hops_remaining` prevents infinite recursion on symlink cycles.
fn resolve_segments(
    root: &Path,
    resolved: &[&std::ffi::OsStr],
    remaining: &[&std::ffi::OsStr],
    hops_remaining: u32,
) -> Result<PathBuf> {
    if remaining.is_empty() {
        return Ok(join_path(root, resolved));
    }

    let segment = remaining[0];
    let rest = &remaining[1..];

    let candidate = {
        let mut parts: Vec<&std::ffi::OsStr> = resolved.to_vec();
        parts.push(segment);
        join_path(root, &parts)
    };

    // Use lstat (symlink_metadata) — does NOT follow symlinks
    match std::fs::symlink_metadata(&candidate) {
        Ok(meta) if meta.file_type().is_symlink() => {
            if hops_remaining == 0 {
                return Err(SymphonyError::Other(format!(
                    "symlink_loop: too many symlink hops resolving {}",
                    candidate.display()
                )));
            }

            // Read the symlink target
            let target = std::fs::read_link(&candidate).map_err(SymphonyError::Io)?;

            // Resolve relative symlink targets against the current resolved base
            let resolved_target = if target.is_absolute() {
                target
            } else {
                join_path(root, resolved).join(&target)
            };

            // Normalize the resolved target (handles . and .. in symlink targets)
            let (target_root, target_segments) = split_and_normalize(&resolved_target)?;

            // Combine target segments + remaining original segments
            let mut combined_owned: Vec<std::ffi::OsString> = target_segments;
            combined_owned.extend(rest.iter().map(|s| s.to_os_string()));

            let combined_refs: Vec<&std::ffi::OsStr> =
                combined_owned.iter().map(|s| s.as_os_str()).collect();

            resolve_segments(&target_root, &[], &combined_refs, hops_remaining - 1)
        }
        Ok(_) => {
            // Regular file or directory — add to resolved and continue
            let mut new_resolved: Vec<&std::ffi::OsStr> = resolved.to_vec();
            new_resolved.push(segment);
            resolve_segments(root, &new_resolved, rest, hops_remaining)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // Non-existent segment — return the joined path with remaining segments
            let mut all: Vec<&std::ffi::OsStr> = resolved.to_vec();
            all.push(segment);
            all.extend_from_slice(rest);
            Ok(join_path(root, &all))
        }
        Err(e) => Err(SymphonyError::Io(e)),
    }
}

/// Join root path with a slice of segments.
fn join_path(root: &Path, segments: &[&std::ffi::OsStr]) -> PathBuf {
    let mut path = root.to_path_buf();
    for seg in segments {
        path.push(seg);
    }
    path
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_replaces_unsafe() {
        assert_eq!(sanitize_identifier("MT/Det"), "MT_Det");
        assert_eq!(sanitize_identifier("S-1"), "S-1");
        assert_eq!(sanitize_identifier("hello world!"), "hello_world_");
        assert_eq!(sanitize_identifier("a/b\\c:d"), "a_b_c_d");
    }

    #[test]
    fn test_sanitize_empty() {
        assert_eq!(sanitize_identifier(""), "issue");
        assert_eq!(sanitize_identifier("  "), "issue");
    }

    #[test]
    fn test_sanitize_preserves_safe_chars() {
        assert_eq!(sanitize_identifier("abc-123.txt_v2"), "abc-123.txt_v2");
    }
}
