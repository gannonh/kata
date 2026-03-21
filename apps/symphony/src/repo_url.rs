use regex::Regex;
use std::sync::OnceLock;

/// Returns true when a repo reference looks like a remote URL.
pub fn repo_is_remote(repo: &str) -> bool {
    let repo = repo.trim();

    if repo.contains("://") {
        return true;
    }

    if is_windows_drive_path(repo) {
        return false;
    }

    if repo.starts_with('/') || repo.starts_with("./") || repo.starts_with("../") {
        return false;
    }

    if let Some((host, path)) = repo.split_once(':') {
        if !host.is_empty()
            && !path.is_empty()
            && !host.contains('/')
            && !host.contains('\\')
            && !host.ends_with('.')
        {
            return true;
        }
    }

    repo.contains('@')
}

fn is_windows_drive_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'/' || bytes[2] == b'\\')
}

/// Redacts URL user-info segments (`scheme://user[:pass]@host`) in command output.
pub fn redact_url_credentials(input: &str) -> String {
    static URL_USERINFO_RE: OnceLock<Regex> = OnceLock::new();
    let re = URL_USERINFO_RE.get_or_init(|| {
        Regex::new(r"([A-Za-z][A-Za-z0-9+.\-]*://)([^/@\s]+)@")
            .expect("repo URL redaction regex must compile")
    });
    re.replace_all(input, "$1[REDACTED]@").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_repo_is_remote() {
        assert!(repo_is_remote("https://github.com/org/repo.git"));
        assert!(repo_is_remote("git@github.com:org/repo.git"));
        assert!(repo_is_remote("github.example.com:org/repo.git"));
        assert!(repo_is_remote("my-ssh-host:org/repo.git"));
        assert!(!repo_is_remote("/tmp/local-repo"));
        assert!(!repo_is_remote("./local-repo"));
        assert!(!repo_is_remote("../local-repo"));
        assert!(!repo_is_remote("C:/work/repo"));
        assert!(!repo_is_remote("D:\\work\\repo"));
    }

    #[test]
    fn test_redact_url_credentials() {
        let output = "fatal: could not read from https://user:token@example.com/repo";
        let redacted = redact_url_credentials(output);
        assert!(
            redacted.contains("https://[REDACTED]@example.com/repo"),
            "expected URL credentials to be redacted, got: {redacted}"
        );
    }
}
