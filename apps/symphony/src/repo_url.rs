use regex::Regex;
use std::sync::OnceLock;

/// Returns true when a repo reference looks like a remote URL.
pub fn repo_is_remote(repo: &str) -> bool {
    repo.contains("://") || repo.contains('@')
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
        assert!(!repo_is_remote("/tmp/local-repo"));
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
